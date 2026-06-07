import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { unlink, stat } from "fs/promises"
import { createReadStream } from "fs"
import { Readable } from "stream"
import path from "path"
import {
  baseFileHeaders, contentDisposition, isInlineSafe, inlineContentType,
} from "@/lib/files/preview-policy"

const UPLOAD_DIR = "/uploads"

/**
 * GET /api/attachments/[id]            -> download (attachment)
 * GET /api/attachments/[id]?disposition=inline -> render in-browser, but ONLY
 *     for server-verified inline-safe types; everything else falls back to a
 *     forced download with octet-stream + nosniff so it can't execute.
 *
 * Supports HTTP Range so PDFs/video seek and large files don't buffer whole.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const att = await prisma.clientAttachment.findUnique({ where: { id } })
    if (!att) return NextResponse.json({ error: "Not found" }, { status: 404 })

    // Access guards for shared/expiring files.
    if (att.expiresAt && att.expiresAt.getTime() < Date.now()) {
      return NextResponse.json({ error: "This file has expired" }, { status: 410 })
    }
    if (att.maxDownloads != null && att.downloadCount >= att.maxDownloads) {
      return NextResponse.json({ error: "Download limit reached" }, { status: 410 })
    }

    const filePath = path.join(UPLOAD_DIR, att.storageName)
    let fileSize: number
    try {
      fileSize = (await stat(filePath)).size
    } catch {
      // Row exists but the blob is gone (volume loss / never written).
      return NextResponse.json({ error: "File missing on disk" }, { status: 404 })
    }

    const url = new URL(req.url)
    const wantsInline = url.searchParams.get("disposition") === "inline"
    const verifiedMime = att.detectedMime || att.mimeType
    const serveInline = wantsInline && isInlineSafe(verifiedMime)

    const contentType = serveInline
      ? inlineContentType(verifiedMime)!
      : (att.detectedMime || att.mimeType || "application/octet-stream")
    const disposition = serveInline ? "inline" : "attachment"

    // Record access without blocking the response. Real downloads bump the
    // counter that maxDownloads is checked against; inline previews don't.
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null
    prisma.attachmentAccessLog.create({
      data: {
        attachmentId: att.id,
        action: serveInline ? "preview" : "download",
        userName: session?.user?.name ?? null,
        ip,
      },
    }).catch(() => {})
    if (!serveInline) {
      prisma.clientAttachment.update({
        where: { id: att.id },
        data: { downloadCount: { increment: 1 } },
      }).catch(() => {})
    }

    const headers: Record<string, string> = {
      ...baseFileHeaders(),
      "Content-Type": contentType,
      "Content-Disposition": contentDisposition(disposition, att.originalName),
      "Accept-Ranges": "bytes",
      // storageName is a content-stable UUID, so the bytes never change.
      "Cache-Control": "private, max-age=31536000, immutable",
    }

    // Range request (seek) handling.
    const range = req.headers.get("range")
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range)
      if (m) {
        let start = m[1] ? parseInt(m[1], 10) : 0
        let end = m[2] ? parseInt(m[2], 10) : fileSize - 1
        if (Number.isNaN(start)) start = 0
        if (Number.isNaN(end) || end >= fileSize) end = fileSize - 1
        if (start > end || start >= fileSize) {
          return new Response("Range Not Satisfiable", {
            status: 416,
            headers: { "Content-Range": `bytes */${fileSize}` },
          })
        }
        const stream = Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream
        return new Response(stream, {
          status: 206,
          headers: {
            ...headers,
            "Content-Range": `bytes ${start}-${end}/${fileSize}`,
            "Content-Length": String(end - start + 1),
          },
        })
      }
    }

    const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream
    return new Response(stream, { headers: { ...headers, "Content-Length": String(fileSize) } })
  } catch (e) {
    return NextResponse.json({ error: "File not found" }, { status: 404 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const att = await prisma.clientAttachment.findUnique({ where: { id } })
    if (!att) return NextResponse.json({ error: "Not found" }, { status: 404 })

    await unlink(path.join(UPLOAD_DIR, att.storageName)).catch(() => {})
    await prisma.clientAttachment.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}

/**
 * PATCH /api/attachments/[id] — metadata edits: rename, notes, portalVisible,
 * expiresAt, maxDownloads. Never touches the bytes.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const body = await req.json()
    const data: any = {}
    if (typeof body.originalName === "string" && body.originalName.trim()) data.originalName = body.originalName.trim()
    if (body.notes !== undefined) data.notes = (body.notes?.trim() || null)
    if (typeof body.portalVisible === "boolean") data.portalVisible = body.portalVisible
    if (body.expiresAt !== undefined) data.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null
    if (body.maxDownloads !== undefined) data.maxDownloads = body.maxDownloads === null ? null : Number(body.maxDownloads)
    const att = await prisma.clientAttachment.update({ where: { id }, data })
    return NextResponse.json(att)
  } catch (e) {
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
