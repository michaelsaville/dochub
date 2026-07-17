import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/crypto"
import { createReadStream } from "fs"
import { stat } from "fs/promises"
import path from "path"

// ─── Relational NDJSON dump of the DocHub dataset ─────────────────────────────
//
// Produces ONE newline-delimited-JSON stream. Every record is tagged with a
// `__model` discriminator naming the Prisma delegate it came from; all FK cuids
// are preserved verbatim, so a restore into an empty DB rehydrates the full
// relational graph (see scripts/restore-backup.sh). Sections are emitted in a
// roughly parent-first order so a naive in-order loader satisfies most FKs.
//
// secretsMode:
//   "ciphertext" (default, safest, restorable-with-ENCRYPTION_KEY) — encrypted*
//     columns are dumped exactly as stored.
//   "decrypted" (audited, migration-out) — each encrypted* column is nulled and
//     a parallel `decrypted<Field>` plaintext column is added, so a restore can
//     never mistake plaintext for ciphertext. Flex-asset embedded passwords stay
//     ciphertext (they live inside a JSON blob keyed by field type).

const UPLOAD_DIR = process.env.UPLOAD_DIR || "/uploads"

export type SecretsMode = "ciphertext" | "decrypted"
export type BackupScope = "tenant" | "client"

export type SerializeOpts = {
  scope: BackupScope
  clientId?: string | null
  secretsMode: SecretsMode
  includeUploads: boolean
}

export type ItemCounts = Record<string, number>

type Section = {
  /** Prisma delegate name (camelCase model). */
  model: string
  /** Column holding the owning client id, when the model has a direct scalar. */
  clientField?: string
  /**
   * For client-scoped models WITHOUT a direct clientId scalar (e.g. Asset →
   * location.clientId), a where-builder for scope=client. Sections with neither
   * clientField nor clientWhere are TENANT-ONLY and skipped in a per-client dump.
   */
  clientWhere?: (clientId: string) => Record<string, unknown>
  /** encrypted* columns that "decrypted" mode should turn into plaintext. */
  secrets?: string[]
}

