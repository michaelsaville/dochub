/* eslint-disable @typescript-eslint/no-explicit-any */
import { getAnthropic } from "@/lib/ai/anthropic"
import { parseModelJson } from "@/lib/ai/notes-classify"

// Multi-customer / multi-topic page segmentation — runs BEFORE classifyNote.
// See docs/memories/2026-07-25-multi-customer-page-segmentation-PROPOSAL.md.
//
// Real backlog notes (daily logs, Freeform pages, multi-client photo pages) often mix
// more than one client and/or more than one unrelated topic on a single page. This
// module splits the raw extracted text into the smallest set of client+topic-coherent
// segments, verbatim, so each segment can then run through the existing single-client
// classifyNote() unchanged.

export const NOTES_SEGMENT_MODEL = process.env.NOTES_SEGMENT_MODEL || "claude-opus-4-8"

// Cheap pre-gate: skip the AI call entirely for short/simple notes. Tune SHORT_NOTE_CHARS
// down if real backlog data shows short-but-still-mixed notes slipping through.
const SHORT_NOTE_CHARS = 400

export type SegmentResult = {
  label: string
  clientHint: string | null
  text: string
}

const JSON_SHAPE = `{
  "segments": [
    {
      "label": string,            // short human label, e.g. "Braddock Medical Group" or "Printer config — front desk"
      "clientHint": string|null,  // best-guess company/client name or alias evidenced in this segment, else null
      "text": string              // the exact verbatim slice of the source belonging to this segment
    }
  ]
}`

const SYSTEM = `You are a page-segmentation assistant for DocHub's Notes Intake pipeline (PCC2K / Precision Computers, an MSP). The technician's source material is a multi-year backlog of messy handwritten/typed notes: daily work logs written across several customers back-to-back, Freeform boards or photos mixing configuration printouts and credentials for more than one client, or pages with no folder/title signal at all.

Your ONLY job: split the content into the smallest number of segments such that everything inside one segment belongs to the SAME client AND the SAME topic/task. Do NOT split within a single coherent record — e.g. never separate a device's name from its own IP/serial/credential, never separate a credential's username from its password.

Rules:
- If the entire page is already one client and one topic, return exactly ONE segment containing the whole text unchanged.
- Preserve original wording VERBATIM inside each segment's "text" field — do not summarize, correct spelling, or omit anything. Every character of the source must appear in exactly one segment, in original order within that segment.
- "clientHint" is your best guess at the company/organization this segment is about (a name, alias, domain, or person strongly tied to one company) — set null if you cannot tell.
- "label" is a short human-readable title for the segment (max ~60 chars), e.g. "1812 Brewery — VPN creds" or "Daily log 6/3 — Allegany Chiropractic".
- Do not invent content. Do not merge two different clients into one segment even if adjacent in the source.

Respond with ONLY a single JSON object (no markdown fences, no prose) in exactly this shape:
${JSON_SHAPE}`

export function needsSegmentation(text: string, opts?: { folderHint?: string | null }): boolean {
  if (!text) return false
  const trimmed = text.trim()
  if (trimmed.length < SHORT_NOTE_CHARS) return false
  return true
}

// Text-based segmentation (markdown/Apple Notes/Obsidian walk, or a text-extracted upload).
export async function segmentText(opts: {
  title: string
  text: string
  folderHint?: string | null
  model?: string
}): Promise<SegmentResult[]> {
  const { title, text, folderHint } = opts
  const model = opts.model || NOTES_SEGMENT_MODEL

  if (!needsSegmentation(text, { folderHint })) {
    return [{ label: title, clientHint: folderHint || null, text }]
  }

  const anthropic = getAnthropic()
  const header = `TITLE: ${title}${folderHint ? `\nFOLDER HINT: ${folderHint}` : ""}`
  const resp = await anthropic.messages.create({
    model,
    max_tokens: 8000,
    system: SYSTEM,
    messages: [{ role: "user", content: `${header}\n\n----- SOURCE TEXT -----\n${text}` }],
  })
  const textBlock = resp.content.find((b: any) => b.type === "text") as any
  let parsed: any
  try {
    parsed = parseModelJson(textBlock.text)
  } catch (err) {
    // Fail safe: treat as a single segment rather than losing the note.
    return [{ label: title, clientHint: folderHint || null, text }]
  }
  const segments = Array.isArray(parsed?.segments) ? parsed.segments : []
  if (!segments.length) return [{ label: title, clientHint: folderHint || null, text }]
  return segments.map((s: any, i: number) => ({
    label: (s?.label || `${title} (${i + 1})`).toString().slice(0, 200),
    clientHint: s?.clientHint ? String(s.clientHint).slice(0, 200) : null,
    text: String(s?.text ?? ""),
  })).filter((s: SegmentResult) => s.text.trim().length > 0)
}

// Vision-based segmentation (images/PDF pages already rendered for Claude vision).
// Shares the same image payload the classifier will use — no double OCR/vision cost;
// only the (cheap, text-only) segmentation call itself is extra when >1 segment exists.
export async function segmentImages(opts: {
  title: string
  images: { base64: string; mediaType: string }[]
  folderHint?: string | null
  model?: string
}): Promise<SegmentResult[]> {
  const { title, images, folderHint } = opts
  const model = opts.model || NOTES_SEGMENT_MODEL
  const anthropic = getAnthropic()

  const header = `TITLE: ${title}${folderHint ? `\nFOLDER HINT: ${folderHint}` : ""}\n\nThe image(s) below are page(s) of a document/photo (scan, Freeform board, or handwritten page).`
  const userContent: any[] = [{ type: "text", text: header }]
  images.forEach((im) => userContent.push({ type: "image", source: { type: "base64", media_type: im.mediaType, data: im.base64 } }))
  userContent.push({ type: "text", text: "Transcribe the FULL content of the image(s) above (including handwriting) and then split it into segments per your instructions. Each segment's \"text\" must be your verbatim transcription of that portion of the page(s), not the image itself." })

  const resp = await anthropic.messages.create({
    model,
    max_tokens: 8000,
    system: SYSTEM,
    messages: [{ role: "user", content: userContent }],
  })
  const textBlock = resp.content.find((b: any) => b.type === "text") as any
  let parsed: any
  try {
    parsed = parseModelJson(textBlock.text)
  } catch {
    return [] // caller falls back to classifying the whole image as one note
  }
  const segments = Array.isArray(parsed?.segments) ? parsed.segments : []
  return segments.map((s: any, i: number) => ({
    label: (s?.label || `${title} (${i + 1})`).toString().slice(0, 200),
    clientHint: s?.clientHint ? String(s.clientHint).slice(0, 200) : null,
    text: String(s?.text ?? ""),
  })).filter((s: SegmentResult) => s.text.trim().length > 0)
}
