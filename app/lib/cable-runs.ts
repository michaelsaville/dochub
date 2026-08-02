import type { Prisma } from "@prisma/client"

/**
 * Shared shape + helpers for cable runs.
 *
 * The select lives here rather than being repeated per route so the DocHub API,
 * the global search group, and the TicketHub offline bundle cannot drift into
 * returning different fields for the same row.
 */
export const CABLE_RUN_SELECT = {
  id: true,
  clientId: true,
  locationId: true,
  jackLabel: true,
  room: true,
  panelAssetId: true,
  panelLabel: true,
  panelPort: true,
  switchAssetId: true,
  switchPortNumber: true,
  switchPortId: true,
  cableType: true,
  photoStorageName: true,
  notes: true,
  lastVerifiedAt: true,
  verifiedBy: true,
  createdAt: true,
  updatedAt: true,
  location: { select: { id: true, name: true } },
  panelAsset: { select: { id: true, name: true, friendlyName: true } },
  switchAsset: { select: { id: true, name: true, friendlyName: true } },
} satisfies Prisma.CableRunSelect

export type CableRunRow = Prisma.CableRunGetPayload<{ select: typeof CABLE_RUN_SELECT }>

/**
 * Jack labels are read off a faceplate and typed on a phone. Collapse whitespace
 * and uppercase so "b-114", "B‑114 " and "B 114" don't become three rows that the
 * @@unique([locationId, jackLabel]) constraint happily accepts.
 */
export function normalizeJackLabel(raw: unknown): string {
  if (typeof raw !== "string") return ""
  return raw.trim().replace(/\s+/g, " ").toUpperCase()
}

/** Human-readable device label, matching how the rest of the app names assets. */
function deviceName(a: { name: string; friendlyName: string | null } | null | undefined): string | null {
  if (!a) return null
  return a.friendlyName || a.name
}

/**
 * The end-to-end chain as one line: `B-114 → PP-A/12 → sw-mdf:14`.
 *
 * ASCII arrows on purpose — this string is reused in printed/PDF output, and
 * @react-pdf's Helvetica build silently corrupts non-ASCII glyphs.
 */
export function cableRunChain(run: {
  jackLabel: string
  panelLabel?: string | null
  panelPort?: number | null
  panelAsset?: { name: string; friendlyName: string | null } | null
  switchPortNumber?: number | null
  switchAsset?: { name: string; friendlyName: string | null } | null
}): string {
  const parts: string[] = [run.jackLabel]

  const panel = deviceName(run.panelAsset) || run.panelLabel
  if (panel) parts.push(run.panelPort != null ? `${panel}/${run.panelPort}` : panel)

  const sw = deviceName(run.switchAsset)
  if (sw) parts.push(run.switchPortNumber != null ? `${sw}:${run.switchPortNumber}` : sw)
  else if (run.switchPortNumber != null) parts.push(`port ${run.switchPortNumber}`)

  return parts.join(" -> ")
}

/** Chain plus room, for audit summaries and search sublabels. */
export function cableRunSummary(run: Parameters<typeof cableRunChain>[0] & { room?: string | null }): string {
  const chain = cableRunChain(run)
  return run.room ? `${chain} (${run.room})` : chain
}

/**
 * Documentation staleness. A run nobody has re-checked in a year is a claim, not
 * a fact — the whole failure mode of physical-layer docs is silent drift.
 */
export const STALE_AFTER_DAYS = 365

export function isStale(lastVerifiedAt: Date | string | null | undefined): boolean {
  if (!lastVerifiedAt) return true
  const at = typeof lastVerifiedAt === "string" ? new Date(lastVerifiedAt) : lastVerifiedAt
  return Date.now() - at.getTime() > STALE_AFTER_DAYS * 24 * 60 * 60 * 1000
}
