// notes-ingest.mjs — DocHub Notes Intake (PROOF stage: read-only, writes JSON only)
//
// Walks an Apple Notes / Obsidian markdown tree, and for each note asks Claude:
//   (a) is this MSP client documentation worth importing?  (relevance gate)
//   (b) which DocHub client does it belong to?              (fuzzy match + confidence)
//   (c) what entities/fields does it contain?               (credentials/assets/network/phone)
// Output is a suggestions JSON file. NOTHING is written to DocHub.
//
// Run from ~/dochub/app so node_modules resolves:
//   ANTHROPIC_API_KEY=... node ../../notes-intake-work/notes-ingest.mjs \
//       --notes <dir> --clients <clients.json> --out <out.json> [--limit N] [--model claude-opus-4-8]

import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import Anthropic from "@anthropic-ai/sdk"
import { PrismaClient } from "@prisma/client"

// ---------- args ----------
function arg(name, def = undefined) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : def
}
const NOTES_DIR = arg("notes")
const CLIENTS_FILE = arg("clients")
const OUT_FILE = arg("out", "suggestions.json")
const LIMIT = arg("limit") ? parseInt(arg("limit"), 10) : Infinity
const MODEL = arg("model", "claude-opus-4-8")
const ONLY = arg("only") // optional substring filter on relative path
const WRITE_DB = process.argv.includes("--db") // also write NoteSuggestion rows
const SOURCE = arg("source", "export") // batch source label
if (!NOTES_DIR || !CLIENTS_FILE) {
  console.error("usage: --notes <dir> --clients <clients.json> [--out] [--limit] [--model] [--only substr]")
  process.exit(1)
}

const clients = JSON.parse(fs.readFileSync(CLIENTS_FILE, "utf8")) || []
const client = new Anthropic() // reads ANTHROPIC_API_KEY

// ---------- output shape (described in the prompt; parsed leniently) ----------
const JSON_SHAPE = `{
  "isRelevant": boolean,          // true only if this is client IT documentation (infra, credentials, network, devices, phone). Personal notes, dev/app build logs, todo/shopping lists = false
  "relevanceReason": string,
  "clientId": string | null,      // best-matching client id from the CLIENT LIST, or null if none/unsure
  "clientName": string | null,    // the matched client's name (readability)
  "clientConfidence": number,     // 0.0 - 1.0
  "clientReasoning": string,      // cite evidence: folder name, alias/abbreviation (BMG, PHA), AD domain, person, IP range
  "clientAlternatives": string[], // other plausible client ids, most likely first (may be [])
  "entities": [
    {
      "kind": "credential" | "asset" | "location_network" | "phone_extension" | "other",
      "confidence": number,       // 0.0 - 1.0
      "summary": string,          // short human label, e.g. "SonicWall admin login", "Synology NAS"
      "sourceSnippet": string,    // the exact text in the note this came from
      "fields": {                 // include ONLY the keys this entity evidences; omit the rest
        // credential:  label, username, password, totp, url
        // asset:       name, category (SERVER|NAS|NETWORK_GEAR|FIREWALL|WIRELESS|COMPUTER|PRINTER|PHONE_SYSTEM|OTHER), make, model, serial, ipAddress, macAddress, managementUrl, room, os
        // location_network: wanIp, lanIp, subnet, gateway, ispName
        // phone_extension:  extension, displayName, sipUsername, sipPassword, did
        // any:         notes
      }
    }
  ]
}`

const SYSTEM = `You are an intake assistant for DocHub, an MSP (managed service provider) documentation platform for the IT shop "Precision Computers" / PCC2K. You are triaging the tech's old, messy Apple Notes so they can be filed into DocHub under the right client.

Your job for each note:
1. RELEVANCE: decide if the note is real client IT documentation worth importing — server/firewall/NAS/switch/AP details, IP addresses, credentials/passwords, SIP/phone extensions, WAN/LAN config, vendor logins. If it's a personal note, a shopping list, a software-development/build log, a generic todo, or has no reusable IT facts, set isRelevant=false.
2. CLIENT MATCH: pick the single best client from the CLIENT LIST below. The note's top-level folder name is usually the client, but names are messy and abbreviated. Common aliases: BMG = Braddock Medical Group; PHA / pha.com = Piedmont Housing. Match on folder name, AD domain, person names, a known WAN IP, or company name in the text. If the client list has near-duplicate names, pick the closest and list the other as an alternative. If you genuinely cannot tell, set clientId=null.
3. ENTITY EXTRACTION: pull out each concrete thing that maps to a DocHub record. For every credential (username+password), device/asset (server, firewall, NAS, switch, AP, printer, PBX), location/network fact (WAN IP, LAN subnet, gateway, ISP), and phone extension (ext number, SIP user/pass, DID). Put the evidence in sourceSnippet and fill only the fields the note actually states.

Be precise. Do not invent data. Passwords and IPs must be copied verbatim from the note.

Respond with ONLY a single JSON object (no markdown fences, no prose) in exactly this shape:
${JSON_SHAPE}

CLIENT LIST (id — name):
${clients.map((c) => `${c.id} — ${c.name}`).join("\n")}`

