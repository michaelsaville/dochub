/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only"
import crypto from "crypto"
import { z } from "zod"
import type Anthropic from "@anthropic-ai/sdk"
import { prisma } from "@/lib/prisma"
import { openValue } from "@/lib/notes-intake-secrets"
import { scopeAllows, scopeWhere, type ClientScope } from "@/lib/client-scope"
import { ASSET_CATEGORIES, ASSET_FIELDS } from "./apply"
import { checkIp, checkMac, checkSerial, normMac, normSerial } from "./identifiers"
import { harvestEntitySecrets, redactDeep, redactText, resolveHandles, sealJson, type SecretMap } from "./secrets"
import { imageRefKey, listViewables, renderViewable } from "./sources"

export type ToolCtx = {
  suggestionId: string
  conversationId: string
  staffUserId: string
  scope: ClientScope
  secrets: SecretMap
  proposalsThisTurn: number
  onProposal: (p: any) => void
}

const MAX_PROPOSALS_PER_TURN = 12

// ── schemas ─────────────────────────────────────────────────────────────────
const Empty = z.object({})
const ViewSource = z.object({
  index: z.number().int().min(0).describe("Viewable index from get_pile_item.viewables"),
  page: z.number().int().min(1).optional().describe("PDF page (1-based). Ignored for images."),
  bbox: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).optional()
    .describe("Zoom region as 0..1 fractions of the image (x,y = top-left). Use to read small label text."),
})
const FindClient = z.object({ name: z.string().min(1) })
const GetClient = z.object({ clientId: z.string().min(1) })
const FindAsset = z.object({
  query: z.string().min(1).describe("Serial, MAC, model, name or IP fragment"),
  clientId: z.string().optional(),
})
const Evidence = z.string().min(1).describe("Exactly where in the source this came from, e.g. 'photo 3 label, bottom line' or 'note line: \"Front desk phone S/N …\"'")
const AssetFieldsShape = {
  make: z.string().optional(), model: z.string().optional(), serial: z.string().optional(),
  assetTag: z.string().optional(), ipAddress: z.string().optional(), macAddress: z.string().optional(),
  managementUrl: z.string().optional(), room: z.string().optional(), os: z.string().optional(),
  firmwareVersion: z.string().optional(), friendlyName: z.string().optional(),
}
const ProposeAssetCreate = z.object({
  clientId: z.string().min(1),
  locationId: z.string().min(1),
  name: z.string().min(1),
  category: z.enum(ASSET_CATEGORIES as [string, ...string[]]),
  ...AssetFieldsShape,
  notes: z.string().optional(),
  evidence: Evidence,
})
const ProposeAssetUpdate = z.object({
  assetId: z.string().min(1),
  changes: z.record(z.string(), z.string()).describe(`Field → new value. Allowed fields: ${ASSET_FIELDS.join(", ")}`),
  locationId: z.string().optional().describe("Move the asset to this location of the same client"),
  appendNotes: z.string().optional().describe("Text appended to the asset's notes"),
  evidence: Evidence,
})
const ProposeCredential = z.object({
  clientId: z.string().min(1),
  label: z.string().min(1).describe("What this login is for, e.g. 'Front desk Grandstream web admin'"),
  username: z.string().optional(),
  password: z.string().min(1).describe("A ⟦secret:N⟧ handle from the note text, or the value exactly as read from an image"),
  url: z.string().optional(),
  assetId: z.string().optional().describe("Existing asset this login opens"),
  notes: z.string().optional(),
  evidence: Evidence,
})

function schemaOf(s: z.ZodType): Anthropic.Tool.InputSchema {
  const j: any = z.toJSONSchema(s)
  delete j.$schema
  return j
}

const DEFS: { name: string; description: string; schema: z.ZodType }[] = [
  { name: "find_asset", description: "Search existing DocHub assets by serial, MAC, model, name or IP (normalised matching). ALWAYS do this before proposing a new asset so you propose an update instead of a duplicate.", schema: FindAsset },
  { name: "find_client", description: "Find DocHub clients by (fuzzy) name, including learned folder aliases.", schema: FindClient },
  { name: "get_client", description: "A client's locations (ids) and its existing assets and credential labels (no secret values).", schema: GetClient },
  { name: "get_pile_item", description: "The current pile item: title, folder, note text (secrets replaced by ⟦secret:N⟧ handles), the earlier one-shot AI extraction, and the list of viewable files (photos/PDF pages).", schema: Empty },
  { name: "propose_asset_create", description: "Queue a NEW asset for the operator to approve. Not written until approved.", schema: ProposeAssetCreate },
  { name: "propose_asset_update", description: "Queue changes to an EXISTING asset (fill or overwrite fields, move location, append notes). Not written until approved.", schema: ProposeAssetUpdate },
  { name: "propose_credential", description: "Queue a new login for the encrypted vault. Pass the password as its ⟦secret:N⟧ handle when it came from note text. Not written until approved.", schema: ProposeCredential },
  { name: "view_source", description: "Look at a source file (photo or PDF page) for this item, optionally zoomed to a region.", schema: ViewSource },
]

