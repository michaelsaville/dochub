import { prisma } from "@/lib/prisma"
import crypto from "crypto"

// ─── Tamper-evident, append-only audit trail ────────────────────────────────
// Every sensitive mutation calls writeAudit(). Each row's `hash` is an HMAC over
// the previous row's hash + this row's canonical payload, forming a chain: any
// insert/edit/delete of a past row breaks verification. The chain head is kept
// in AppSetting (audit:head_hash / audit:head_seq). A Postgres transaction-level
// advisory lock serializes concurrent writers so the chain stays linear.

const GENESIS = "GENESIS"
const LOCK_ID = 4823710 // arbitrary constant; serializes audit chain writes

// Secret HMAC key: dedicated var if provided, else reuse the app's ENCRYPTION_KEY
// (already a required secret), with a last-resort constant so logging never crashes.
function hmacKey(): string {
  return process.env.AUDIT_HMAC_KEY || process.env.ENCRYPTION_KEY || "dochub-audit-hmac-fallback"
}

// Deterministic JSON: recursively sorts object keys so JSONB round-tripping
// (which does NOT preserve key order) can't spuriously break the chain.
function canonical(v: any): string {
  if (v === null || v === undefined) return "null"
  if (typeof v !== "object") return JSON.stringify(v)
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]"
  return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canonical(v[k])).join(",") + "}"
}

export type AuditActorType = "STAFF" | "API_KEY" | "PORTAL" | "SYSTEM"

export type AuditInput = {
  action: string // e.g. "credential.reveal", "auth.login", "backup.download", "flex.reveal"
  actorType?: AuditActorType
  actorId?: string | null
  actorLabel: string // snapshot (name/email) — never an FK
  entityType?: string | null
  entityId?: string | null
  clientId?: string | null
  summary: string
  metadata?: Record<string, unknown>
  ip?: string | null
  userAgent?: string | null
}

function payloadOf(r: {
  at: Date; actorType: string; actorId: string | null; actorLabel: string; action: string
  entityType: string | null; entityId: string | null; clientId: string | null; summary: string
  metadata: unknown; ip: string | null; userAgent: string | null
}) {
  return {
    at: r.at.toISOString(), actorType: r.actorType, actorId: r.actorId ?? null, actorLabel: r.actorLabel,
    action: r.action, entityType: r.entityType ?? null, entityId: r.entityId ?? null, clientId: r.clientId ?? null,
    summary: r.summary, metadata: r.metadata ?? {}, ip: r.ip ?? null, userAgent: r.userAgent ?? null,
  }
}

function hashOf(prevHash: string, payload: object): string {
  return crypto.createHmac("sha256", hmacKey()).update(prevHash + "\n" + canonical(payload)).digest("hex")
}

// Best-effort: a logging failure must NEVER block or break the audited action.
export async function writeAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_ID})`
      const head = await tx.appSetting.findUnique({ where: { key: "audit:head_hash" } })
      const prevHash = head?.value ?? GENESIS
      const at = new Date()
      const base = {
        at,
        actorType: (input.actorType ?? "STAFF") as AuditActorType,
        actorId: input.actorId ?? null,
        actorLabel: input.actorLabel,
        action: input.action,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        clientId: input.clientId ?? null,
        summary: input.summary,
        metadata: (input.metadata ?? {}) as any,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      }
      const hash = hashOf(prevHash, payloadOf(base))
      const row = await tx.auditLog.create({ data: { ...base, prevHash, hash } })
      await tx.appSetting.upsert({ where: { key: "audit:head_hash" }, create: { key: "audit:head_hash", value: hash }, update: { value: hash } })
      await tx.appSetting.upsert({ where: { key: "audit:head_seq" }, create: { key: "audit:head_seq", value: row.seq.toString() }, update: { value: row.seq.toString() } })
    })
  } catch (e) {
    console.error("[audit-log] write failed:", input.action, e)
  }
}

// Recompute the whole chain; returns the first broken row (if any).
export async function verifyAuditChain(): Promise<{ ok: boolean; checked: number; brokenAt?: string; brokenSeq?: string }> {
  const rows = await prisma.auditLog.findMany({ orderBy: { seq: "asc" } })
  let prevHash = GENESIS
  for (const r of rows) {
    const expect = hashOf(prevHash, payloadOf(r as any))
    if (r.prevHash !== prevHash || r.hash !== expect) {
      return { ok: false, checked: rows.length, brokenAt: r.id, brokenSeq: r.seq.toString() }
    }
    prevHash = r.hash
  }
  return { ok: true, checked: rows.length }
}
