import { NextResponse } from "next/server"
import { readFile } from "fs/promises"
import { existsSync } from "fs"
import path from "path"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

const UPLOAD_DIR = "/uploads"

// GET /api/notes-intake/[id]/file — serve the uploaded source file for in-panel
// preview (auth-gated). HEIC is converted to JPEG so browsers can render it.
// Only origin=upload files live in the container's /uploads volume; ingested
// vault/export files are on the host and not servable here.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  const { id } = await params

  const s = await prisma.noteSuggestion.findUnique({
    where: { id },
    select: { origin: true, uploadStorageName: true, uploadDetectedMime: true, sourceState: true, sourceTrashPath: true },
  })
  if (!s) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (s.origin !== "upload" || !s.uploadStorageName) {
    return NextResponse.json({ error: "No previewable file (only in-app uploads are servable)" }, { status: 404 })
  }

  // If trashed, the file was moved under /uploads/notes-trash/<id>/…
  const live = path.join(UPLOAD_DIR, s.uploadStorageName)
  const filePath = existsSync(live) ? live : (s.sourceTrashPath && existsSync(s.sourceTrashPath) ? s.sourceTrashPath : null)
  if (!filePath) return NextResponse.json({ error: "File no longer on disk" }, { status: 404 })

  let buf: Buffer = await readFile(filePath)
  let mime = s.uploadDetectedMime || "application/octet-stream"

  if (mime === "image/heic" || mime === "image/heif") {
    try {
      const sharp = (await import("sharp")).default
      buf = await sharp(buf).jpeg({ quality: 85 }).toBuffer()
      mime = "image/jpeg"
    } catch { /* serve original bytes if conversion fails */ }
  }

  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": mime, "Cache-Control": "private, max-age=120", "Content-Disposition": "inline" },
  })
}