export const TOOLS: Anthropic.Tool[] = DEFS
  .slice()
  .sort((a, b) => a.name.localeCompare(b.name))
  .map((d) => ({ name: d.name, description: d.description, input_schema: schemaOf(d.schema) }))

const SCHEMAS: Record<string, z.ZodType> = Object.fromEntries(DEFS.map((d) => [d.name, d.schema]))

type ToolOut = { content: Anthropic.ToolResultBlockParam["content"]; isError?: boolean; summary: string }

// ── executor ────────────────────────────────────────────────────────────────
export async function runTool(name: string, input: unknown, ctx: ToolCtx): Promise<ToolOut> {
  const schema = SCHEMAS[name]
  if (!schema) return { content: `Unknown tool ${name}`, isError: true, summary: `unknown tool ${name}` }
  const parsed = schema.safeParse(input)
  if (!parsed.success) return { content: `Invalid input: ${parsed.error.message}`, isError: true, summary: `${name}: invalid input` }
  const a: any = parsed.data
  try {
    switch (name) {
      case "get_pile_item": return await getPileItem(ctx)
      case "view_source": return await viewSource(a, ctx)
      case "find_client": return await findClient(a.name, ctx)
      case "get_client": return await getClient(a.clientId, ctx)
      case "find_asset": return await findAsset(a, ctx)
      case "propose_asset_create": return await propose("asset_create", a, ctx)
      case "propose_asset_update": return await propose("asset_update", a, ctx)
      case "propose_credential": return await propose("credential_create", a, ctx)
    }
  } catch (err: any) {
    return { content: `Tool error: ${String(err?.message || err).slice(0, 300)}`, isError: true, summary: `${name} failed` }
  }
  return { content: "unreachable", isError: true, summary: name }
}

const json = (v: unknown) => JSON.stringify(v, null, 1)

async function getPileItem(ctx: ToolCtx): Promise<ToolOut> {
  const s = await prisma.noteSuggestion.findUnique({ where: { id: ctx.suggestionId } })
  if (!s) return { content: "Pile item not found", isError: true, summary: "item missing" }
  if (s.matchedClientId && !scopeAllows(ctx.scope, s.matchedClientId)) return { content: "Outside your client scope", isError: true, summary: "scope" }
  harvestEntitySecrets(s.entitiesJson, ctx.secrets)
  const raw = openValue(s.rawText)
  const text = redactText(typeof raw === "string" ? raw : "", ctx.secrets)
  const prior = redactDeep(
    ((s.entitiesJson as any[]) || []).map((e: any) => ({ kind: e.kind, summary: e.summary, confidence: e.confidence, fields: stripSecretFields(e), snippet: e.sourceSnippet })),
    ctx.secrets,
  )
  const viewables = await listViewables(ctx.suggestionId)
  return {
    summary: `read item "${s.noteTitle}"`,
    content: "<untrusted_source_data>\n" + json({
      title: s.noteTitle,
      folder: s.sourceFolder,
      sourcePath: s.sourcePath,
      sourceType: s.sourceType,
      status: s.status,
      aiClientGuess: s.matchedClientId ? { clientId: s.matchedClientId, name: s.matchedClientName, confidence: s.clientConfidence } : null,
      text: text.length > 40000 ? text.slice(0, 40000) + "\n…[truncated]" : text,
      earlierExtraction: prior,
      viewables,
    }) + "\n</untrusted_source_data>",
  }
}

function stripSecretFields(e: any) {
  const f = { ...(e?.fields || {}) }
  for (const k of ["password", "totp", "sipPassword"]) if (f[k]) f[k] = "(secret present — see ⟦secret⟧ handles in text)"
  return f
}

