import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createReadStream } from "fs"
import { stat } from "fs/promises"
import { Readable } from "stream"
import path from "path"
import {
  baseFileHeaders, contentDisposition, isInlineSafe, inlineContentType,
} from "@/lib/files/preview-policy"
import { readSignedBody, resolveGrant } from "../_helpers"

export const dynamic = "force-dynamic"

const UPLOAD_DIR = "/uploads"

interface Payload {
  vendorId: string
  clientId: string
  attachmentId: string
  disposition?: "inline" | "attachment"
}

/**
 * POST /api/bff/portal/dochub/vendor/file  (HMAC-signed, from the portal)
 * Body: { vendorId, clientId, attachmentId, disposition? }
 *
 * Streams a shared file to the vendor portal ONLY when an ACTIVE grant exists
 * and the attachment is explicitly shared (a VendorShare row). Reuses the same
 * inline-safety allow-list as the staff + customer-portal routes.
 */
export async function POST(req: Request) {
  const r = await readSignedBody<Payload>(req)
  if (!r.ok) return r.res
  const { vendorId, clientId, attachmentId, disposition } = r.body
  if (!vendorId || !clientId || !attachmentId) {
    return NextResponse.json({ ok: false, error: "vendorId, clientId, attachmentId required" }, { status: 400 })
  }

  const grant = await resolveGrant(vendorId, clientId)
  if (!grant) return NextResponse.json({ ok: false, error: "No active grant" }, { status: 403 })

  const share = await prisma.vendorShare.findUnique({
    where: { grantId_itemType_itemId: { grantId: grant.id, itemType: "ATTACHMENT", itemId: attachmentId } },
  })
  if (!share) return NextResponse.json({ ok: false, error: "Not found or not shared" }, { status: 404 })

  const att = await prisma.clientAttachment.findFirst({
    where: { id: attachmentId, clientId, supersededBy: null },
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

  prisma.attachmentAccessLog.create({
    data: { attachmentId: att.id, action: "preview", userName: `vendor:${vendorId}` },
  }).catch(() => {})

  const verifiedMime = att.detectedMime || att.mimeType
  const serveInline = disposition !== "attachment" && isInlineSafe(verifiedMime)
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
