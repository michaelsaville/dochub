// ─── Password rotation policy — PURE, client-safe (no Prisma) ───────────────
// Shared by the unified alerts feed, the nightly digest and the client page's
// per-credential badge. lib/rotation.ts re-exports everything here and adds the
// Prisma-backed getRotationSettings().
//
// THE RULE
//   baseline = lastRotated. If a credential has NEVER been rotated (no
//   lastRotated) we do not know how old the password is — createdAt is just
//   the date it was typed/imported into DocHub. So:
//     * lastRotated set                → due = lastRotated + interval
//     * no lastRotated, but an explicit per-credential rotationIntervalDays
//       (someone opted this cred into a policy) → due = createdAt + interval
//     * no lastRotated, no explicit interval → status "unknown": NOT overdue.
//       The alerts feed rolls these up into ONE info item per client
//       ("N credentials have no rotation date") instead of N critical alerts.
//   interval = rotationIntervalDays ?? policy default (90d); dueSoon window =
//   policy warnDays (14d). Exempt / snoozed short-circuit as before.

export type RotationStatus = "exempt" | "snoozed" | "unknown" | "ok" | "dueSoon" | "overdue"

export type RotationUrgency = "expired" | "critical" | "warning" | "upcoming" | "info"

export interface RotationSettings {
  enabled: boolean
  defaultDays: number
  warnDays: number
}

/** Same values the AppSetting fallbacks use — for client-side callers. */
export const DEFAULT_ROTATION_SETTINGS: RotationSettings = { enabled: true, defaultDays: 90, warnDays: 14 }

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

function toDate(v?: Date | string | null): Date | null {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Pure. See THE RULE above. */
export function computeRotation(
  cred: RotationInput,
  settings: RotationSettings = DEFAULT_ROTATION_SETTINGS,
  now: Date = new Date(),
): RotationResult {
  const explicitInterval = !!(cred.rotationIntervalDays && cred.rotationIntervalDays > 0)
  const intervalDays = explicitInterval ? cred.rotationIntervalDays! : settings.defaultDays

  const lastRotated = toDate(cred.lastRotated)
  const baseline = lastRotated ?? (explicitInterval ? toDate(cred.createdAt) : null)
  const dueDate = baseline ? new Date(baseline.getTime() + intervalDays * MS_PER_DAY) : null

  const result: RotationResult = { status: "ok", dueDate, daysOverdue: 0, daysUntilDue: 0, intervalDays }

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
    result.status = "unknown"
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

/** Actionable rotation states (alert / digest worthy). */
export function isRotationActionable(r: RotationResult): boolean {
  return r.status === "overdue" || r.status === "dueSoon"
}

/** Map a rotation result to the unified-alert urgency scale. */
export function rotationUrgency(r: RotationResult): RotationUrgency {
  if (r.status === "overdue") return r.daysOverdue > 30 ? "critical" : "warning"
  if (r.status === "dueSoon") return "upcoming"
  return "info"
}

export type RotationBadge = {
  status: RotationStatus
  text: string
  tone: "danger" | "warn" | "muted"
  title: string
}

/**
 * Per-credential badge for the client page (drop-in for the in-file
 * computeCredRotation mirror). Never-rotated creds read "No rotation date"
 * (muted) instead of "Rotate · 125d overdue".
 */
export function rotationBadge(
  cred: RotationInput,
  settings: RotationSettings = DEFAULT_ROTATION_SETTINGS,
  now: Date = new Date(),
): RotationBadge {
  const r = computeRotation(cred, settings, now)
  switch (r.status) {
    case "exempt":
      return { status: r.status, text: "No rotation", tone: "muted", title: "Excluded from rotation reminders" }
    case "snoozed":
      return { status: r.status, text: `Snoozed ${r.daysUntilDue}d`, tone: "muted", title: "Rotation reminder snoozed" }
    case "unknown":
      return { status: r.status, text: "No rotation date", tone: "muted", title: "Never marked rotated — mark rotated to start the rotation clock" }
    case "overdue":
      return { status: r.status, text: `Rotate · ${r.daysOverdue}d overdue`, tone: "danger", title: "Password is past its rotation policy" }
    case "dueSoon":
      return { status: r.status, text: `Rotate in ${r.daysUntilDue}d`, tone: "warn", title: "Password is due for rotation soon" }
    default: {
      const base = toDate(cred.lastRotated) ?? toDate(cred.createdAt)
      const ago = base ? Math.floor((now.getTime() - base.getTime()) / MS_PER_DAY) : 0
      return { status: r.status, text: cred.lastRotated ? `Rotated ${ago}d ago` : `Set ${ago}d ago`, tone: "muted", title: "Rotation up to date" }
    }
  }
}