async function viewSource(a: z.infer<typeof ViewSource>, ctx: ToolCtx): Promise<ToolOut> {
  const viewables = await listViewables(ctx.suggestionId)
  const v = viewables.find((x) => x.index === a.index)
  if (!v) return { content: `No viewable #${a.index}`, isError: true, summary: "bad index" }
  const page = v.kind === "pdf" ? a.page || 1 : 1
  const img = await renderViewable(ctx.suggestionId, v.ref, page, a.bbox || null)
  if ("error" in img) return { content: img.error, isError: true, summary: `view ${v.name} failed` }
  return {
    summary: `viewed ${v.name}${v.kind === "pdf" ? ` p${page}` : ""}${a.bbox ? " (zoom)" : ""}`,
    content: [
      { type: "text", text: `${v.name}${v.kind === "pdf" ? ` page ${page}` : ""}${a.bbox ? ` zoom ${json(a.bbox)}` : ""} (untrusted source content)` },
      // stored as a ref in history; loop.ts rehydrates identical bytes on replay
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: imageRefKey(ctx.suggestionId, v.ref, page, a.bbox || null) } },
    ],
  }
}

async function findClient(name: string, ctx: ToolCtx): Promise<ToolOut> {
  const q = name.toLowerCase().trim()
  const [clients, aliases] = await Promise.all([
    prisma.client.findMany({ where: { isActive: true, ...scopeWhere(ctx.scope) }, select: { id: true, name: true } }),
    prisma.clientAlias.findMany({ select: { alias: true, clientId: true } }),
  ])
  const tok = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((t) => t.length > 1))
  const qt = tok(q)
  const scored = clients.map((c) => {
    const n = c.name.toLowerCase()
    let score = n === q ? 1 : n.includes(q) || q.includes(n) ? 0.85 : 0
    const ct = tok(n); let inter = 0; for (const t of qt) if (ct.has(t)) inter++
    score = Math.max(score, qt.size ? inter / Math.max(qt.size, ct.size) : 0)
    if (aliases.some((al) => al.clientId === c.id && (al.alias === q || q.includes(al.alias)))) score = Math.max(score, 0.9)
    return { clientId: c.id, name: c.name, score: Math.round(score * 100) / 100 }
  }).filter((x) => x.score >= 0.25).sort((a, b) => b.score - a.score).slice(0, 8)
  return { summary: `find client "${name}" → ${scored.length}`, content: json(scored) }
}

async function getClient(clientId: string, ctx: ToolCtx): Promise<ToolOut> {
  if (!scopeAllows(ctx.scope, clientId)) return { content: "Outside your client scope", isError: true, summary: "scope" }
  const c = await prisma.client.findFirst({ where: { id: clientId, isActive: true }, select: { id: true, name: true } })
  if (!c) return { content: "Client not found", isError: true, summary: "no client" }
  const [locations, assets, creds] = await Promise.all([
    prisma.location.findMany({ where: { clientId, isActive: true }, select: { id: true, name: true, address: true, city: true }, orderBy: { createdAt: "asc" } }),
    prisma.asset.findMany({
      where: { location: { clientId }, status: { not: "RETIRED" as any } },
      select: { id: true, name: true, category: true, make: true, model: true, serial: true, macAddress: true, ipAddress: true, room: true, locationId: true },
      take: 300, orderBy: { name: "asc" },
    }),
    prisma.credential.findMany({ where: { clientId, isRetired: false }, select: { id: true, label: true, username: true, assetId: true }, take: 300, orderBy: { label: "asc" } }),
  ])
  return {
    summary: `client ${c.name}: ${locations.length} loc, ${assets.length} assets`,
    content: json({ client: c, locations, assets, credentials: creds }),
  }
}

