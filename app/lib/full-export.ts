import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/crypto"
import crypto from "crypto"
import { createWriteStream } from "fs"
import { mkdir, stat, unlink } from "fs/promises"
import path from "path"

// ─── Full structured export (migration-out) ─────────────────────────────────
// Relational NDJSON dump of DocHub's data, one line per row, every FK cuid
// preserved verbatim so the bundle re-imports (or migrates OUT to another tool).
// This EXTENDS the redacted CSV export at /api/export/[entity] — that stays
// intact for quick spreadsheet pulls; this is the full-fidelity relational one.
//
// secretsMode:
//   "ciphertext" (default) — encrypted* columns are dumped as-is (portable only
//                            with DocHub's ENCRYPTION_KEY; safest, re-importable).
//   "decrypted"            — encrypted* columns are decrypted in place (a
//                            departing client legitimately needs their own
//                            passwords). ADMIN-only + AUDITED at the call site.
//   "omit"                 — encrypted* columns are nulled out.
//
// Personal-vault data (PersonalCredential / PersonalSecureNote / EphemeralNote)
// is staff-personal, never client documentation, so it is NEVER exported.

export const EXPORT_DIR = "/uploads/exports"
const TOKEN_TTL_MS = 48 * 60 * 60 * 1000 // 48h expiring links (IT Glue parity)
const TOKEN_PREFIX = "export:full:token:"
const SCHEMA_VERSION = 1

export type SecretsMode = "ciphertext" | "decrypted" | "omit"
export type ExportScope = "tenant" | "client"

