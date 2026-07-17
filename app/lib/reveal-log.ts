import { prisma } from "@/lib/prisma"
import { writeAudit, type AuditActorType } from "@/lib/audit-log"

/**
 * Audit a secret reveal. Dual-writes (during the transition to the tamper-evident
 * log): (1) a FieldHistory row (field="reveal") for the existing per-credential
 * history drawer, and (2) an append-only, hash-chained AuditLog entry. Both are
 * best-effort — a logging failure must never block or break the reveal.
 *
 * source: "staff" | "api-key" | "personal-vault" | "portal" | "share" | "breach-check"
 */
export async function logReveal(opts: {
  entityType?: string
  entityId: string
  actor?: string | null
  source: string
  clientId?: string | null
  actorId?: string | null
  ip?: string | null
  userAgent?: string | null
}): Promise<void> {
  const entityType = opts.entityType ?? "credential"
  try {
    await prisma.fieldHistory.create({
      data: {
        entityType,
        entityId: opts.entityId,
        field: "reveal",
        oldValue: null,
        newValue: opts.source,
        changedBy: opts.actor || "unknown",
      },
    })
  } catch (e) {
    console.error("[reveal-log] fieldHistory failed", opts.entityId, opts.source, e)
  }

  const actorType: AuditActorType =
    opts.source === "api-key" ? "API_KEY" : opts.source === "portal" || opts.source === "share" ? "PORTAL" : "STAFF"
  await writeAudit({
    action: `${entityType}.reveal`,
    actorType,
    actorId: opts.actorId ?? null,
    actorLabel: opts.actor || "unknown",
    entityType,
    entityId: opts.entityId,
    clientId: opts.clientId ?? null,
    summary: `Revealed ${entityType} secret (${opts.source})`,
    metadata: { source: opts.source },
    ip: opts.ip ?? null,
    userAgent: opts.userAgent ?? null,
  })
}