async function findAsset(a: z.infer<typeof FindAsset>, ctx: ToolCtx): Promise<ToolOut> {
  if (a.clientId && !scopeAllows(ctx.scope, a.clientId)) return { content: "Outside your client scope", isError: true, summary: "scope" }
  const q = a.query.trim()
  const ns = normSerial(q), nm = normMac(q)
  const where: any = {
    ...(a.clientId ? { location: { clientId: a.clientId } } : ctx.scope.all ? {} : { location: { clientId: { in: (ctx.scope as any).clientIds } } }),
    OR: [
      { serial: { contains: q, mode: "insensitive" } },
      { macAddress: { contains: q, mode: "insensitive" } },
      { model: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
      { ipAddress: { contains: q } },
      { assetTag: { contains: q, mode: "insensitive" } },
    ],
  }
  let rows = await prisma.asset.findMany({
    where, take: 25,
    select: { id: true, name: true, category: true, make: true, model: true, serial: true, macAddress: true, ipAddress: true, room: true, location: { select: { id: true, name: true, client: { select: { id: true, name: true } } } } },
  })
  // normalised serial / MAC equality catches "AB-12 34" vs "AB1234" and colon/dash MAC styles
  if (ns.length >= 5 || nm.length === 12) {
    const extra = await prisma.$queryRaw<{ id: string }[]>`
      SELECT a.id FROM "Asset" a
      WHERE regexp_replace(upper(coalesce(a.serial,'')), '[^A-Z0-9]', '', 'g') = ${ns}
         OR regexp_replace(upper(coalesce(a."macAddress",'')), '[^0-9A-F]', '', 'g') = ${nm}
      LIMIT 10`
    const have = new Set(rows.map((r) => r.id))
    const ids = extra.map((e) => e.id).filter((id) => !have.has(id))
    if (ids.length) {
      const more = await prisma.asset.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, category: true, make: true, model: true, serial: true, macAddress: true, ipAddress: true, room: true, location: { select: { id: true, name: true, client: { select: { id: true, name: true } } } } } })
      rows = [...more.filter((m) => scopeAllows(ctx.scope, m.location.client.id)), ...rows]
    }
  }
  const out = rows.slice(0, 15).map((r) => ({ id: r.id, name: r.name, category: r.category, make: r.make, model: r.model, serial: r.serial, mac: r.macAddress, ip: r.ipAddress, room: r.room, client: r.location.client, location: { id: r.location.id, name: r.location.name } }))
  return { summary: `find asset "${q}" → ${out.length}`, content: json(out) }
}

// ── proposals ───────────────────────────────────────────────────────────────
type Row = { field: string; before?: string | null; after: string; secret?: boolean; warn?: string }

async function breadcrumb(clientId: string, locationId?: string | null) {
  const c = await prisma.client.findFirst({ where: { id: clientId, isActive: true }, select: { id: true, name: true } })
  const l = locationId ? await prisma.location.findFirst({ where: { id: locationId, clientId }, select: { id: true, name: true } }) : null
  return { client: c, location: l }
}

function idRows(fields: Record<string, any>, before: Record<string, any> = {}): Row[] {
  const rows: Row[] = []
  for (const [k, raw] of Object.entries(fields)) {
    if (raw == null || raw === "") continue
    let v = String(raw), warn: string | undefined
    if (k === "macAddress") { const c = checkMac(v); v = c.value; warn = c.warn; fields[k] = v }
    else if (k === "serial") { const c = checkSerial(v); v = c.value; warn = c.warn }
    else if (k === "ipAddress") { const c = checkIp(v); warn = c.warn }
    rows.push({ field: k, before: before[k] ?? null, after: v, ...(warn ? { warn } : {}) })
  }
  return rows
}

