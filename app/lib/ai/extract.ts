import { parse as parseCsv } from "csv-parse/sync"

export type ExtractedContent =
  | { kind: "text"; text: string; summary: string }
  | { kind: "image"; base64: string; mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp"; summary: string }
  | { kind: "unsupported"; summary: string }

const MAX_TEXT_CHARS = 40_000 // cap what we feed into the prompt
const CSV_SAMPLE_ROWS = 40

function truncate(s: string, max = MAX_TEXT_CHARS): string {
  if (s.length <= max) return s
  return s.slice(0, max) + `\n\n[... truncated, original length ${s.length} chars]`
}

async function extractPdf(buffer: Buffer): Promise<ExtractedContent> {
  try {
    const { PDFParse } = await import("pdf-parse")
    const parser = new PDFParse({ data: buffer })
    const result = await parser.getText()
    const clean = (result.text ?? "").replace(/\n{3,}/g, "\n\n").trim()
    const pages = (result as { numpages?: number; pages?: unknown[] }).numpages
      ?? (result as { pages?: unknown[] }).pages?.length
      ?? 0
    return {
      kind: "text",
      text: truncate(clean),
      summary: `PDF, ${pages} page(s), ${clean.length} chars extracted`,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { kind: "unsupported", summary: `PDF parse failed: ${msg}` }
  }
}

function extractCsv(buffer: Buffer): ExtractedContent {
  try {
    const text = buffer.toString("utf-8")
    const rows = parseCsv(text, {
      columns: false,
      skip_empty_lines: true,
      relax_column_count: true,
      to: CSV_SAMPLE_ROWS + 1,
    }) as string[][]
    const header = rows[0] ?? []
    const sample = rows.slice(1, CSV_SAMPLE_ROWS + 1)
    const parts: string[] = []
    parts.push(`Header: ${header.join(" | ")}`)
    parts.push(`Rows (first ${sample.length}):`)
    for (const r of sample) parts.push(r.join(" | "))
    const totalLines = text.split("\n").length
    return {
      kind: "text",
      text: truncate(parts.join("\n")),
      summary: `CSV, ${header.length} columns, ~${totalLines} lines`,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { kind: "unsupported", summary: `CSV parse failed: ${msg}` }
  }
}

function extractPlainText(buffer: Buffer, hint: string): ExtractedContent {
  const text = buffer.toString("utf-8")
  return {
    kind: "text",
    text: truncate(text),
    summary: `${hint}, ${text.length} chars`,
  }
}

function extractImage(buffer: Buffer, mimeType: string): ExtractedContent {
  const base64 = buffer.toString("base64")
  let mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp" = "image/png"
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) mediaType = "image/jpeg"
  else if (mimeType.includes("gif")) mediaType = "image/gif"
  else if (mimeType.includes("webp")) mediaType = "image/webp"
  return {
    kind: "image",
    base64,
    mediaType,
    summary: `Image (${mediaType}), ${buffer.length} bytes`,
  }
}

export async function extractForAI(
  buffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<ExtractedContent> {
  const lower = filename.toLowerCase()

  if (mimeType.startsWith("image/") && !mimeType.includes("tiff") && !mimeType.includes("svg")) {
    return extractImage(buffer, mimeType)
  }

  if (mimeType === "application/pdf" || lower.endsWith(".pdf")) {
    return extractPdf(buffer)
  }

  if (mimeType === "text/csv" || lower.endsWith(".csv")) {
    return extractCsv(buffer)
  }

  if (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "application/xml" ||
    lower.endsWith(".txt") ||
    lower.endsWith(".log") ||
    lower.endsWith(".md") ||
    lower.endsWith(".json") ||
    lower.endsWith(".xml")
  ) {
    return extractPlainText(buffer, mimeType || "text")
  }

  return {
    kind: "unsupported",
    summary: `Unsupported type ${mimeType || "unknown"} — file will still be attached, but AI cannot read its contents.`,
  }
}
