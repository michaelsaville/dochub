/**
 * Upload ingestion helpers: trustworthy MIME detection (magic bytes),
 * image dimensions, and searchable-text extraction (PDF / text / CSV /
 * docx / xlsx, plus Claude-vision OCR for images).
 *
 * MIME detection here is the security-critical bit: it produces the
 * `detectedMime` that preview-policy uses to decide inline serving. We
 * NEVER let the browser-supplied File.type drive that decision.
 */
import { prisma } from "@/lib/prisma"

const TEXT_EXT = new Set([".txt", ".log", ".md", ".markdown", ".json", ".csv", ".yaml", ".yml", ".ini", ".conf", ".env", ".sql"])
const MAX_TEXT_CHARS = 200_000
const OCR_MODEL = "claude-haiku-4-5"

/** Does the buffer look like decodable UTF-8 text (no NULs, mostly printable)? */
function looksLikeText(buffer: Buffer): boolean {
  const n = Math.min(buffer.length, 8192)
  if (n === 0) return false
  let suspicious = 0
  for (let i = 0; i < n; i++) {
    const b = buffer[i]
    if (b === 0) return false // NUL => binary
    // allow tab/LF/CR + printable + high-bytes (UTF-8 continuation)
    if (b < 0x09 || (b > 0x0d && b < 0x20)) suspicious++
  }
  return suspicious / n < 0.05
}

/**
 * Verify the real content type from magic bytes. Returns a server-trusted
 * mime. Text formats have no magic bytes, so fall back to a text sniff +
 * extension. Anything we can't vouch for becomes octet-stream (=> download).
 */
export async function detectMime(buffer: Buffer, filename: string): Promise<string> {
  try {
    const { fileTypeFromBuffer } = await import("file-type")
    const ft = await fileTypeFromBuffer(buffer)
    if (ft?.mime) return ft.mime
  } catch {
    /* fall through to text heuristic */
  }
  const lower = filename.toLowerCase()
  const ext = lower.slice(lower.lastIndexOf("."))
  if (looksLikeText(buffer)) {
    if (ext === ".csv") return "text/csv"
    if (ext === ".json") return "application/json"
    if (ext === ".md" || ext === ".markdown") return "text/markdown"
    return "text/plain"
  }
  if (TEXT_EXT.has(ext) && looksLikeText(buffer)) return "text/plain"
  return "application/octet-stream"
}

/** Pixel dimensions for raster images; null for everything else. */
export async function imageDimensions(
  buffer: Buffer,
  detectedMime: string,
): Promise<{ width: number | null; height: number | null }> {
  if (!detectedMime.startsWith("image/") || detectedMime === "image/svg+xml") {
    return { width: null, height: null }
  }
  try {
    const sharp = (await import("sharp")).default
    const meta = await sharp(buffer).metadata()
    return { width: meta.width ?? null, height: meta.height ?? null }
  } catch {
    return { width: null, height: null }
  }
}

async function extractPdf(buffer: Buffer): Promise<string> {
  const { pdfText } = await import("./poppler")
  const text = await pdfText(buffer)
  return text.replace(/\n{3,}/g, "\n\n").trim()
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth")
  const { value } = await mammoth.extractRawText({ buffer })
  return (value ?? "").trim()
}

async function extractXlsx(buffer: Buffer): Promise<string> {
  const XLSX = await import("xlsx")
  const wb = XLSX.read(buffer, { type: "buffer" })
  const parts: string[] = []
  for (const name of wb.SheetNames) {
    parts.push(`# ${name}`)
    parts.push(XLSX.utils.sheet_to_csv(wb.Sheets[name]))
  }
  return parts.join("\n").trim()
}

/** OCR an image with Claude vision. Returns "" if no API key is configured
 *  (graceful degrade — PDF/text extraction still works without it). */
async function ocrImage(buffer: Buffer, detectedMime: string): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) return ""
  try {
    const { getAnthropic } = await import("@/lib/ai/anthropic")
    let buf = buffer
    let mediaType = detectedMime
    // Claude accepts png/jpeg/gif/webp and caps base64 at ~5MB. Normalise
    // anything else (or anything large) to a bounded JPEG via sharp.
    const okType = ["image/png", "image/jpeg", "image/gif", "image/webp"].includes(detectedMime)
    if (!okType || buffer.length > 4_500_000) {
      const sharp = (await import("sharp")).default
      buf = await sharp(buffer).resize(1568, 1568, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer()
      mediaType = "image/jpeg"
    }
    const anthropic = getAnthropic()
    const resp = await anthropic.messages.create({
      model: OCR_MODEL,
      max_tokens: 2000,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType as "image/jpeg", data: buf.toString("base64") } },
          { type: "text", text: "Transcribe ALL text visible in this image, preserving rough layout. If there is no text, reply with an empty response. Output only the transcribed text." },
        ],
      }],
    })
    return resp.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n").trim()
  } catch (e) {
    console.warn("[ingest] OCR failed", e)
    return ""
  }
}

async function extractText(buffer: Buffer, detectedMime: string, filename: string): Promise<string> {
  const m = detectedMime.toLowerCase()
  if (m === "application/pdf") return extractPdf(buffer)
  if (m === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return extractDocx(buffer)
  if (m === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return extractXlsx(buffer)
  if (m.startsWith("text/") || m === "application/json") return buffer.toString("utf-8")
  if (m.startsWith("image/") && m !== "image/svg+xml") return ocrImage(buffer, detectedMime)
  return ""
}

/**
 * Fire-and-forget: extract searchable text from an already-stored attachment
 * and persist it. Called WITHOUT await so uploads stay snappy; DocHub runs as
 * a long-lived node server so the promise survives the response.
 */
export function ingestSearchableText(
  attachmentId: string,
  buffer: Buffer,
  detectedMime: string,
  filename: string,
): void {
  extractText(buffer, detectedMime, filename)
    .then((text) => {
      const trimmed = (text || "").slice(0, MAX_TEXT_CHARS).trim()
      if (!trimmed) return
      return prisma.clientAttachment.update({
        where: { id: attachmentId },
        data: { searchableText: trimmed },
      })
    })
    .catch((e) => console.warn(`[ingest] searchableText failed for ${attachmentId}`, e))
}