export function normalizeSecretsMode(v: unknown): SecretsMode {
  return v === "decrypted" || v === "omit" ? v : "ciphertext"
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any

type ScopeCtx = { clientId: string; ids: Record<string, string[]> }

type Section = {
  /** Prisma delegate name (camelCase model). */
  name: string
  /** Reference data (no client owner): dumped in full for BOTH scopes. */
  global?: boolean
  /** Cannot be cleanly client-scoped: dumped only in tenant exports. */
  tenantOnly?: boolean
  /** Ciphertext columns — honored by secretsMode. */
  secretFields?: string[]
  /** Build the Prisma `where` for a per-client export. */
  clientWhere?: (ctx: ScopeCtx) => Record<string, unknown>
}

const inIds = (field: string, key: string) => (ctx: ScopeCtx) => ({
  [field]: { in: ctx.ids[key] ?? [] },
})
const byClient = (ctx: ScopeCtx) => ({ clientId: ctx.clientId })

// Parents before children so a straight top-to-bottom re-import satisfies FKs.
const SECTIONS: Section[] = [
  { name: "client", clientWhere: (c) => ({ id: c.clientId }) },
  { name: "location", clientWhere: byClient },
  { name: "person", clientWhere: byClient },

  // Reference / type data — needed to rehydrate typed assets & runbooks.
  { name: "assetType", global: true },
  { name: "assetTypeTemplate", global: true },
  { name: "runbookCategory", global: true },
  { name: "runbookTag", global: true },
  { name: "vendor", global: true },
  { name: "vendorContact", global: true },

  // Configurations (hard-coded Asset model + typed children).
  { name: "asset", clientWhere: (c) => ({ location: { clientId: c.clientId } }) },
  { name: "assetInterface", clientWhere: inIds("assetId", "asset") },
  { name: "assetLink", clientWhere: (c) => ({ OR: [{ assetId: { in: c.ids.asset } }, { linkedAssetId: { in: c.ids.asset } }] }) },
  { name: "networkDevice", clientWhere: byClient },
  { name: "vlan", clientWhere: byClient },
  { name: "switchPort", clientWhere: (c) => ({ OR: [{ networkDeviceId: { in: c.ids.networkDevice } }, { assetId: { in: c.ids.asset } }] }) },
  { name: "subnet", clientWhere: byClient },
  { name: "ipAssignment", clientWhere: inIds("subnetId", "subnet") },
  { name: "rack", clientWhere: (c) => ({ location: { clientId: c.clientId } }) },
  { name: "rackSlot", clientWhere: inIds("rackId", "rack") },
  { name: "adDomain", clientWhere: byClient },
  { name: "domainGroup", clientWhere: inIds("domainId", "adDomain") },
  { name: "networkShare", clientWhere: byClient },
  { name: "sharePermission", clientWhere: inIds("shareId", "networkShare") },
  { name: "phoneSystem", clientWhere: byClient },
  { name: "sipTrunk", clientWhere: inIds("systemId", "phoneSystem") },
  { name: "sipDid", clientWhere: inIds("trunkId", "sipTrunk") },
  { name: "potsLine", clientWhere: inIds("systemId", "phoneSystem") },
  { name: "potsNumber", clientWhere: inIds("lineId", "potsLine") },
  { name: "phoneExtension", clientWhere: inIds("systemId", "phoneSystem") },
  { name: "cameraSystem", clientWhere: byClient },
  { name: "camera", clientWhere: inIds("systemId", "cameraSystem") },
  { name: "wifiController", clientWhere: byClient },
  { name: "wifiNetwork", clientWhere: inIds("controllerId", "wifiController") },
  { name: "ptpLink", clientWhere: byClient },
  { name: "vpnGateway", clientWhere: byClient },
  { name: "vpnAccessor", clientWhere: inIds("gatewayId", "vpnGateway") },
  { name: "internetCircuit", clientWhere: byClient },

  // Credentials & licensing.
  { name: "credential", secretFields: ["encryptedPassword", "encryptedTotp", "encryptedNotes"], clientWhere: byClient },
  { name: "license", clientWhere: byClient },
  { name: "licenseSeatAssignment", clientWhere: inIds("licenseId", "license") },
  { name: "application", clientWhere: byClient },
  { name: "appSeatAssignment", clientWhere: inIds("applicationId", "application") },

  // Docs & runbooks.
  { name: "documentFolder", clientWhere: byClient },
  { name: "clientDocument", clientWhere: byClient },
  { name: "documentVersion", clientWhere: inIds("documentId", "clientDocument") },
  { name: "runbook", clientWhere: byClient },
  { name: "runbookStep", clientWhere: inIds("runbookId", "runbook") },
  { name: "runbookTagMap", clientWhere: inIds("runbookId", "runbook") },
  { name: "runbookRun", clientWhere: byClient },
  { name: "runbookStepCompletion", clientWhere: inIds("runId", "runbookRun") },

  // Flexible assets.
  { name: "flexLayout", global: true },
  { name: "flexLayoutField", global: true },
  { name: "flexAsset", clientWhere: byClient },
  { name: "flexAssetRelation", clientWhere: inIds("flexAssetId", "flexAsset") },

  // Vendors, backups, portal, misc — all client-scoped.
  { name: "vendorClientGrant", clientWhere: byClient },
  { name: "vendorContract", clientWhere: byClient },
  { name: "website", clientWhere: byClient },
  { name: "clientAttachment", clientWhere: byClient }, // metadata only; bytes not bundled
  { name: "networkDiagram", clientWhere: byClient },
  { name: "backupConfig", clientWhere: byClient },
  { name: "portalUser", clientWhere: byClient },
  { name: "portalCredential", secretFields: ["encryptedPassword", "encryptedTotp"], clientWhere: byClient },
  { name: "alarm", clientWhere: byClient },
  { name: "activityEvent", clientWhere: byClient },
  { name: "intakeSuggestion", clientWhere: byClient },

  // Tenant-wide only (no clean per-client key).
  { name: "synologyConfig", secretFields: ["encryptedPassword"], tenantOnly: true },
]

// BigInt/Date-safe JSON. Prisma Dates already toJSON to ISO; BigInt needs help.
function safeStringify(obj: unknown): string {
  return JSON.stringify(obj, (_k, v) => (typeof v === "bigint" ? v.toString() : v))
}

async function collectClientIds(clientId: string): Promise<Record<string, string[]>> {
  const idsOf = async (delegate: string, where: Record<string, unknown>): Promise<string[]> => {
    try {
      const rows = await db[delegate].findMany({ where, select: { id: true } })
      return rows.map((r: { id: string }) => r.id)
    } catch {
      return []
    }
  }
  const phoneSystem = await idsOf("phoneSystem", { clientId })
  const ids: Record<string, string[]> = {
    location: await idsOf("location", { clientId }),
    asset: await idsOf("asset", { location: { clientId } }),
    networkDevice: await idsOf("networkDevice", { clientId }),
    subnet: await idsOf("subnet", { clientId }),
    rack: await idsOf("rack", { location: { clientId } }),
    adDomain: await idsOf("adDomain", { clientId }),
    networkShare: await idsOf("networkShare", { clientId }),
    phoneSystem,
    sipTrunk: await idsOf("sipTrunk", { systemId: { in: phoneSystem } }),
    potsLine: await idsOf("potsLine", { systemId: { in: phoneSystem } }),
    cameraSystem: await idsOf("cameraSystem", { clientId }),
    wifiController: await idsOf("wifiController", { clientId }),
    vpnGateway: await idsOf("vpnGateway", { clientId }),
    license: await idsOf("license", { clientId }),
    application: await idsOf("application", { clientId }),
    clientDocument: await idsOf("clientDocument", { clientId }),
    runbook: await idsOf("runbook", { clientId }),
    runbookRun: await idsOf("runbookRun", { clientId }),
    flexAsset: await idsOf("flexAsset", { clientId }),
  }
  return ids
}

function applySecrets(rows: Record<string, unknown>[], fields: string[], mode: SecretsMode): void {
  if (mode === "ciphertext") return
  for (const row of rows) {
    for (const f of fields) {
      const v = row[f]
      if (typeof v !== "string" || !v) continue
      if (mode === "omit") {
        row[f] = null
      } else if (mode === "decrypted") {
        try {
          row[f] = decrypt(v)
        } catch {
          /* leave ciphertext on failure — never drop the row */
        }
      }
    }
  }
}

export type FullExportResult = {
  token: string
  filename: string
  path: string
  sizeBytes: number
  expiresAt: string
  counts: Record<string, number>
}

export async function runFullExport(opts: {
  scope: ExportScope
  clientId?: string | null
  secretsMode: SecretsMode
  generatedBy: string
}): Promise<FullExportResult> {
  const { scope, secretsMode } = opts
  const clientId = opts.clientId ?? null
  if (scope === "client" && !clientId) throw new Error("client scope requires clientId")

  await mkdir(EXPORT_DIR, { recursive: true })
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12)
  const rand = crypto.randomBytes(6).toString("hex")
  const filename = `dochub-full-export-${scope}-${clientId ?? "tenant"}-${stamp}-${rand}.ndjson`
  const filePath = path.join(EXPORT_DIR, filename)
  const stream = createWriteStream(filePath, { encoding: "utf8" })

  const write = (obj: unknown): Promise<void> => {
    const line = safeStringify(obj) + "\n"
    if (!stream.write(line)) return new Promise((res) => stream.once("drain", () => res()))
    return Promise.resolve()
  }

  const ctx: ScopeCtx =
    scope === "client"
      ? { clientId: clientId as string, ids: await collectClientIds(clientId as string) }
      : { clientId: "", ids: {} }

  const counts: Record<string, number> = {}
  const skipped: string[] = []

  await write({
    section: "_manifest",
    data: {
      schemaVersion: SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      generatedBy: opts.generatedBy,
      scope,
      clientId,
      secretsMode,
      note: "Relational NDJSON; FK cuids preserved. Attachment file bytes are NOT bundled (metadata only). Personal-vault data is excluded by design.",
    },
  })

  for (const section of SECTIONS) {
    let where: Record<string, unknown> | null = {}
    if (scope === "client") {
      if (section.global) where = {}
      else if (section.tenantOnly) where = null
      else if (section.clientWhere) where = section.clientWhere(ctx)
      else where = null
    }
    if (where === null) {
      skipped.push(section.name)
      continue
    }
    try {
      const rows: Record<string, unknown>[] = await db[section.name].findMany({ where })
      if (section.secretFields) applySecrets(rows, section.secretFields, secretsMode)
      for (const row of rows) await write({ section: section.name, data: row })
      counts[section.name] = rows.length
    } catch (e) {
      console.error(`[full-export] section ${section.name} failed:`, e)
      counts[section.name] = -1
    }
  }

  await write({ section: "_summary", data: { counts, skippedForScope: skipped, totalRows: Object.values(counts).reduce((a, b) => a + Math.max(0, b), 0) } })

  await new Promise<void>((res, rej) => {
    stream.on("error", rej)
    stream.end(() => res())
  })

  const st = await stat(filePath)
  const token = crypto.randomBytes(24).toString("hex")
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString()
  await prisma.appSetting.upsert({
    where: { key: TOKEN_PREFIX + token },
    create: { key: TOKEN_PREFIX + token, value: JSON.stringify({ path: filePath, filename, scope, clientId, secretsMode, sizeBytes: st.size, createdAt: new Date().toISOString(), expiresAt, counts }) },
    update: { value: JSON.stringify({ path: filePath, filename, scope, clientId, secretsMode, sizeBytes: st.size, createdAt: new Date().toISOString(), expiresAt, counts }) },
  })

  void pruneExpiredExports()

  return { token, filename, path: filePath, sizeBytes: st.size, expiresAt, counts }
}

