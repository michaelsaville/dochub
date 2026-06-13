import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { readFile, writeFile, mkdir, stat } from "fs/promises"
import { existsSync } from "fs"
import path from "path"
import { baseFileHeaders } from "@/lib/files/preview-policy"

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

    // For a PDF, rasterize page 1 to PNG first (pdf-parse already ships
    // pdfjs-dist + @napi-rs/canvas — the same dep used for OCR text extraction),
    // then feed it through the same sharp → WebP pipeline as images. A bad /
    // encrypted / zero-page PDF yields no bytes → 404 → the grid falls back to
    // the typed icon.
    let source: Buffer
    if (isPdf) {
      const png = await renderPdfFirstPage(await readFile(src))
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

/**
 * Render page 1 of a PDF to PNG bytes via pdf-parse's getScreenshot (pdfjs-dist
 * + @napi-rs/canvas, already bundled for the OCR path). Returns null on any
 * failure (encrypted / corrupt / empty) so the caller can 404 cleanly.
 */
async function renderPdfFirstPage(data: Buffer): Promise<Buffer | null> {
  const { PDFParse } = await import("pdf-parse")
  const parser = new PDFParse({ data })
  try {
    const shot = await parser.getScreenshot({
      partial: [1], // page 1 only
      imageBuffer: true, // populate page.data with PNG bytes
      desiredWidth: 640, // downscaled to THUMB_PX by sharp; keeps render cheap
    })
    const bytes = shot.pages?.[0]?.data
    return bytes && bytes.length ? Buffer.from(bytes) : null
  } catch {
    return null
  } finally {
    await parser.destroy().catch(() => {})
  }
}
