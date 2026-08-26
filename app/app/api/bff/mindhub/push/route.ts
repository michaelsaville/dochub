import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyPortalHmac } from "@/lib/bff-hmac"
import { storeUploadedFile, isStoreError, MAX_SIZE } from "@/lib/files/store"

/**
 * POST /api/bff/mindhub/push  (HMAC-signed, cross-app)
 *
 * MindHub → DocHub hand-off. A captured note becomes either a client document
 * or files attached to an existing asset.
 *
 * ONE-WAY on purpose. Nothing flows back; two-way sync is a much larger
 * problem and buys nothing for capture-and-file.
 *
 * Files go through `storeUploadedFile`, the same pipeline every interactive
 * upload uses — size check, magic-byte MIME sniff, ClamAV, then the row. That
 * is not politeness: a screenshot arriving over a BFF is exactly as untrusted
 * as one arriving through the browser, and a second code path would be a
 * second place for those guarantees to drift. It is why this route builds a
 * `File` rather than writing bytes itself.
 *
 * Idempotency is the caller's job here, unlike the TicketHub side.
 * `ClientDocument` has no client-op column and `ClientAttachment.storageName`
 * is a random UUID chosen inside the store pipeline, so there is nothing for
 * the database to arbitrate on. MindHub records every push in its own
 * `PushTarget` table and refuses to send the same note to the same place
 * twice; this route additionally matches an existing document by its marker
 * line, so a retry that reaches here still cannot make a second document.
 * Attachments are NOT protected that way — see the note on the asset branch.
 *
 * Signed with MINDHUB_BFF_SECRET.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_FILES = 10

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)

type IncomingFile = { filename?: unknown; mimeType?: unknown; base64?: unknown }

export async function POST(req: Request) {
  const rawBody = await req.text()
  const verify = verifyPortalHmac(
    rawBody,
    req.headers.get("x-mindhub-signature"),
    req.headers.get("x-mindhub-timestamp"),
    process.env.MINDHUB_BFF_SECRET ?? "",
  )
  if (!verify.ok) {
    return NextResponse.json({ ok: false, error: verify.reason }, { status: verify.status })
  }

  let p: Record<string, unknown>
  try {
    p = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 })
  }

  const mode = str(p.mode)
  const opId = str(p.opId)
  const clientId = str(p.clientId)
  const body = typeof p.body === "string" ? p.body : ""

  if (mode !== "document" && mode !== "asset") {
    return NextResponse.json({ ok: false, error: "mode must be 'document' or 'asset'" }, { status: 400 })
  }
  if (!opId) {
    return NextResponse.json({ ok: false, error: "opId is required" }, { status: 400 })
  }
  if (!clientId) {
    return NextResponse.json({ ok: false, error: "clientId is required" }, { status: 400 })
  }

  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } })
  if (!client) {
    return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 })
  }

  const rawFiles = Array.isArray(p.files) ? (p.files as IncomingFile[]) : []
  if (rawFiles.length > MAX_FILES) {
    return NextResponse.json({ ok: false, error: `at most ${MAX_FILES} files` }, { status: 400 })
  }

  // Decode and size-check everything before writing anything, so a push with
  // one oversized file cannot half-land.
  const files: File[] = []
  for (const [i, f] of rawFiles.entries()) {
    const name = str(f.filename) ?? `file-${i + 1}`
    const b64 = typeof f.base64 === "string" ? f.base64 : ""
    if (!b64) {
      return NextResponse.json({ ok: false, error: `file ${i + 1} has no data` }, { status: 400 })
    }
    const buffer = Buffer.from(b64, "base64")
    if (buffer.byteLength === 0) {
      return NextResponse.json({ ok: false, error: `file ${i + 1} decoded to nothing` }, { status: 400 })
    }
    if (buffer.byteLength > MAX_SIZE) {
      return NextResponse.json(
        { ok: false, error: `${name} exceeds ${Math.round(MAX_SIZE / 1024 / 1024)}MB` },
        { status: 400 },
      )
    }
    files.push(
      new File([new Uint8Array(buffer)], name, {
        type: str(f.mimeType) ?? "application/octet-stream",
      }),
    )
  }

  const base = (process.env.NEXTAUTH_URL ?? "https://dochub.pcc2k.com").replace(/\/$/, "")

  // Do not reformat: the retry lookup below matches this line exactly.
  const marker = `mindhub-op: ${opId}`

  if (mode === "document") {
    const title = str(p.title)
    if (!title) {
      return NextResponse.json({ ok: false, error: "title is required" }, { status: 400 })
    }

    const folderId = str(p.folderId)
    if (folderId) {
      // A folder from another client would file this note in the wrong
      // customer's tree — the same forged-pairing defence the Jotter route
      // applies to location/client.
      const folder = await prisma.documentFolder.findFirst({
        where: { id: folderId, clientId: client.id },
        select: { id: true },
      })
      if (!folder) {
        return NextResponse.json({ ok: false, error: "folder not found for client" }, { status: 404 })
      }
    }

    let doc = await prisma.clientDocument.findFirst({
      where: { clientId: client.id, content: { contains: marker } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    })

    if (!doc) {
      doc = await prisma.clientDocument.create({
        data: {
          clientId: client.id,
          folderId: folderId ?? null,
          title: title.slice(0, 200),
          content: [body.trim(), "", "Captured in MindHub.", marker].join("\n"),
          // Default deny, like every other document. A note pushed from a
          // phone must never become customer-visible by accident.
          portalVisible: false,
        },
        select: { id: true },
      })
    }

    const attached = await attach(files, { clientId: client.id, documentId: doc.id })
    return NextResponse.json({
      ok: true,
      kind: "document",
      documentId: doc.id,
      attached,
      label: title.slice(0, 60),
      url: `${base}/clients/${client.id}/documents/${doc.id}`,
    })
  }

  const assetId = str(p.assetId)
  if (!assetId) {
    return NextResponse.json({ ok: false, error: "assetId is required" }, { status: 400 })
  }
  // Asset → Location → Client. Checking the asset alone would let a caller
  // attach one client's screenshot to another client's kit.
  const asset = await prisma.asset.findFirst({
    where: { id: assetId, location: { clientId: client.id } },
    select: { id: true, name: true },
  })
  if (!asset) {
    return NextResponse.json({ ok: false, error: "asset not found for client" }, { status: 404 })
  }
  if (files.length === 0) {
    return NextResponse.json({ ok: false, error: "no files to attach" }, { status: 400 })
  }

  // No marker to dedupe on: an attachment's storageName is a UUID minted
  // inside the store pipeline. MindHub's PushTarget row is what stops the same
  // note being sent twice, and it is written before the retry window opens.
  // A push retried after a network timeout CAN therefore duplicate a photo
  // here — stated rather than papered over, because the alternative (a
  // content hash column) is a migration on a live app this feature promised
  // not to need.
  const attached = await attach(files, {
    clientId: client.id,
    assetId: asset.id,
    notes: body.trim() ? `From MindHub: ${body.trim()}`.slice(0, 500) : null,
  })

  return NextResponse.json({
    ok: true,
    kind: "asset",
    assetId: asset.id,
    attached,
    label: asset.name,
    url: `${base}/assets/${asset.id}`,
  })
}

async function attach(
  files: File[],
  link: { clientId: string; documentId?: string; assetId?: string; notes?: string | null },
): Promise<number> {
  let n = 0
  for (const file of files) {
    const result = await storeUploadedFile(
      file,
      {
        clientId: link.clientId,
        documentId: link.documentId ?? null,
        assetId: link.assetId ?? null,
      },
      link.notes ?? null,
    )
    // One rejected file (antivirus, oversize) must not discard the ones that
    // landed, nor the document that was just created. The count comes back so
    // MindHub can say "3 of 4".
    if (!isStoreError(result)) n++
  }
  return n
}
