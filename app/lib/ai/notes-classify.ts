/* eslint-disable @typescript-eslint/no-explicit-any */
import { getAnthropic } from "@/lib/ai/anthropic"
import type { ExtractedContent } from "@/lib/ai/extract"

// Shared AI brain for Notes Intake UPLOADS (the CLI scripts/notes-ingest.mjs
// carries its own copy of the equivalent prompt for the file-tree walk).
// Given a note's extracted content + the client list, returns the same shape
// the CLI produces: relevance gate + client match + entities, plus sourceKind
// for images (screenshot vs handwritten vs pdf-scan).

export const NOTES_INTAKE_MODEL = process.env.NOTES_INTAKE_MODEL || "claude-opus-4-8"

const JSON_SHAPE = `{
  "isRelevant": boolean,          // true only if this is client IT documentation (infra, credentials, network, devices, phone). Personal notes, todo/shopping lists, marketing = false
  "relevanceReason": string,
  "clientId": string | null,      // best-matching client id from the CLIENT LIST, or null if none/unsure
  "clientName": string | null,
  "clientConfidence": number,     // 0.0 - 1.0
  "clientReasoning": string,      // cite evidence: a company name, AD domain, person, WAN IP, address
  "clientAlternatives": string[], // other plausible client ids (may be [])
  "sourceKind": "screenshot" | "handwritten" | "pdf-scan" | "other" | null, // for IMAGES: screenshot = UI/app/terminal/console capture; handwritten = photo of handwriting/whiteboard; pdf-scan = scanned document; else null
  "entities": [
    {
      "kind": "credential" | "asset" | "location_network" | "phone_extension" | "vendor" | "other",
      "confidence": number,
      "summary": string,          // short human label, e.g. "SonicWall admin login", "Synology NAS"
      "sourceSnippet": string,    // the exact text this came from (or a short description for an image region)
      "fields": {                 // include ONLY the keys this entity evidences; omit the rest
        // credential:  label, username, password, totp, url
        // asset:       name, category (SERVER|NAS|NETWORK_GEAR|FIREWALL|WIRELESS|COMPUTER|PRINTER|PHONE_SYSTEM|OTHER), make, model, serial, ipAddress, macAddress, managementUrl, room, os
        // location_network: wanIp, lanIp, subnet, gateway, ispName
        // phone_extension:  extension, displayName, did, sipUsername, sipPassword
        // vendor:      name (the company, e.g. "Comcast", "Ubiquiti"), category, supportPhone, supportEmail, website, supportUrl, accountNumber — a service provider / supplier, NOT a device or login
        // any:         notes
      }
    }
  ]
}`

function buildSystem(clients: { id: string; name: string }[]): string {
  return `You are an intake assistant for DocHub, an MSP documentation platform for the IT shop "Precision Computers" / PCC2K. A technician uploaded a file (a screenshot, a photo of handwritten notes, a scanned printer/router config, a PDF, or text) and wants it filed into DocHub under the right client.

For the uploaded content:
1. RELEVANCE: is it real client IT documentation worth importing (server/firewall/NAS/switch/AP details, IP addresses, credentials/passwords, SIP/phone extensions, WAN/LAN config, vendor logins)? If it's personal, marketing, a generic todo, or has no reusable IT facts, set isRelevant=false.
2. CLIENT MATCH: pick the single best client from the CLIENT LIST below, matching on company name, AD domain, person names, a known WAN IP, or an address. Common aliases: BMG = Braddock Medical Group; PHA / pha.com = Piedmont Housing. If the list has near-duplicate names, pick the closest and list the other in clientAlternatives. If you genuinely cannot tell, set clientId=null.
3. ENTITY EXTRACTION: pull out each concrete thing that maps to a DocHub record — every credential (username+password), device/asset, location/network fact, and phone extension. Read text in images carefully (OCR). Put the evidence in sourceSnippet and fill only the fields actually present.
4. SOURCE KIND: if the input is an image, classify it (screenshot vs handwritten vs pdf-scan). Otherwise null.

Be precise. Do not invent data. Passwords and IPs must be copied verbatim.

Respond with ONLY a single JSON object (no markdown fences, no prose) in exactly this shape:
${JSON_SHAPE}

CLIENT LIST (id — name):
${clients.map((c) => `${c.id} — ${c.name}`).join("\n")}`
}

export function parseModelJson(text: string): any {
  let t = text.trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) t = fence[1].trim()
  else {
    const s = t.indexOf("{"), e = t.lastIndexOf("}")
    if (s >= 0 && e > s) t = t.slice(s, e + 1)
  }
  return JSON.parse(t)
}

// A rendered multi-page document (e.g. an image-based PDF) for vision.
export type MultiImageContent = { kind: "images"; images: { base64: string; mediaType: string }[]; summary: string }

export async function classifyNote(opts: {
  title: string
  extracted: ExtractedContent | MultiImageContent
  clients: { id: string; name: string }[]
  model?: string
}): Promise<{ parsed: any; usage: { inTokens: number; outTokens: number }; model: string }> {
  const { title, extracted, clients } = opts
  const model = opts.model || NOTES_INTAKE_MODEL
  const anthropic = getAnthropic()

  const header = `Uploaded file: "${title}"\nPreprocessing: ${extracted.summary}`
  const userContent: any[] = []
  if (extracted.kind === "text") {
    userContent.push({ type: "text", text: `${header}\n\n----- CONTENT -----\n${extracted.text}` })
  } else if (extracted.kind === "image") {
    userContent.push({ type: "text", text: header })
    userContent.push({ type: "image", source: { type: "base64", media_type: extracted.mediaType, data: extracted.base64 } })
    userContent.push({ type: "text", text: "Transcribe and extract from the image above." })
  } else if (extracted.kind === "images") {
    userContent.push({ type: "text", text: `${header}\n\nThe ${extracted.images.length} image(s) below are the pages of a document (scan / Freeform board / photo).` })
    extracted.images.forEach((im) => userContent.push({ type: "image", source: { type: "base64", media_type: im.mediaType, data: im.base64 } }))
    userContent.push({ type: "text", text: "Transcribe all text (including handwriting and Post-it notes) and extract from the images above." })
  } else {
    userContent.push({ type: "text", text: `${header}\n\nThe file contents could not be extracted. Reason from the filename alone; if insufficient, set isRelevant=false with empty entities.` })
  }

  const resp = await anthropic.messages.create({
    model,
    max_tokens: 4000,
    system: buildSystem(clients),
    messages: [{ role: "user", content: userContent }],
  })
  const textBlock = resp.content.find((b: any) => b.type === "text") as any
  const parsed = parseModelJson(textBlock.text)
  return {
    parsed,
    usage: { inTokens: resp.usage.input_tokens, outTokens: resp.usage.output_tokens },
    model,
  }
}