// ---------- walk notes ----------
function walk(dir) {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === ".git" || e.name === ".obsidian" || e.name === "attachments") continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(p))
    else if (e.name.toLowerCase().endsWith(".md")) out.push(p)
  }
  return out
}

let files = walk(NOTES_DIR)
if (ONLY) files = files.filter((f) => f.toLowerCase().includes(ONLY.toLowerCase()))
files.sort()
files = files.slice(0, LIMIT)

console.error(`[ingest] ${files.length} notes | model=${MODEL} | ${clients.length} clients`)

function parseModelJson(text) {
  let t = text.trim()
  // strip ```json ... ``` fences if present
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) t = fence[1].trim()
  // else grab the outermost {...}
  else {
    const s = t.indexOf("{"), e = t.lastIndexOf("}")
    if (s >= 0 && e > s) t = t.slice(s, e + 1)
  }
  return JSON.parse(t)
}

// ---------- optional DB wiring ----------
const prisma = WRITE_DB ? new PrismaClient() : null
let batch = null
if (WRITE_DB) {
  batch = await prisma.noteIntakeBatch.create({
    data: { source: SOURCE, model: MODEL, status: "RUNNING" },
  })
  console.error(`[ingest] DB batch ${batch.id} (source=${SOURCE})`)
}

const results = []
let done = 0
let inserted = 0
let skippedDup = 0

for (const file of files) {
  const rel = path.relative(NOTES_DIR, file)
  const folder = rel.split(path.sep)[0]
  const title = path.basename(file, ".md")
  const body = fs.readFileSync(file, "utf8").slice(0, 12000)
  const hash = crypto.createHash("sha256").update(body).digest("hex").slice(0, 16)

  const userText = `FOLDER: ${folder}\nTITLE: ${title}\n\n----- NOTE -----\n${body}`

  try {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userText }],
    })
    const textBlock = resp.content.find((b) => b.type === "text")
    const parsed = parseModelJson(textBlock.text)
    results.push({
      sourcePath: rel,
      sourceFolder: folder,
      noteTitle: title,
      noteHash: hash,
      rawText: body,
      ai: parsed,
      usage: { in: resp.usage.input_tokens, cacheRead: resp.usage.cache_read_input_tokens, out: resp.usage.output_tokens },
    })

    if (WRITE_DB) {
      // reconcile: skip if an identical note (same content hash) is already staged
      const dup = await prisma.noteSuggestion.findFirst({ where: { noteHash: hash }, select: { id: true } })
      if (dup) {
        skippedDup++
      } else {
        const entities = (parsed.entities || []).map((e) => ({ ...e, include: true }))
        await prisma.noteSuggestion.create({
          data: {
            batchId: batch.id,
            sourcePath: rel,
            sourceFolder: folder,
            noteTitle: title,
            noteHash: hash,
            rawText: body,
            status: parsed.isRelevant ? "PENDING" : "SKIPPED",
            isRelevant: !!parsed.isRelevant,
            relevanceReason: parsed.relevanceReason || null,
            matchedClientId: parsed.clientId || null,
            matchedClientName: parsed.clientName || null,
            clientConfidence: typeof parsed.clientConfidence === "number" ? parsed.clientConfidence : null,
            clientReasoning: parsed.clientReasoning || null,
            clientCandidatesJson: parsed.clientAlternatives || [],
            entitiesJson: entities,
            aiModel: MODEL,
            aiTokensIn: resp.usage.input_tokens,
            aiTokensOut: resp.usage.output_tokens,
          },
        })
        inserted++
      }
    }
  } catch (err) {
    results.push({ sourcePath: rel, sourceFolder: folder, noteTitle: title, noteHash: hash, error: String(err?.message || err) })
    console.error(`[ingest] ERROR ${rel}: ${err?.message || err}`)
  }
  done++
  if (done % 10 === 0 || done === files.length) console.error(`[ingest] ${done}/${files.length}`)
}

fs.writeFileSync(OUT_FILE, JSON.stringify(results, null, 2))

// ---------- summary ----------
const relevant = results.filter((r) => r.ai?.isRelevant)
const matched = relevant.filter((r) => r.ai?.clientId)
const entities = relevant.reduce((n, r) => n + (r.ai?.entities?.length || 0), 0)

if (WRITE_DB) {
  await prisma.noteIntakeBatch.update({
    where: { id: batch.id },
    data: { status: "DONE", notesTotal: results.length, notesRelevant: relevant.length },
  })
  await prisma.$disconnect()
  console.error(`[ingest] DB: inserted ${inserted}, skipped ${skippedDup} duplicates`)
}

console.error(`\n[ingest] wrote ${OUT_FILE}`)
console.error(`[ingest] relevant: ${relevant.length}/${results.length} | client-matched: ${matched.length}/${relevant.length} | entities: ${entities}`)
