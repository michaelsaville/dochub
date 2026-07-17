// Standalone out-of-band verifier for the tamper-evident AuditLog chain.
//
// Recomputes the HMAC hash-chain independently of the web tier and prints
// OK / BROKEN. Mirrors lib/audit-log.ts's canonical()/payloadOf()/hashOf()
// EXACTLY — keep them in sync if that file's hashing ever changes.
//
// Needs DATABASE_URL (the same Postgres the app uses) and the SAME chain key
// the app writes with: AUDIT_HMAC_KEY, else ENCRYPTION_KEY. If neither is set
// it falls back to the dev constant and prints an "unkeyed" warning.
//
// Run from the app root (never automatically — this is on-demand / cron only):
//   DATABASE_URL=... AUDIT_HMAC_KEY=... node scripts/verify-audit-chain.mjs
//
// Exit code 0 = chain intact, 1 = broken / error (for CI / cron alerting).

import { PrismaClient } from "@prisma/client"
import crypto from "crypto"

const GENESIS = "GENESIS"

function hmacKey() {
  return process.env.AUDIT_HMAC_KEY || process.env.ENCRYPTION_KEY || "dochub-audit-hmac-fallback"
}

const KEYED = Boolean(process.env.AUDIT_HMAC_KEY || process.env.ENCRYPTION_KEY)

// Deterministic JSON: recursively sorts object keys so JSONB round-tripping
// (which does NOT preserve key order) can't spuriously break the chain.
function canonical(v) {
  if (v === null || v === undefined) return "null"
  if (typeof v !== "object") return JSON.stringify(v)
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]"
  return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canonical(v[k])).join(",") + "}"
}

function payloadOf(r) {
  return {
    at: r.at.toISOString(),
    actorType: r.actorType,
    actorId: r.actorId ?? null,
    actorLabel: r.actorLabel,
    action: r.action,
    entityType: r.entityType ?? null,
    entityId: r.entityId ?? null,
    clientId: r.clientId ?? null,
    summary: r.summary,
    metadata: r.metadata ?? {},
    ip: r.ip ?? null,
    userAgent: r.userAgent ?? null,
  }
}

function hashOf(prevHash, payload) {
  return crypto.createHmac("sha256", hmacKey()).update(prevHash + "\n" + canonical(payload)).digest("hex")
}

async function main() {
  const prisma = new PrismaClient()
  try {
    if (!KEYED) {
      console.warn("⚠  UNKEYED: neither AUDIT_HMAC_KEY nor ENCRYPTION_KEY is set — using the dev fallback key. Verification is only meaningful with the real chain key.")
    }
    const rows = await prisma.auditLog.findMany({ orderBy: { seq: "asc" } })
    let prevHash = GENESIS
    let prevSeq = null
    for (const r of rows) {
      const expect = hashOf(prevHash, payloadOf(r))
      if (r.prevHash !== prevHash || r.hash !== expect) {
        console.error(`✗ BROKEN at seq ${r.seq.toString()} (id ${r.id}) — ${r.prevHash !== prevHash ? "prevHash link mismatch" : "hash mismatch"}.`)
        console.error(`  checked ${rows.length} rows before the break.`)
        process.exit(1)
      }
      if (prevSeq !== null && r.seq !== prevSeq + 1n) {
        // A gap means a tail/middle row was deleted (BigInt seq is monotonic).
        console.error(`✗ BROKEN: sequence gap before seq ${r.seq.toString()} (expected ${(prevSeq + 1n).toString()}) — a row was likely deleted.`)
        process.exit(1)
      }
      prevHash = r.hash
      prevSeq = r.seq
    }
    console.log(`✓ OK — chain intact, ${rows.length} entries verified${rows.length ? `, seq ${rows[0].seq.toString()}…${rows[rows.length - 1].seq.toString()}` : ""}.${KEYED ? "" : " (UNKEYED)"}`)
    process.exit(0)
  } catch (e) {
    console.error("✗ ERROR verifying chain:", e)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
