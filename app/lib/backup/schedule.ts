// Pure scheduling math for the platform self-backup. Server runs UTC, so all
// times are UTC. Returns the next Date at which a run is due.

export type ScheduleShape = {
  enabled: boolean
  frequency: string // "daily" | "weekly"
  hourUtc: number // 0-23
  weekday: number | null // 0-6 (0=Sunday) for weekly
}

export function computeNextRunAt(sch: ScheduleShape, from: Date = new Date()): Date | null {
  if (!sch.enabled) return null
  const hour = Math.min(23, Math.max(0, sch.hourUtc ?? 3))

  const next = new Date(Date.UTC(
    from.getUTCFullYear(),
    from.getUTCMonth(),
    from.getUTCDate(),
    hour, 0, 0, 0,
  ))

  if (sch.frequency === "weekly") {
    const targetDow = ((sch.weekday ?? 0) % 7 + 7) % 7
    // advance to the target weekday at hour; if that instant is in the past, +7d
    let delta = (targetDow - next.getUTCDay() + 7) % 7
    next.setUTCDate(next.getUTCDate() + delta)
    if (next.getTime() <= from.getTime()) next.setUTCDate(next.getUTCDate() + 7)
    return next
  }

  // daily
  if (next.getTime() <= from.getTime()) next.setUTCDate(next.getUTCDate() + 1)
  return next
}

/** Is a run due right now for this schedule + stored nextRunAt? */
export function isDue(enabled: boolean, nextRunAt: Date | null, now: Date = new Date()): boolean {
  if (!enabled) return false
  return nextRunAt == null || nextRunAt.getTime() <= now.getTime()
}
