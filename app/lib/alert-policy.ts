// ─── Alert policy (pure, client-safe — no Prisma) ───────────────────────────
// One place that decides whether an expiry is ACTIONABLE (loud: counts toward
// the header bell / Expired+Critical tiles / nightly digest) or merely
// INFORMATIONAL (kept for reference, hidden from default views).
//
// The rule that made the bell useless before: a warranty that ended in 2014
// was "expired" forever, and every never-rotated credential was "critical".
// Neither is something a tech can act on today, so:
//   * anything that expired more than STALE_AFTER_DAYS ago → urgency "info",
//     stale:true (shown only under the "long expired (info)" filter);
//   * assets that are retired/disposed/lost/stolen never generate warranty
//     items at all.

export type AlertUrgency = "expired" | "critical" | "warning" | "upcoming" | "info"

/** Expired longer ago than this → informational, not actionable. */
export const STALE_AFTER_DAYS = 90

/** Asset statuses that must never raise warranty alerts. */
export const ASSET_STATUSES_WITHOUT_WARRANTY_ALERTS = ["RETIRED", "DISPOSED", "STOLEN", "LOST"] as const

const MS_PER_DAY = 86_400_000

export function daysFromNow(d: Date | string, now: Date = new Date()): number {
  const t = (d instanceof Date ? d : new Date(d)).getTime()
  return (t - now.getTime()) / MS_PER_DAY
}

/** True when an expiry date is more than STALE_AFTER_DAYS in the past. */
export function isStaleExpiry(expiresAt: Date | string, now: Date = new Date()): boolean {
  return daysFromNow(expiresAt, now) < -STALE_AFTER_DAYS
}

/** Urgency for a hard expiry date. Long-expired → "info". */
export function expiryUrgency(expiresAt: Date | string, now: Date = new Date()): AlertUrgency {
  const days = daysFromNow(expiresAt, now)
  if (days < -STALE_AFTER_DAYS) return "info"
  if (days < 0) return "expired"
  if (days <= 7) return "critical"
  if (days <= 30) return "warning"
  return "upcoming"
}

/** Actionable = counts toward the bell (expired within 90d, or due ≤ 7d). */
export function isBellUrgency(u: AlertUrgency): boolean {
  return u === "expired" || u === "critical"
}
