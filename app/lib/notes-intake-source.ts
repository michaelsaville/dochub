import "server-only"
import { readFile, readdir, stat } from "fs/promises"
import path from "path"
import crypto from "crypto"

// Notes Intake — locate ingested source files (Apple Notes export, Obsidian vault,
// Freeform PDFs) from inside the container so the review panel can show the
// original PDF / photos instead of only the extracted text.
//
// NoteSuggestion.sourceAbsPath holds the HOST path at ingest time. The host
// folders are bind-mounted read-only and NOTES_SRC_MAP translates prefixes:
//   NOTES_SRC_MAP="/home/msaville/Notes/=/notes-src/notes/;/home/msaville/freeform-notes/=/notes-src/archive/freeform-notes/"
// HEIC photos can't be decoded in the container (no HEVC in libvips), so they are
// pre-converted on the host into NOTES_HEIC_CACHE/<sha256(bytes)[:32]>.jpg by
// scripts/notes-sources/convert-heic.sh.

const HEIC_CACHE = process.env.NOTES_HEIC_CACHE || "/notes-src/heic-cache"

const MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp", ".heic": "image/heic", ".heif": "image/heif",
}
export function mimeForPath(p: string): string | null {
  return MIME_BY_EXT[path.extname(p).toLowerCase()] ?? null
}

function srcMap(): { from: string; to: string }[] {
  return (process.env.NOTES_SRC_MAP || "")
    .split(";")
    .map((pair) => pair.split("="))
    .filter((p) => p.length === 2 && p[0] && p[1])
    .map(([from, to]) => ({ from, to }))
}

async function isFile(p: string) {
  try { return (await stat(p)).isFile() } catch { return false }
}

// basename → paths under a mount root, rebuilt at most every 10 min. Lets us find a
// note that was moved/reorganized in the vault after it was ingested.
const indexCache = new Map<string, { at: number; byName: Map<string, string[]> }>()
async function nameIndex(root: string) {
  const hit = indexCache.get(root)
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.byName
  const byName = new Map<string, string[]>()
  const walk = async (dir: string) => {
    let entries
    try { entries = await readdir(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (e.name.startsWith(".") || e.name === "attachments" || e.name === "node_modules") continue
      const p = path.join(dir, e.name)
      if (e.isDirectory()) await walk(p)
      else if (e.isFile()) { const k = e.name.toLowerCase(); byName.set(k, [...(byName.get(k) || []), p]) }
    }
  }
  await walk(root)
  indexCache.set(root, { at: Date.now(), byName })
  return byName
}

async function findMoved(root: string, hostPath: string): Promise<string | null> {
  const hits = (await nameIndex(root)).get(path.basename(hostPath).toLowerCase()) || []
  if (hits.length === 1) return hits[0]
  const parent = path.basename(path.dirname(hostPath)).toLowerCase()
  const sameParent = hits.filter((h) => path.basename(path.dirname(h)).toLowerCase() === parent)
  return sameParent.length === 1 ? sameParent[0] : null
}

// Host path → { file, root } inside the container, or null if unmapped / missing.
// `root` bounds attachment resolution so a crafted note link can't escape the mount.
export async function resolveIngestSource(hostPath: string | null | undefined): Promise<{ file: string; root: string; moved: boolean } | null> {
  if (!hostPath) return null
  for (const { from, to } of srcMap()) {
    if (!hostPath.startsWith(from)) continue
    const root = path.normalize(to)
    const file = path.normalize(path.join(to, hostPath.slice(from.length)))
    if (!file.startsWith(root)) return null
    if (await isFile(file)) return { file, root, moved: false }
    const moved = await findMoved(root, hostPath)
    if (moved) return { file: moved, root, moved: true }
  }
  return null
}

export type Attachment = { name: string; file: string; mime: string }

// Embedded files referenced by a markdown note: `![alt](attachments/x%20y.jpg)`
// (Apple Notes exporter, with `\(` `\)` escapes) and Obsidian `![[x.png]]`.
export async function noteAttachments(noteFile: string, root: string): Promise<Attachment[]> {
  if (!noteFile.toLowerCase().endsWith(".md")) return []
  const body = await readFile(noteFile, "utf8")
  const dir = path.dirname(noteFile)
  const refs: string[] = []
  for (const m of body.matchAll(/\]\(((?:\\.|[^)\\])+)\)/g)) {
    const raw = m[1].replace(/\\(.)/g, "$1").trim()
    if (/^[a-z]+:/i.test(raw)) continue // http:, mailto:, etc.
    try { refs.push(decodeURIComponent(raw)) } catch { refs.push(raw) }
  }
  for (const m of body.matchAll(/!\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)) refs.push(m[1].trim())

  const out: Attachment[] = []
  const seen = new Set<string>()
  for (const ref of refs) {
    const mime = mimeForPath(ref)
    if (!mime) continue
    const candidates = [path.join(dir, ref), path.join(dir, "attachments", path.basename(ref))]
    for (const c of candidates) {
      const file = path.normalize(c)
      if (!file.startsWith(root) || seen.has(file)) continue
      if (await isFile(file)) { seen.add(file); out.push({ name: path.basename(file), file, mime }); break }
    }
  }
  return out
}

// Read a file for the browser. HEIC is swapped for its host-converted JPEG when
// one exists; otherwise the raw HEIC goes out (Safari can still render it).
export async function readForBrowser(file: string, mime: string): Promise<{ buf: Buffer; mime: string }> {
  const buf = await readFile(file)
  if (mime === "image/heic" || mime === "image/heif") {
    const key = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 32)
    const jpg = path.join(HEIC_CACHE, `${key}.jpg`)
    if (await isFile(jpg)) return { buf: await readFile(jpg), mime: "image/jpeg" }
  }
  return { buf, mime }
}