// Ordered parent-first. Client-scoped models carry `clientField` so a scope=client
// dump can filter them; sections with no clientField are TENANT-ONLY (skipped in a
// per-client export — documented in restore/DR notes).
export const SECTIONS: Section[] = [
  // ── platform / auth / config (tenant-global) ──
  { model: "appSetting" },
  { model: "staffUser" },
  { model: "staffUserPasskey" },
  { model: "apiKey" },
  { model: "personalCredential", secrets: ["encryptedPassword", "encryptedTotp", "encryptedNotes"] },
  { model: "personalSecureNote", secrets: ["encryptedBody"] },

  // ── vendors (referenced by clients/assets) ──
  { model: "vendor" },
  { model: "vendorContact" },

  // ── clients & org ──
  { model: "client", clientField: "id" },
  { model: "location", clientField: "clientId" },
  { model: "person", clientField: "clientId" },

  // ── asset backbone ──
  { model: "assetType" },
  { model: "assetTypeTemplate" },
  // Asset scopes via location.clientId (no direct clientId scalar).
  { model: "asset", clientWhere: (c) => ({ location: { clientId: c } }) },
  { model: "assetLink" },
  { model: "assetInterface" },
  { model: "exitInterview" },

  // ── typed sub-assets (keyed by assetId, tenant-only for scope filtering) ──
  { model: "networkDevice", clientField: "clientId" },
  { model: "vlan", clientField: "clientId" },
  { model: "switchPort" },
  { model: "rack" },
  { model: "rackSlot" },
  { model: "subnet", clientField: "clientId" },
  { model: "ipAssignment" },
  { model: "adDomain", clientField: "clientId" },
  { model: "domainGroup" },
  { model: "networkShare", clientField: "clientId" },
  { model: "sharePermission" },
  { model: "vpnGateway", clientField: "clientId" },
  { model: "vpnAccessor" },
  { model: "phoneSystem", clientField: "clientId" },
  { model: "sipTrunk" },
  { model: "sipDid" },
  { model: "potsLine" },
  { model: "potsNumber" },
  { model: "phoneExtension" },
  { model: "cameraSystem", clientField: "clientId" },
  { model: "camera" },
  { model: "wifiController", clientField: "clientId" },
  { model: "wifiNetwork" },
  { model: "ptpLink", clientField: "clientId" },
  { model: "internetCircuit", clientField: "clientId" },

  // ── credentials & licensing ──
  { model: "credential", clientField: "clientId", secrets: ["encryptedPassword", "encryptedTotp", "encryptedNotes"] },
  { model: "license", clientField: "clientId" },
  { model: "licenseSeatAssignment" },
  { model: "application" },
  { model: "appSeatAssignment" },

  // ── backup bookkeeping (client-facing — distinct from Platform* backups) ──
  { model: "synologyConfig", secrets: ["encryptedPassword"] },
  { model: "synologyBackupJob" },
  { model: "backupConfig", clientField: "clientId" },
  { model: "backupProtectedAsset" },

  // ── vendor relationships / contracts ──
  { model: "vendorClientGrant", clientField: "clientId" },
  { model: "vendorContract", clientField: "clientId" },
  { model: "vendorShare" },
  { model: "integrationSyncStatus" },

  // ── documents & runbooks ──
  { model: "documentFolder", clientField: "clientId" },
  { model: "clientDocument", clientField: "clientId" },
  { model: "documentVersion" },
  { model: "runbookCategory" },
  { model: "runbookTag" },
  { model: "runbook", clientField: "clientId" },
  { model: "runbookVersion" },
  { model: "runbookTagMap" },
  { model: "runbookStep" },
  { model: "runbookRun", clientField: "clientId" },
  { model: "runbookStepCompletion" },

  // ── flexible assets ──
  { model: "flexLayout" },
  { model: "flexLayoutField" },
  { model: "flexAsset", clientField: "clientId" },
  { model: "flexAssetRelation" },

  // ── templates ──
  { model: "templateCategory" },
  { model: "template" },

  // ── attachments (bytes bundled separately when includeUploads) ──
  { model: "clientAttachment", clientField: "clientId" },
  { model: "attachmentAccessLog" },

  // ── portal ──
  { model: "portalUser", clientField: "clientId" },
  { model: "portalCredential", clientField: "clientId", secrets: ["encryptedPassword", "encryptedTotp"] },

  // ── misc data ──
  { model: "website", clientField: "clientId" },
  { model: "networkDiagram", clientField: "clientId" },
  { model: "customReport" },
  { model: "intakeSuggestion", clientField: "clientId" },
  { model: "ephemeralNote", secrets: ["encryptedContent"] },
  { model: "secureShareLink" },
  { model: "staffClientAssignment", clientField: "clientId" },
  { model: "vendorClientGrant" },

  // ── history & alerts (append-mostly) ──
  { model: "fieldHistory" },
  { model: "activityEvent", clientField: "clientId" },
  { model: "alarm", clientField: "clientId" },
  { model: "auditLog", clientField: "clientId" },
  { model: "outboundMessage" },
]

// de-dupe (vendorClientGrant appears once intentionally; guard against edits)
const SEEN = new Set<string>()
const ORDERED = SECTIONS.filter((s) => (SEEN.has(s.model) ? false : (SEEN.add(s.model), true)))

// JSON.stringify cannot serialize BigInt — encode as a decimal string. The
// restore loader coerces known BigInt columns back. Dates already ISO-serialize.
function jsonLine(obj: unknown): string {
  return (
    JSON.stringify(obj, (_k, v) => (typeof v === "bigint" ? v.toString() : v)) + "\n"
  )
}

