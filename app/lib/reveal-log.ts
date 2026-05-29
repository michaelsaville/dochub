import { prisma } from "@/lib/prisma"

/**
 * Audit a credential reveal. Writes a FieldHistory row (field="reveal") so it
 * surfaces in the existing per-credential history drawer and answers the
 * compliance question every MSP doc tool must: "who viewed this secret, when".
 * Best-effort — a logging failure must never block or break the reveal.
 *
 * source: "staff" | "api-key" | "personal-vault" | "portal" | "share" | "breach-check"
 */
export async function logReveal(opts: {
  entityType?: string
  entityId: string
  actor?: string | null
  source: string
}): Promise<void> {
  try {
    await prisma.fieldHistory.create({
      data: {
        entityType: opts.entityType ?? "credential",
        entityId: opts.entityId,
        field: "reveal",
        oldValue: null,
        newValue: opts.source,
        changedBy: opts.actor || "unknown",
      },
    })
  } catch (e) {
    console.error("[reveal-log] failed", opts.entityId, opts.source, e)
  }
}
