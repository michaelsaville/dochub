/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only"
import { existsSync } from "fs"
import { readFile } from "fs/promises"
import path from "path"
import { prisma } from "@/lib/prisma"
import { mimeForPath, noteAttachments, readForBrowser, resolveIngestSource } from "@/lib/notes-intake-source"
import { renderPdfToImages } from "@/lib/files/pdf-render"

// Source files for a pile item, resolved ONLY by suggestion id (never by a path
// from the client or the model). Ingested paths go through resolveIngestSource,
// which bounds them to the read-only NOTES_SRC_MAP mounts.

const UPLOAD_DIR = "/uploads"
const MAX_EDGE = 1568

type Src = { file: string; mime: string; name: string }

async function locate(suggestionId: string): Promise<{ main: Src | null; attachments: Src[] }> {
  const s = await prisma.noteSuggestion.findUnique({
    where: { id: suggestionId },
    select: { origin: true, uploadStorageName: true, uploadDetectedMime: true, uploadOriginalName: true, sourceTrashPath: true, sourceAbsPath: true },
  })
  if (!s) return { main: null, attachments: [] }
  if (s.origin === "upload" && s.uploadStorageName) {
    const live = path.join(UPLOAD_DIR, path.basename(s.uploadStorageName))
    const file = existsSync(live) ? live : (s.sourceTrashPath && existsSync(s.sourceTrashPath) ? s.sourceTrashPath : null)
    return { main: file ? { file, mime: s.uploadDetectedMime || "application/octet-stream", name: s.uploadOriginalName || "upload" } : null, attachments: [] }
  }
  const src = await resolveIngestSource(s.sourceAbsPath)
  if (!src) return { main: null, attachments: [] }
  const mime = mimeForPath(src.file)
  const attachments = (await noteAttachments(src.file, src.root)).map((a) => ({ file: a.file, mime: a.mime, name: a.name }))
  return { main: mime ? { file: src.file, mime, name: path.basename(src.file) } : null, attachments }
}

/** What the model can look at: index 0 = main file (if viewable), then attachments. */
export async function listViewables(suggestionId: string) {
  const { main, attachments } = await locate(suggestionId)
  const out: { index: number; name: string; kind: "image" | "pdf"; ref: string }[] = []
  if (main) out.push({ index: 0, name: main.name, kind: main.mime === "application/pdf" ? "pdf" : "image", ref: "main" })
  attachments.forEach((a, i) => out.push({ index: out.length, name: a.name, kind: a.mime === "application/pdf" ? "pdf" : "image", ref: `att:${i}` }))
  return out
}

/**
 * Render one viewable as a JPEG for the model. Deterministic for a given file so a
 * history replay produces byte-identical image blocks (prompt cache + preserved
 * thinking). bbox is in 0..1 fractions of the image: {x, y, w, h}.
 */
export async function renderViewable(
  suggestionId: string,
  ref: string,
  page = 1,
  bbox?: { x: number; y: number; w: number; h: number } | null,
): Promise<{ media_type: "image/jpeg"; data: string } | { error: string }> {
  const { main, attachments } = await locate(suggestionId)
  let src: Src | null = null
  if (ref === "main") src = main
  else if (ref.startsWith("att:")) src = attachments[Number(ref.slice(4))] || null
  if (!src) return { error: "no such source file for this item" }

  const sharp = (await import("sharp")).default
  let buf: Buffer
  if (src.mime === "application/pdf") {
    const pages = await renderPdfToImages(await readFile(src.file), Math.max(1, Math.min(page, 20)))
    const pg = pages[Math.max(1, page) - 1]
    if (!pg) return { error: `PDF has fewer than ${page} page(s)` }
    buf = Buffer.from(pg.base64, "base64")
  } else {
    const r = await readForBrowser(src.file, src.mime)
    if (r.mime === "image/heic" || r.mime === "image/heif") return { error: "HEIC photo has no converted JPEG in the cache yet (run scripts/notes-sources/convert-heic.sh)" }
    buf = r.buf
  }

  let img = sharp(buf, { failOn: "none" }).rotate()
  if (bbox) {
    const meta = await sharp(buf, { failOn: "none" }).rotate().toBuffer({ resolveWithObject: true })
    const W = meta.info.width, H = meta.info.height
    const clamp = (v: number) => Math.max(0, Math.min(1, v))
    const left = Math.floor(clamp(bbox.x) * W), top = Math.floor(clamp(bbox.y) * H)
    const width = Math.max(8, Math.min(W - left, Math.floor(clamp(bbox.w) * W)))
    const height = Math.max(8, Math.min(H - top, Math.floor(clamp(bbox.h) * H)))
    img = sharp(meta.data).extract({ left, top, width, height })
  }
  const out = await img
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: !bbox })
    .jpeg({ quality: 85 })
    .toBuffer()
  return { media_type: "image/jpeg", data: out.toString("base64") }
}

/** History stores images as refs; this key format is parsed back in loop.ts. */
export function imageRefKey(suggestionId: string, ref: string, page: number, bbox?: { x: number; y: number; w: number; h: number } | null) {
  return `pileref:${JSON.stringify({ s: suggestionId, r: ref, p: page, b: bbox || null })}`
}
export function parseImageRefKey(k: string): { s: string; r: string; p: number; b: any } | null {
  if (!k.startsWith("pileref:")) return null
  try { return JSON.parse(k.slice(8)) } catch { return null }
}
