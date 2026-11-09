import "server-only"
import { prisma } from "@/lib/prisma"
import { verifyPortalHmac, type VerifyResult } from "@/lib/bff-hmac"

export { keywords, score, redactSecrets, nextReviewDue, parseInterval, isoWeekKey } from "@/lib/ticketlink-text"

/**
 * TicketHub ↔ DocHub "ticket link" glue (2026-11-09, feat/ticketlink).
 *
 * Inbound (TicketHub → DocHub): /api/bff/tickethub/* routes. Signed with
 * TH_DOCHUB_BFF_SECRET — its own key, not PORTAL_BFF_SECRET (a portal leak must
 * not let anyone read the whole credential index) and not DH_BFF_SECRET (that
 * one signs the opposite direction, DocHub → TicketHub). Same canonical scheme
 * as every other BFF (`${tsMs}.${rawBody}`, HMAC-SHA256 hex, ±5 min); headers
 * X-Th-Timestamp / X-Th-Signature. See pattern_portal_bff.md.
 */

export function verifyTicketHub(req: Request, rawBody: string): VerifyResult {
  return verifyPortalHmac(
    rawBody,
    req.headers.get("x-th-signature"),
    req.headers.get("x-th-timestamp"),
    process.env.TH_DOCHUB_BFF_SECRET ?? "",
  )
}

export const DOCHUB_PUBLIC_URL = (process.env.DOCHUB_PUBLIC_URL ?? "https://dochub.pcc2k.com").replace(/\/+$/, "")

export const dhUrls = {
  client: (clientId: string) => `${DOCHUB_PUBLIC_URL}/clients/${clientId}`,
  tab: (clientId: string, tab: string) => `${DOCHUB_PUBLIC_URL}/clients/${clientId}?tab=${encodeURIComponent(tab)}`,
  credential: (clientId: string, credId: string) =>
    `${DOCHUB_PUBLIC_URL}/clients/${clientId}?tab=Credentials&cred=${encodeURIComponent(credId)}`,
  document: (clientId: string, docId: string) =>
    `${DOCHUB_PUBLIC_URL}/clients/${clientId}?tab=Documents&doc=${encodeURIComponent(docId)}`,
  asset: (assetId: string) => `${DOCHUB_PUBLIC_URL}/assets/${assetId}`,
  runbook: (runbookId: string) => `${DOCHUB_PUBLIC_URL}/runbooks/${runbookId}`,
  review: () => `${DOCHUB_PUBLIC_URL}/docs/review`,
}

// ---------------------------------------------------------------------------
// Client resolution. TicketHub's TH_Client has no FK to DocHub's Client; the
// two rosters share Syncro ids (121/138 active TH clients carry one, all of
// which match a DocHub client) and mostly share names. Order:
//   1. explicit dochubClientId (must exist)
//   2. Syncro id
//   3. exact name (case/whitespace-insensitive), active first
//   4. normalized name (drops Inc/LLC/The/&…) — only when it is unique
//   5. ClientAlias exact alias — only when it points at one client
// Never guesses between candidates.
// ---------------------------------------------------------------------------

export interface ClientRef {
  dochubClientId?: unknown
  syncroId?: unknown
  clientName?: unknown
}

export type MatchedBy = "id" | "syncro" | "name" | "normalized-name" | "alias"

const SUFFIX = /\b(the|inc|incorporated|llc|l\.l\.c|ltd|limited|corp|corporation|co|company|pllc|pc|pa|llp)\b/g
export const normName = (s: string) =>
  s.toLowerCase().replace(/&/g, " and ").replace(/[.,']/g, "").replace(SUFFIX, " ").replace(/[^a-z0-9]+/g, " ").trim()

export async function resolveDochubClient(
  ref: ClientRef,
): Promise<{ client: { id: string; name: string }; matchedBy: MatchedBy } | null> {
  const id = typeof ref.dochubClientId === "string" ? ref.dochubClientId.trim() : ""
  const syncro =
    typeof ref.syncroId === "number" ? String(ref.syncroId) : typeof ref.syncroId === "string" ? ref.syncroId.trim() : ""
  const name = typeof ref.clientName === "string" ? ref.clientName.trim() : ""
  const sel = { id: true, name: true } as const

  if (id) {
    const c = await prisma.client.findUnique({ where: { id }, select: sel })
    if (c) return { client: c, matchedBy: "id" }
  }
  if (syncro) {
    const c = await prisma.client.findUnique({ where: { syncroId: syncro }, select: sel })
    if (c) return { client: c, matchedBy: "syncro" }
  }
  if (!name) return null

  const exact = await prisma.client.findMany({
    where: { name: { equals: name, mode: "insensitive" } },
    orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
    select: { ...sel, isActive: true },
  })
  const activeExact = exact.filter((c) => c.isActive)
  if (activeExact.length === 1 || (activeExact.length === 0 && exact.length === 1)) {
    const c = activeExact[0] ?? exact[0]
    return { client: { id: c.id, name: c.name }, matchedBy: "name" }
  }

  const target = normName(name)
  if (target) {
    const all = await prisma.client.findMany({ where: { isActive: true }, select: sel })
    const hits = all.filter((c) => normName(c.name) === target)
    if (hits.length === 1) return { client: hits[0], matchedBy: "normalized-name" }
  }

  const aliases = await prisma.clientAlias.findMany({
    where: { alias: name.toLowerCase() },
    select: { clientId: true },
  })
  const ids = [...new Set(aliases.map((a) => a.clientId))]
  if (ids.length === 1) {
    const c = await prisma.client.findUnique({ where: { id: ids[0] }, select: sel })
    if (c) return { client: c, matchedBy: "alias" }
  }
  return null
}

// ---------------------------------------------------------------------------
// AppSetting flags
// ---------------------------------------------------------------------------

export async function getFlag(key: string): Promise<boolean> {
  const row = await prisma.appSetting.findUnique({ where: { key } }).catch(() => null)
  return row?.value === "true"
}

export const DOC_REVIEW_TICKETS_ENABLED = "docReview:tickets:enabled"
export const DOC_REVIEW_TICKETS_DRYRUN = "docReview:tickets:dryRun"

