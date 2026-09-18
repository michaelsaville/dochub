// notes-segment.mjs — .mjs twin of lib/ai/notes-segment.ts for the host CLI scripts
// (scripts/notes-ingest.mjs), which run outside Next.js and can't import .ts directly.
// Keep this in sync with lib/ai/notes-segment.ts.
// See docs/memories/2026-07-25-multi-customer-page-segmentation-PROPOSAL.md.

const SHORT_NOTE_CHARS = 400

const SYSTEM = `You are a page-segmentation assistant for DocHub's Notes Intake pipeline (PCC2K / Precision Computers, an MSP). The technician's source material is a multi-year backlog of messy handwritten/typed notes: daily work logs written across several customers back-to-back, Freeform boards or photos mixing configuration printouts and credentials for more than one client, or pages with no folder/title signal at all.

Your ONLY job: split the content into the smallest number of segments such that everything inside one segment belongs to the SAME client AND the SAME topic/task. Do NOT split within a single coherent record — e.g. never separate a device's name from its own IP/serial/credential, never separate a credential's username from its password.

Rules:
- If the entire page is already one client and one topic, return exactly ONE segment containing the whole text unchanged.
- Preserve original wording VERBATIM inside each segment's "text" field — do not summarize, correct spelling, or omit anything. Every character of the source must appear in exactly one segment, in original order within that segment.
- "clientHint" is your best guess at the company/organization this segment is about (a name, alias, domain, or person strongly tied to one company) — set null if you cannot tell.
- "label" is a short human-readable title for the segment (max ~60 chars), e.g. "1812 Brewery — VPN creds" or "Daily log 6/3 — Allegany Chiropractic".
- Do not invent content. Do not merge two different clients into one segment even if adjacent in the source.

Respond with ONLY a single JSON object (no markdown fences, no prose) in exactly this shape:
{
  "segments": [
    { "label": string, "clientHint": string|null, "text": string }
  ]
}`

function parseModelJson(text) {
  let t = text.trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) t = fence[1].trim()
  else {
    const s = t.indexOf("{"), e = t.lastIndexOf("}")
    if (s >= 0 && e > s) t = t.slice(s, e + 1)
  }
  return JSON.parse(t)
}

export function needsSegmentation(text) {
  if (!text) return false
  return text.trim().length >= SHORT_NOTE_CHARS
}

// anthropicClient: an already-constructed `new Anthropic()` instance (caller owns it).
export async function segmentText(anthropicClient, { title, text, folderHint, model }) {
  if (!needsSegmentation(text)) {
    return [{ label: title, clientHint: folderHint || null, text }]
  }
  const header = `TITLE: ${title}${folderHint ? `\nFOLDER HINT: ${folderHint}` : ""}`
  const resp = await anthropicClient.messages.create({
    model: model || "claude-opus-4-8",
    max_tokens: 8000,
    system: SYSTEM,
    messages: [{ role: "user", content: `${header}\n\n----- SOURCE TEXT -----\n${text}` }],
  })
  const textBlock = resp.content.find((b) => b.type === "text")
  let parsed
  try {
    parsed = parseModelJson(textBlock.text)
  } catch {
    return [{ label: title, clientHint: folderHint || null, text }]
  }
  const segments = Array.isArray(parsed?.segments) ? parsed.segments : []
  if (!segments.length) return [{ label: title, clientHint: folderHint || null, text }]
  return segments
    .map((s, i) => ({
      label: (s?.label || `${title} (${i + 1})`).toString().slice(0, 200),
      clientHint: s?.clientHint ? String(s.clientHint).slice(0, 200) : null,
      text: String(s?.text ?? ""),
    }))
    .filter((s) => s.text.trim().length > 0)
}