export type ExportTokenMeta = {
  path: string
  filename: string
  scope: ExportScope
  clientId: string | null
  secretsMode: SecretsMode
  sizeBytes: number
  createdAt: string
  expiresAt: string
  counts?: Record<string, number>
}

/** Resolve a download token → file meta, or null if unknown/expired (expired
 *  files + their token rows are pruned on access). */
export async function resolveExportToken(token: string): Promise<ExportTokenMeta | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: TOKEN_PREFIX + token } }).catch(() => null)
  if (!row) return null
  let meta: ExportTokenMeta
  try {
    meta = JSON.parse(row.value)
  } catch {
    return null
  }
  if (new Date(meta.expiresAt).getTime() <= Date.now()) {
    await unlink(meta.path).catch(() => {})
    await prisma.appSetting.delete({ where: { key: TOKEN_PREFIX + token } }).catch(() => {})
    return null
  }
  return meta
}

/** Best-effort: delete expired export files + their token rows so the
 *  /uploads/exports dir and AppSetting don't accumulate. */
export async function pruneExpiredExports(): Promise<void> {
  try {
    const rows = await prisma.appSetting.findMany({ where: { key: { startsWith: TOKEN_PREFIX } } })
    const now = Date.now()
    for (const r of rows) {
      try {
        const meta: ExportTokenMeta = JSON.parse(r.value)
        if (new Date(meta.expiresAt).getTime() <= now) {
          await unlink(meta.path).catch(() => {})
          await prisma.appSetting.delete({ where: { key: r.key } }).catch(() => {})
        }
      } catch {
        /* skip malformed */
      }
    }
  } catch {
    /* best-effort */
  }
}