function applySecrets(row: Record<string, unknown>, secrets: string[] | undefined, mode: SecretsMode) {
  if (mode !== "decrypted" || !secrets) return row
  const out: Record<string, unknown> = { ...row }
  for (const col of secrets) {
    const enc = out[col]
    if (typeof enc === "string" && enc.length > 0) {
      try {
        out[`decrypted${col.replace(/^encrypted/, "")}`] = decrypt(enc)
        out[col] = null
      } catch {
        // leave ciphertext in place if it can't be decrypted; mark it
        out[`decrypted${col.replace(/^encrypted/, "")}`] = null
      }
    }
  }
  return out
}

/**
 * Async generator of NDJSON lines. The first line is a `__manifest` record; the
 * rest are one `{ __model, ...row }` per DB row, followed (when includeUploads)
 * by `__upload` records carrying base64 file bytes. `counts` is MUTATED as rows
 * are emitted, so the caller can read final per-model counts once the stream has
 * been fully consumed.
 */
export async function* serializeDataset(opts: SerializeOpts, counts: ItemCounts): AsyncGenerator<string> {
  const scopedClientId = opts.scope === "client" ? opts.clientId ?? null : null

  yield jsonLine({
    __model: "__manifest",
    schemaVersion: 1,
    format: "dochub-ndjson/1",
    generatedAt: new Date().toISOString(),
    appVersion: process.env.APP_VERSION || process.env.GIT_SHA || null,
    scope: opts.scope,
    clientId: scopedClientId,
    secretsMode: opts.secretsMode,
    includeUploads: opts.includeUploads,
  })

  for (const section of ORDERED) {
    // per-client scope: skip tenant-only sections (no direct client column)
    let where: Record<string, unknown> | undefined
    if (scopedClientId) {
      if (section.clientWhere) where = section.clientWhere(scopedClientId)
      else if (section.clientField) where = { [section.clientField]: scopedClientId }
      else continue // tenant-only section, skipped in a per-client dump
    }

    const delegate = (prisma as unknown as Record<string, { findMany: (a: unknown) => Promise<unknown[]> }>)[section.model]
    if (!delegate?.findMany) continue

    let rows: unknown[]
    try {
      rows = await delegate.findMany(where ? { where } : {})
    } catch (e) {
      // A model that can't be dumped must not abort the whole backup.
      yield jsonLine({ __model: "__error", section: section.model, error: (e as Error).message })
      continue
    }

    for (const raw of rows) {
      const row = applySecrets(raw as Record<string, unknown>, section.secrets, opts.secretsMode)
      counts[section.model] = (counts[section.model] ?? 0) + 1
      yield jsonLine({ __model: section.model, ...row })
    }
  }

  // Upload bytes (opt-in). One record per attachment file, streamed+base64'd one
  // file at a time so peak memory stays bounded by the largest single upload.
  if (opts.includeUploads) {
    const attWhere = scopedClientId ? { clientId: scopedClientId } : {}
    const atts = await prisma.clientAttachment.findMany({
      where: attWhere,
      select: { storageName: true, originalName: true, clientId: true },
    })
    let uploaded = 0
    for (const att of atts) {
      const p = path.join(UPLOAD_DIR, att.storageName)
      try {
        await stat(p)
      } catch {
        yield jsonLine({ __model: "__upload_missing", storageName: att.storageName })
        continue
      }
      const b64 = await readFileBase64(p)
      uploaded++
      yield jsonLine({
        __model: "__upload",
        storageName: att.storageName,
        originalName: att.originalName,
        clientId: att.clientId,
        base64: b64,
      })
    }
    counts["__upload"] = uploaded
  }
}

function readFileBase64(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const rs = createReadStream(filePath)
    rs.on("error", reject)
    rs.on("data", (d) => chunks.push(d as Buffer))
    rs.on("end", () => resolve(Buffer.concat(chunks).toString("base64")))
  })
}
