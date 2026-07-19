// notes-ingest-files.mjs — batch-ingest a folder of PDFs / images (scans,
// Freeform boards, screenshots, handwritten photos) into the Notes Intake
// review queue via Claude vision. Host-run, writes NoteSuggestion rows.
//
//   ANTHROPIC_API_KEY=... DATABASE_URL=postgresql://…@172.18.0.9:5432/db \
//     node scripts/notes-ingest-files.mjs --notes <dir> --clients clients.json \
//       --source freeform [--limit N] [--model claude-opus-4-8]

import fs from "node:fs"
import fsp from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import crypto from "node:crypto"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import Anthropic from "@anthropic-ai/sdk"
import { PrismaClient } from "@prisma/client"

const execFileP = promisify(execFile)
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : d }
const NOTES_DIR = arg("notes")
const CLIENTS_FILE = arg("clients")
const SOURCE = arg("source", "files")
const MODEL = arg("model", "claude-opus-4-8")
const LIMIT = arg("limit") ? parseInt(arg("limit"), 10) : Infinity
const WRITE_DB = process.argv.includes("--db") || true // this tool always writes rows
if (!NOTES_DIR || !CLIENTS_FILE) { console.error("usage: --notes <dir> --clients <clients.json> [--source] [--model] [--limit]"); process.exit(1) }

const clients = JSON.parse(fs.readFileSync(CLIENTS_FILE, "utf8")) || []
const anthropic = new Anthropic()
const prisma = new PrismaClient()

const JSON_SHAPE = `{
  "isRelevant": boolean,
  "relevanceReason": string,
  "clientId": string | null,
  "clientName": string | null,
  "clientConfidence": number,
  "clientReasoning": string,
  "clientAlternatives": string[],
  "sourceKind": "screenshot" | "handwritten" | "pdf-scan" | "other" | null,
  "entities": [ { "kind": "credential"|"asset"|"location_network"|"phone_extension"|"other", "confidence": number, "summary": string, "sourceSnippet": string, "fields": { } } ]
}`
const SYSTEM = `You are an intake assistant for DocHub, an MSP documentation platform for the IT shop "Precision Computers" / PCC2K. A technician gave you a scanned document, Apple Freeform board, screenshot, or photo of handwritten notes / Post-its, and wants it filed under the right client.

1. RELEVANCE: is it real client IT documentation (device/printer/router/firewall config, IP addresses, credentials, SIP/phone, WAN/LAN, serials)? If personal/marketing/no reusable IT facts, isRelevant=false.
2. CLIENT MATCH: pick the best client from the CLIENT LIST (company name, AD domain, person, WAN IP, address). Aliases: BMG=Braddock Medical Group, PHA/pha.com=Piedmont Housing. Near-duplicate names → pick closest, list other in clientAlternatives. Unsure → clientId=null.
3. ENTITY EXTRACTION: read ALL text in the image(s) including handwriting and Post-its. Pull each credential (username+password), device/asset (name, make, model, serial, ipAddress, macAddress, room), location/network fact (wanIp, lanIp, subnet, gateway, ispName), phone extension (extension, displayName, did, sipUsername, sipPassword). Verbatim. Put evidence in sourceSnippet.
4. SOURCE KIND: classify the image (screenshot vs handwritten vs pdf-scan), else null.

Respond with ONLY a single JSON object in this shape (no markdown):
${JSON_SHAPE}

CLIENT LIST (id — name):
${clients.map((c) => `${c.id} — ${c.name}`).join("\n")}`

function parseJson(t) {
  t = t.trim()
  const f = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (f) t = f[1].trim(); else { const s = t.indexOf("{"), e = t.lastIndexOf("}"); if (s >= 0 && e > s) t = t.slice(s, e + 1) }
  return JSON.parse(t)
}

const sharpMod = (await import("sharp")).default
async function toJpegB64(buf) {
  const jpg = await sharpMod(buf).resize(1568, 1568, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer()
  return jpg.toString("base64")
}
async function pdfToImages(absPath, maxPages = 5) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "nif-"))
  try {
    await execFileP("pdftoppm", ["-png", "-r", "200", "-f", "1", "-l", String(maxPages), absPath, path.join(dir, "pg")], { maxBuffer: 64 * 1024 * 1024 })
    const files = (await fsp.readdir(dir)).filter((f) => f.endsWith(".png")).sort()
    const out = []
    for (const f of files) out.push({ base64: await toJpegB64(await fsp.readFile(path.join(dir, f))), mediaType: "image/jpeg" })
    return out
  } finally { await fsp.rm(dir, { recursive: true, force: true }) }
}

