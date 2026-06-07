import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyPortalHmac } from "@/lib/bff-hmac"
import { getPortalAccess, categoryAllowed } from "@/lib/portal-access"
import { readFile, stat } from "fs/promises"
import { createReadStream } from "fs"
import { Readable } from "stream"
import path from "path"
import {
  baseFileHeaders, contentDisposition, isInlineSafe, inlineContentType,
} from "@/lib/files/preview-policy"

export const dynamic = "force-dynamic"

const UPLOAD_DIR = "/uploads"

/**
 * POST /api/bff/portal/dochub/files/[id]  (HMAC-signed, from the portal app)
 * Body: { clientId, portalUserId?, disposition?: "inline" | "attachment" }
 *
 * Streams a file to the customer portal ONLY if it is explicitly shared
 * (portalVisible, or its parent document is) and belongs to the requesting
 * client. Reuses the same inline-safety allow-list as the staff route.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const rawBody = await req.text()
  const verify = verifyPortalHmac(
    rawBody,
    req.headers.get("x-portal-signature"),
    req.headers.get("x-portal-timestamp"),
    process.env.PORTAL_BFF_SECRET ?? "",
  )
  if (!verify.ok) return NextResponse.json({ ok: false, error: verify.reason }, { status: verify.status })

  let payload: { clientId: string; portalUserId?: string; disposition?: string }
  try { payload = JSON.parse(rawBody) } catch { return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 }) }
  if (!payload.clientId) return NextResponse.json({ ok: false, error: "clientId required" }, { status: 400 })

  const access = await getPortalAccess(payload.portalUserId, payload.clientId)
  if (access.mode === "denied") return NextResponse.json({ ok: false, error: "Not authorized for this client" }, { status: 403 })
  if (!categoryAllowed(access, "documents")) return NextResponse.json({ ok: false, error: "Not authorized" }, { status: 403 })

  const { id } = await params
  const att = await prisma.clientAttachment.findFirst({
    where: {
      id,
      clientId: payload.clientId, // scope: file must belong to the caller's client
      OR: [{ portalVisible: true }, { document: { portalVisible: true } }],
    },
  })
  if (!att) return NextResponse.json({ ok: false, error: "Not found or not shared" }, { status: 404 })

  if (att.expiresAt && att.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ ok: false, error: "expired" }, { status: 410 })
  }

  const filePath = path.join(UPLOAD_DIR, att.storageName)
  let fileSize: number
  try { fileSize = (await stat(filePath)).size } catch {
    return NextResponse.json({ ok: false, error: "File missing on disk" }, { status: 404 })
  }

  // Audit portal access too.
  prisma.attachmentAccessLog.create({
    data: { attachmentId: att.id, action: "preview", userName: `portal:${payload.portalUserId ?? "anon"}` },
  }).catch(() => {})

  const verifiedMime = att.detectedMime || att.mimeType
  const serveInline = payload.disposition !== "attachment" && isInlineSafe(verifiedMime)
  const contentType = serveInline ? inlineContentType(verifiedMime)! : (att.detectedMime || att.mimeType || "application/octet-stream")

  const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream
  return new Response(stream, {
    headers: {
      ...baseFileHeaders(),
      "Content-Type": contentType,
      "Content-Disposition": contentDisposition(serveInline ? "inline" : "attachment", att.originalName),
      "Content-Length": String(fileSize),
    },
  })
}
