import { getSettingBool, getSettingInt } from "@/lib/settings"

// ─── Password rotation policy (compute-on-read) ─────────────────────────────
// Age-based rotation staleness computed from Credential.lastRotated (falling
// back to createdAt so existing creds get a sensible due date immediately).
// Global policy lives in AppSetting (rotation:*) read with `?? default`, so no
// seed migration is needed. Rotation items are never persisted — they are
// computed in the unified alerts feed / nightly digest exactly like every other
// expiry category; snooze / exempt / mark-rotated are the lifecycle instead.
//
// NOTE: getRotationSettings touches Prisma (server-only). computeRotation is a
// pure function — safe to mirror on the client, but keep the Prisma-backed
// getRotationSettings out of client bundles.

export type RotationStatus = "exempt" | "snoozed" | "ok" | "dueSoon" | "overdue"

// Mirrors AlertUrgency in app/api/alerts/unified/route.ts (kept local to avoid a
// route→lib→route import cycle).
export type RotationUrgency = "expired" | "critical" | "warning" | "upcoming" | "info"

export interface RotationSettings {
  enabled: boolean
  defaultDays: number
  warnDays: number
}

export interface RotationInput {
  lastRotated?: Date | string | null
  createdAt?: Date | string | null
  rotationIntervalDays?: number | null
  rotationExempt?: boolean | null
  rotationSnoozedUntil?: Date | string | null
}

export interface RotationResult {
  status: RotationStatus
  dueDate: Date | null
  daysOverdue: number
  daysUntilDue: number
  intervalDays: number
}

const MS_PER_DAY = 86_400_000

/** Read the three rotation AppSetting keys with the documented defaults. */
export async function getRotationSettings(): Promise<RotationSettings> {
  const [enabled, defaultDays, warnDays] = await Promise.all([
    getSettingBool("rotation:enabled", true),
    getSettingInt("rotation:defaultDays", 90),
    getSettingInt("rotation:warnDays", 14),
  ])
  return { enabled, defaultDays, warnDays }
}

function toDate(v?: Date | string | null): Date | null {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Pure. Given a credential's rotation fields + the global policy, return its
 * rotation status, due date and day counts. Baseline = lastRotated ?? createdAt;
 * interval = per-credential override ?? policy default.
 */
export function computeRotation(
  cred: RotationInput,
  settings: RotationSettings,
  now: Date = new Date(),
): RotationResult {
  const intervalDays =
    cred.rotationIntervalDays && cred.rotationIntervalDays > 0
      ? cred.rotationIntervalDays
      : settings.defaultDays

  const baseline = toDate(cred.lastRotated) ?? toDate(cred.createdAt)
  const dueDate = baseline ? new Date(baseline.getTime() + intervalDays * MS_PER_DAY) : null

  const result: RotationResult = {
    status: "ok",
    dueDate,
    daysOverdue: 0,
    daysUntilDue: 0,
    intervalDays,
  }

  if (cred.rotationExempt) {
    result.status = "exempt"
    return result
  }

  const snooze = toDate(cred.rotationSnoozedUntil)
  if (snooze && snooze.getTime() > now.getTime()) {
    result.status = "snoozed"
    result.daysUntilDue = Math.ceil((snooze.getTime() - now.getTime()) / MS_PER_DAY)
    return result
  }

  if (!dueDate) {
    result.status = "ok"
    return result
  }

  const remainingMs = dueDate.getTime() - now.getTime()
  if (remainingMs < 0) {
    result.status = "overdue"
    result.daysOverdue = Math.ceil(-remainingMs / MS_PER_DAY)
  } else {
    const daysUntil = Math.ceil(remainingMs / MS_PER_DAY)
    result.daysUntilDue = daysUntil
    result.status = daysUntil <= settings.warnDays ? "dueSoon" : "ok"
  }
  return result
}

/** Map a rotation result to the unified-alert urgency scale. */
export function rotationUrgency(r: RotationResult): RotationUrgency {
  if (r.status === "overdue") return r.daysOverdue > 30 ? "critical" : "warning"
  if (r.status === "dueSoon") return "upcoming"
  return "info"
}