function walk(dir) {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(p))
    else if (/\.(pdf|png|jpe?g|heic|webp)$/i.test(e.name)) out.push(p)
  }
  return out
}

let files = walk(NOTES_DIR).sort().slice(0, LIMIT)
console.error(`[files] ${files.length} file(s) | model=${MODEL} | ${clients.length} clients`)
const batch = await prisma.noteIntakeBatch.create({ data: { source: SOURCE, model: MODEL, status: "RUNNING" } })

let inserted = 0, skipped = 0, relevant = 0, done = 0
for (const file of files) {
  const rel = path.relative(NOTES_DIR, file)
  const title = path.basename(file).replace(/\.[^.]+$/, "")
  const buf = await fsp.readFile(file)
  const hash = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16)
  const dup = await prisma.noteSuggestion.findFirst({ where: { noteHash: hash }, select: { id: true } })
  if (dup) { skipped++; done++; continue }

  const isPdf = /\.pdf$/i.test(file)
  let content, sourceType
  try {
    if (isPdf) {
      const images = await pdfToImages(file, 5)
      content = { kind: "images", images, summary: `PDF, ${images.length} page(s)` }
      sourceType = "pdf-scan"
    } else {
      content = { kind: "images", images: [{ base64: await toJpegB64(buf), mediaType: "image/jpeg" }], summary: "image" }
      sourceType = "screenshot"
    }
  } catch (err) { console.error(`[files] render failed ${rel}: ${err.message}`); done++; continue }

  const userContent = [{ type: "text", text: `File: "${title}"\n${content.summary}. The image(s) below are the page(s):` }]
  content.images.forEach((im) => userContent.push({ type: "image", source: { type: "base64", media_type: im.mediaType, data: im.base64 } }))
  userContent.push({ type: "text", text: "Transcribe all text (handwriting/Post-its included) and extract per the schema." })

  try {
    const resp = await anthropic.messages.create({ model: MODEL, max_tokens: 4000, system: SYSTEM, messages: [{ role: "user", content: userContent }] })
    const parsed = parseJson(resp.content.find((b) => b.type === "text").text)
    const entities = (parsed.entities || []).map((e) => ({ ...e, include: true }))
    if (parsed.isRelevant) relevant++
    await prisma.noteSuggestion.create({
      data: {
        batchId: batch.id, origin: "ingest",
        sourceType: parsed.sourceKind || sourceType,
        sourceAbsPath: path.resolve(file),
        sourcePath: rel, sourceFolder: path.dirname(rel) === "." ? SOURCE : path.dirname(rel),
        noteTitle: title, noteHash: hash, rawText: `[${content.summary} · ${title}]`,
        status: parsed.isRelevant ? "PENDING" : "SKIPPED",
        isRelevant: !!parsed.isRelevant, relevanceReason: parsed.relevanceReason || null,
        matchedClientId: parsed.clientId || null, matchedClientName: parsed.clientName || null,
        clientConfidence: typeof parsed.clientConfidence === "number" ? parsed.clientConfidence : null,
        clientReasoning: parsed.clientReasoning || null, clientCandidatesJson: parsed.clientAlternatives || [],
        entitiesJson: entities, aiModel: MODEL, aiTokensIn: resp.usage.input_tokens, aiTokensOut: resp.usage.output_tokens,
      },
    })
    inserted++
  } catch (err) { console.error(`[files] AI failed ${rel}: ${err.message}`) }
  done++
  console.error(`[files] ${done}/${files.length} — ${title}`)
}

await prisma.noteIntakeBatch.update({ where: { id: batch.id }, data: { status: "DONE", notesTotal: files.length, notesRelevant: relevant } })
await prisma.$disconnect()
console.error(`[files] done: inserted ${inserted}, skipped ${skipped} dup, relevant ${relevant}`)
