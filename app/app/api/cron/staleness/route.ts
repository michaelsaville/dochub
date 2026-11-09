import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireCronSecret } from "@/lib/cron-auth"
import { callTickethubBff, BffCallError } from "@/lib/bff-th-client"
import {
  getFlag,
  isoWeekKey,
  dhUrls,
  DOC_REVIEW_TICKETS_ENABLED,
  DOC_REVIEW_TICKETS_DRYRUN,
} from "@/lib/ticketlink"

// GET /api/cron/staleness  (Bearer CRON_SECRET) — nightly, 03:00 host cron.
//
// 1. Auto-flags client documents that have gone stale — neither reviewed nor
//    edited in STALE_DAYS days — into the review queue (/docs/review), so
//    freshness stops depending on someone remembering to flag them by hand.
//
// 2. Doc review cycles (2026-11-09): docs/SOPs whose reviewDueAt has passed
//    roll up into ONE internal TicketHub ticket per client per ISO week
//    ("Documentation review due: N docs"), via TicketHub's signed
//    /api/bff/dh/doc-review-ticket (createTicketCore, type INTERNAL, no client
//    email). TicketHub de-dups on a fingerprint, so re-runs in the same week —
//    or while last week's ticket is still open — never pile up tickets.
//    Gated:
//      AppSetting docReview:tickets:enabled = "true"   → actually create tickets (default OFF)
//      AppSetting docReview:tickets:dryRun  = "true"   → log what would be sent, send nothing
//      ?dryRun=1                                        → same, for one run (works even when disabled)
const STALE_DAYS = 180

export async function GET(req: Request) {
  const denied = requireCronSecret(req)
  if (denied) return denied

  const url = new URL(req.url)
  const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000)

  const stale = await prisma.clientDocument.findMany({
    where: {
      needsReview: false,
      updatedAt: { lt: cutoff },
      OR: [{ reviewedAt: null }, { reviewedAt: { lt: cutoff } }],
    },
    select: { id: true },
  })

  if (stale.length) {
    await prisma.clientDocument.updateMany({
      where: { id: { in: stale.map((d) => d.id) } },
      data: {
        needsReview: true,
        flaggedAt: new Date(),
        flaggedBy: "system",
        reviewNote: `Auto-flagged: not reviewed or edited in ${STALE_DAYS} days`,
      },
    })
  }

  let reviewTickets: unknown
  try {
    reviewTickets = await docReviewTickets(url.searchParams.get("dryRun") === "1")
  } catch (e) {
    // Never let the TicketHub leg break the flagging leg.
    console.error("[cron/staleness] doc review tickets failed", e)
    reviewTickets = { error: e instanceof Error ? e.message : String(e) }
  }

  return NextResponse.json({ flagged: stale.length, reviewTickets })
}

type OverdueItem = { kind: "doc" | "sop"; title: string; dueAt: string; url: string; owner: string | null; ownerEmail: string | null }

async function docReviewTickets(forceDryRun: boolean) {
  const enabled = await getFlag(DOC_REVIEW_TICKETS_ENABLED)
  const dryRun = forceDryRun || (await getFlag(DOC_REVIEW_TICKETS_DRYRUN))
  if (!enabled && !dryRun) return { enabled: false, skipped: "flag off" }

  const now = new Date()
  const [docs, sops] = await Promise.all([
    prisma.clientDocument.findMany({
      where: { reviewDueAt: { lt: now }, client: { isActive: true } },
      orderBy: { reviewDueAt: "asc" },
      select: {
        id: true,
        title: true,
        reviewDueAt: true,
        owner: { select: { name: true, email: true } },
        client: { select: { id: true, name: true, syncroId: true } },
      },
    }),
    prisma.runbook.findMany({
      where: { reviewDueAt: { lt: now }, clientId: { not: null }, client: { isActive: true } },
      orderBy: { reviewDueAt: "asc" },
      select: {
        id: true,
        title: true,
        reviewDueAt: true,
        owner: { select: { name: true, email: true } },
        client: { select: { id: true, name: true, syncroId: true } },
      },
    }),
  ])

  const byClient = new Map<string, { client: { id: string; name: string; syncroId: string | null }; items: OverdueItem[] }>()
  const push = (c: { id: string; name: string; syncroId: string | null }, item: OverdueItem) => {
    const g = byClient.get(c.id) ?? { client: c, items: [] }
    g.items.push(item)
    byClient.set(c.id, g)
  }
  for (const d of docs) {
    push(d.client, {
      kind: "doc",
      title: d.title,
      dueAt: d.reviewDueAt!.toISOString(),
      url: dhUrls.document(d.client.id, d.id),
      owner: d.owner?.name ?? d.owner?.email ?? null,
      ownerEmail: d.owner?.email ?? null,
    })
  }
  for (const r of sops) {
    if (!r.client) continue
    push(r.client, {
      kind: "sop",
      title: r.title,
      dueAt: r.reviewDueAt!.toISOString(),
      url: dhUrls.runbook(r.id),
      owner: r.owner?.name ?? r.owner?.email ?? null,
      ownerEmail: r.owner?.email ?? null,
    })
  }

  const weekKey = isoWeekKey(now)
  const results: unknown[] = []
  for (const { client, items } of byClient.values()) {
    // Most common owner gets the ticket (TicketHub maps by email; none → unassigned).
    const tally = new Map<string, number>()
    for (const i of items) if (i.ownerEmail) tally.set(i.ownerEmail, (tally.get(i.ownerEmail) ?? 0) + 1)
    const assigneeEmail = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

    const payload = {
      dochubClientId: client.id,
      clientName: client.name,
      syncroId: client.syncroId,
      weekKey,
      count: items.length,
      assigneeEmail,
      reviewUrl: dhUrls.review(),
      clientUrl: dhUrls.client(client.id),
      items: items.slice(0, 40).map(({ ownerEmail: _e, ...rest }) => rest),
    }
    if (dryRun) {
      results.push({ client: client.name, count: items.length, wouldSend: true })
      continue
    }
    try {
      const res = await callTickethubBff<{ ok: boolean; created?: boolean; ticketNumber?: number; url?: string; error?: string }>({
        path: "/api/bff/dh/doc-review-ticket",
        body: payload,
      })
      results.push({ client: client.name, count: items.length, created: res.created ?? false, ticketNumber: res.ticketNumber, url: res.url })
    } catch (e) {
      const detail = e instanceof BffCallError ? e.payload : e instanceof Error ? e.message : String(e)
      results.push({ client: client.name, count: items.length, error: detail })
    }
  }

  return { enabled, dryRun, weekKey, clients: byClient.size, results }
}
