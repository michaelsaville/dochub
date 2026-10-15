import { NextResponse } from "next/server"
import { existsSync } from "fs"
import path from "path"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { mimeForPath, noteAttachments, readForBrowser, resolveIngestSource } from "@/lib/notes-intake-source"

const UPLOAD_DIR = "/uploads"

// GET /api/notes-intake/[id]/file — serve the note's source for in-panel preview
// (auth-gated).
//   ?list=1  → { main: {mime} | null, attachments: [{name, mime}], missing }
//   (none)   → the source file itself (uploaded file, or an ingested PDF/image)
//   ?att=N   → the Nth embedded attachment of an ingested markdown note
// Uploads live in /uploads; ingested files come from the read-only host mounts
// (lib/notes-intake-source). HEIC is served as JPEG where a conversion exists.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  const { id } = await params
  const url = new URL(req.url)

  const s = await prisma.noteSuggestion.findUnique({
    where: { id },
    select: { origin: true, uploadStorageName: true, uploadDetectedMime: true, sourceTrashPath: true, sourceAbsPath: true },
  })
  if (!s) return NextResponse.json({ error: "Not found" }, { status: 404 })

  let main: { file: string; mime: string } | null = null
  let attachments: { name: string; file: string; mime: string }[] = []
  let missing = false

  if (s.origin === "upload" && s.uploadStorageName) {
    // If trashed, the file was moved under /uploads/notes-trash/<id>/…
    const live = path.join(UPLOAD_DIR, s.uploadStorageName)
    const file = existsSync(live) ? live : (s.sourceTrashPath && existsSync(s.sourceTrashPath) ? s.sourceTrashPath : null)
    if (file) main = { file, mime: s.uploadDetectedMime || "application/octet-stream" }
    else missing = true
  } else if (s.sourceAbsPath) {
    const src = await resolveIngestSource(s.sourceAbsPath)
    if (!src) missing = true
    else {
      const mime = mimeForPath(src.file)
      if (mime) main = { file: src.file, mime }
      attachments = await noteAttachments(src.file, src.root)
    }
  }

  if (url.searchParams.get("list")) {
    return NextResponse.json({
      main: main ? { mime: main.mime } : null,
      attachments: attachments.map((a) => ({ name: a.name, mime: a.mime })),
      missing,
    })
  }

  const att = url.searchParams.get("att")
  const target = att != null ? attachments[Number(att)] : main
  if (!target) return NextResponse.json({ error: missing ? "File no longer on disk" : "No previewable file" }, { status: 404 })

  let { buf, mime } = await readForBrowser(target.file, target.mime)

  // Uploaded HEIC: try in-container conversion (works only if libvips has HEVC).
  if (mime === "image/heic" || mime === "image/heif") {
    try {
      const sharp = (await import("sharp")).default
      buf = await sharp(buf).jpeg({ quality: 85 }).toBuffer()
      mime = "image/jpeg"
    } catch { /* serve original bytes — Safari renders HEIC natively */ }
  }

  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": mime, "Cache-Control": "private, max-age=300", "Content-Disposition": "inline", "X-Content-Type-Options": "nosniff" },
  })
}
