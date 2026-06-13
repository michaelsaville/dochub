import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { readFile, writeFile, mkdir, stat } from "fs/promises"
import { existsSync } from "fs"
import path from "path"
import { baseFileHeaders } from "@/lib/files/preview-policy"
import { pdfFirstPagePng } from "@/lib/files/poppler"

const UPLOAD_DIR = "/uploads"
const THUMB_DIR = "/uploads/thumb"
const THUMB_PX = 320

/**
 * GET /api/attachments/[id]/thumbnail — a small WebP preview of a raster
 * image, generated lazily on first request and cached on disk. 404 for
 * non-images (the UI falls back to a typed icon).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const att = await prisma.clientAttachment.findUnique({
      where: { id },
      select: { storageName: true, detectedMime: true, mimeType: true },
    })
    if (!att) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const mime = (att.detectedMime || att.mimeType || "").toLowerCase()
    const isImage = mime.startsWith("image/") && mime !== "image/svg+xml"
    const isPdf = mime === "application/pdf"
    if (!isImage && !isPdf) {
      return NextResponse.json({ error: "No thumbnail" }, { status: 404 })
    }

    const thumbPath = path.join(THUMB_DIR, `${id}.webp`)
    const headers = {
      ...baseFileHeaders(),
      "Content-Type": "image/webp",
      "Cache-Control": "private, max-age=31536000, immutable",
    }

    if (existsSync(thumbPath)) {
      return new Response(new Uint8Array(await readFile(thumbPath)), { headers })
    }

    const src = path.join(UPLOAD_DIR, att.storageName)
    try {
      await stat(src)
    } catch {
      return NextResponse.json({ error: "File missing on disk" }, { status: 404 })
    }

    // For a PDF, rasterize page 1 to PNG first (poppler pdftoppm), then feed it
    // through the same sharp → WebP pipeline as images. A bad / encrypted /
    // zero-page PDF yields no bytes → 404 → the grid falls back to the icon.
    let source: Buffer
    if (isPdf) {
      const png = await pdfFirstPagePng(await readFile(src))
      if (!png) return NextResponse.json({ error: "No thumbnail" }, { status: 404 })
      source = png
    } else {
      source = await readFile(src)
    }

    const sharp = (await import("sharp")).default
    const out = await sharp(source)
      .rotate() // honor EXIF orientation
      .resize(THUMB_PX, THUMB_PX, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 72 })
      .toBuffer()

    if (!existsSync(THUMB_DIR)) await mkdir(THUMB_DIR, { recursive: true })
    await writeFile(thumbPath, out).catch(() => {})

    return new Response(new Uint8Array(out), { headers })
  } catch (e) {
    return NextResponse.json({ error: "Thumbnail failed" }, { status: 500 })
  }
}