async function propose(kind: "asset_create" | "asset_update" | "credential_create", a: any, ctx: ToolCtx): Promise<ToolOut> {
  if (ctx.proposalsThisTurn >= MAX_PROPOSALS_PER_TURN) return { content: "Proposal limit for this turn reached — wait for the operator.", isError: true, summary: "proposal cap" }

  let clientId: string, locationId: string | null = null, targetId: string | null = null
  let payload: any, title: string, rows: Row[]
  let crumbAsset: string | null = null

  if (kind === "asset_create") {
    clientId = a.clientId; locationId = a.locationId
    const { evidence: _e, clientId: _c, locationId: _l, notes, name, category, ...fields } = a
    void _e; void _c; void _l
    rows = [{ field: "name", after: name }, { field: "category", after: category }, ...idRows(fields)]
    if (notes) rows.push({ field: "notes", after: notes })
    payload = { locationId, name, category, ...fields, notes }
    title = "CREATE ASSET"
    crumbAsset = name
  } else if (kind === "asset_update") {
    const asset = await prisma.asset.findUnique({ where: { id: a.assetId }, include: { location: { select: { clientId: true, id: true, name: true } } } })
    if (!asset) return { content: "Asset not found", isError: true, summary: "asset missing" }
    clientId = asset.location.clientId; targetId = asset.id; locationId = a.locationId || asset.location.id
    const changes: Record<string, string> = {}
    const bad: string[] = []
    for (const [k, v] of Object.entries(a.changes as Record<string, string>)) {
      if (!(ASSET_FIELDS as readonly string[]).includes(k)) { bad.push(k); continue }
      if ((asset as any)[k] === v) continue
      changes[k] = v
    }
    if (bad.length) return { content: `Not allowed fields: ${bad.join(", ")}. Allowed: ${ASSET_FIELDS.join(", ")}`, isError: true, summary: "bad fields" }
    rows = idRows(changes, asset as any)
    if (a.locationId && a.locationId !== asset.location.id) rows.push({ field: "location", before: asset.location.name, after: (await breadcrumb(clientId, a.locationId)).location?.name || "?" })
    if (a.appendNotes) rows.push({ field: "notes (append)", after: a.appendNotes })
    if (!rows.length) return { content: "No change: every value already matches.", summary: "no-op update" }
    payload = { patch: changes, locationId: a.locationId || null, appendNotes: a.appendNotes || null }
    title = "UPDATE ASSET"
    crumbAsset = asset.name
  } else {
    clientId = a.clientId
    const pw = resolveHandles(a.password, ctx.secrets)
    if (/⟦secret:/.test(pw)) return { content: "Unknown secret handle", isError: true, summary: "bad handle" }
    if (a.assetId) {
      const asset = await prisma.asset.findFirst({ where: { id: a.assetId, location: { clientId } }, select: { name: true } })
      if (!asset) return { content: "assetId is not an asset of that client", isError: true, summary: "bad asset link" }
      crumbAsset = asset.name
    }
    // register the plaintext so it is masked anywhere it might be echoed later
    if (pw.length >= 4 && !Object.values(ctx.secrets).includes(pw)) ctx.secrets[`⟦secret:${Object.keys(ctx.secrets).length + 1}⟧`] = pw
    payload = { label: a.label, username: a.username || null, password: pw, url: a.url || null, assetId: a.assetId || null, notes: a.notes || null }
    rows = [
      { field: "label", after: a.label },
      ...(a.username ? [{ field: "username", after: a.username }] : []),
      { field: "password", after: "••••••••", secret: true },
      ...(a.url ? [{ field: "url", after: a.url }] : []),
      ...(crumbAsset ? [{ field: "opens", after: crumbAsset }] : []),
    ]
    title = "ADD CREDENTIAL"
  }

  if (!scopeAllows(ctx.scope, clientId)) return { content: "Outside your client scope", isError: true, summary: "scope" }
  const crumb = await breadcrumb(clientId, locationId)
  if (!crumb.client) return { content: "Client not found or inactive", isError: true, summary: "no client" }
  if (kind === "asset_create" && !crumb.location) return { content: "locationId is not a location of that client — call get_client for valid ids", isError: true, summary: "bad location" }

  const opHash = crypto.createHash("sha256").update(kind + "|" + clientId + "|" + (targetId || "") + "|" + JSON.stringify(payload)).digest("hex").slice(0, 32)
  const existing = await prisma.agentProposal.findUnique({ where: { conversationId_opHash: { conversationId: ctx.conversationId, opHash } } })
  if (existing) return { content: `Already proposed as ${existing.id.slice(-6)} (status ${existing.status}).`, summary: "duplicate proposal" }

  const displayJson = {
    title,
    breadcrumb: { client: crumb.client, location: crumb.location, asset: crumbAsset },
    rows: rows.map((r) => ({ ...r, after: r.secret ? r.after : redactText(String(r.after), { ...ctx.secrets }) })),
    evidence: redactText(a.evidence, { ...ctx.secrets }),
    hasSecret: kind === "credential_create",
  }
  const toolUseId = (a as any).__toolUseId || ""
  const row = await prisma.agentProposal.create({
    data: {
      conversationId: ctx.conversationId, suggestionId: ctx.suggestionId, toolUseId,
      kind, clientId, locationId, targetId,
      payloadSealed: sealJson(payload), displayJson, opHash,
    },
  })
  ctx.proposalsThisTurn++
  ctx.onProposal({ id: row.id, kind, status: row.status, displayJson, createdAt: row.createdAt })
  const warns = rows.filter((r) => r.warn).map((r) => `${r.field}: ${r.warn}`)
  return {
    summary: `proposed ${title.toLowerCase()} ${crumbAsset || ""}`.trim(),
    content: `Queued proposal ${row.id.slice(-6)} — NOT written yet; the operator will approve, edit or reject it.${warns.length ? " Validator warnings shown to operator: " + warns.join("; ") : ""}`,
  }
}
