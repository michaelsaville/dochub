import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyTicketHub, resolveDochubClient, keywords, score, dhUrls } from "@/lib/ticketlink"

/**
 * POST /api/bff/tickethub/client-summary  (HMAC-signed, TH_DOCHUB_BFF_SECRET, X-Th-* headers)
 *
 * Read-only. Feeds the "DocHub" panel on TicketHub's ticket page: everything a
 * tech wants to see about the client without leaving the ticket.
 *
 * Body: { syncroId?, clientName?, dochubClientId?, subject?, assetName?, dochubAssetId? }
 *   subject/assetName only rank results (simple keyword match); they never
 *   filter anything out.
 *
 * NEVER returns secrets: credentials are selected field-by-field (label,
 * username, url) — encryptedPassword / encryptedTotp / encryptedNotes are not
 * even read. Every item carries a DocHub deep link; revealing a password
 * happens in DocHub under DocHub's own RBAC + audit.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Infra first: the boxes a tech logs into when something is wrong.
const CATEGORY_RANK: Record<string, number> = {
  NETWORK_GEAR: 0,
  SERVER: 1,
  NAS: 2,
  WIRELESS: 3,
  VPN: 4,
  PHONE_SYSTEM: 5,
}
const INFRA_WORDS = /\b(firewall|router|fortigate|sonicwall|meraki|unifi|udm|usg|pfsense|opnsense|switch|gateway|server|nas|synology|qnap|hyper-?v|esxi|proxmox|dc\d*|domain controller)\b/i

function assetRank(a: { category: string; name: string; make: string | null; model: string | null }): number {
  const base = CATEGORY_RANK[a.category] ?? 9
  // A "COMPUTER" named FW-01 or a "Sonicwall" filed under OTHER still counts as infra.
  if (base === 9 && INFRA_WORDS.test(`${a.name} ${a.make ?? ""} ${a.model ?? ""}`)) return 1.5
  return base
}

const SEVERITY_RANK: Record<string, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 }

export async function POST(req: Request) {
  const rawBody = await req.text()
  const verify = verifyTicketHub(req, rawBody)
  if (!verify.ok) return NextResponse.json({ ok: false, error: verify.reason }, { status: verify.status })

  let p: {
    syncroId?: unknown
    clientName?: unknown
    dochubClientId?: unknown
    subject?: unknown
    assetName?: unknown
    dochubAssetId?: unknown
  }
  try {
    p = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 })
  }

  const resolved = await resolveDochubClient(p)
  if (!resolved) {
    return NextResponse.json({ ok: true, found: false })
  }
  const { client, matchedBy } = resolved
  const subject = typeof p.subject === "string" ? p.subject.slice(0, 300) : ""
  const assetName = typeof p.assetName === "string" ? p.assetName.slice(0, 200) : ""
  const linkedAssetId = typeof p.dochubAssetId === "string" ? p.dochubAssetId : ""
  const tokens = keywords(subject, assetName)
  const now = new Date()

  const [creds, credCount, assets, assetCount, runbooks, docs, docCount, people, alarms, overdueDocs] = await Promise.all([
    prisma.credential.findMany({
      where: { clientId: client.id, isRetired: false },
      orderBy: [{ isFavorite: "desc" }, { updatedAt: "desc" }],
      take: 300,
      select: {
        id: true,
        label: true,
        username: true,
        url: true,
        notes: false,
        isFavorite: true,
        updatedAt: true,
        asset: { select: { id: true, name: true } },
      },
    }),
    prisma.credential.count({ where: { clientId: client.id, isRetired: false } }),
    prisma.asset.findMany({
      where: { location: { clientId: client.id }, status: "ACTIVE" },
      take: 500,
      select: {
        id: true,
        name: true,
        friendlyName: true,
        category: true,
        make: true,
        model: true,
        ipAddress: true,
        managementUrl: true,
        isFavorite: true,
        location: { select: { name: true } },
      },
    }),
    prisma.asset.count({ where: { location: { clientId: client.id }, status: "ACTIVE" } }),
    prisma.runbook.findMany({
      // This client's SOPs plus published global ones (global ones only surface on a keyword hit).
      where: { OR: [{ clientId: client.id }, { clientId: null, isPublished: true }] },
      orderBy: { updatedAt: "desc" },
      take: 300,
      select: { id: true, title: true, summary: true, clientId: true, updatedAt: true, asset: { select: { name: true } } },
    }),
    prisma.clientDocument.findMany({
      where: { clientId: client.id },
      orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
      take: 300,
      select: {
        id: true,
        title: true,
        category: true,
        isPinned: true,
        needsReview: true,
        reviewDueAt: true,
        updatedAt: true,
        assetId: true,
        // Content is read only to score relevance; it is never returned.
        content: true,
      },
    }),
    prisma.clientDocument.count({ where: { clientId: client.id } }),
    prisma.person.findMany({
      where: { clientId: client.id, isActive: true },
      orderBy: [{ isPrimary: "desc" }, { isEscalation: "desc" }, { isBilling: "desc" }, { name: "asc" }],
      take: 6,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        mobile: true,
        jobTitle: true,
        isPrimary: true,
        isEscalation: true,
        isBilling: true,
      },
    }),
    prisma.alarm.findMany({
      where: { clientId: client.id, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: { id: true, severity: true, type: true, message: true, createdAt: true, asset: { select: { id: true, name: true } } },
    }),
    prisma.clientDocument.count({ where: { clientId: client.id, reviewDueAt: { lt: now } } }),
  ])

  // ---- credentials: favorites always, then keyword hits, then most recent ----
  const credsRanked = creds
    .map((c) => ({ c, s: score(tokens, c.label, c.username, c.url, c.asset?.name) }))
    .sort((a, b) => Number(b.c.isFavorite) - Number(a.c.isFavorite) || b.s - a.s || b.c.updatedAt.getTime() - a.c.updatedAt.getTime())
    .slice(0, 8)
    .map(({ c, s }) => ({
      id: c.id,
      label: c.label,
      username: c.username,
      url: c.url,
      assetName: c.asset?.name ?? null,
      isFavorite: c.isFavorite,
      relevant: s > 0,
      href: dhUrls.credential(client.id, c.id),
    }))

  // ---- assets: linked asset, then infra, then keyword hits ----
  const assetsRanked = assets
    .map((a) => ({
      a,
      s: score(tokens, a.name, a.friendlyName, a.make, a.model, a.ipAddress),
      r: a.id === linkedAssetId ? -1 : assetRank(a),
    }))
    // A keyword hit on a workstation beats generic infra only when there are no infra hits — keep infra first.
    .sort((x, y) => x.r - y.r || y.s - x.s || Number(y.a.isFavorite) - Number(x.a.isFavorite) || x.a.name.localeCompare(y.a.name))
  const assetsOut = [
    // keyword-matched non-infra assets get a slot too (e.g. the user's PC named in the subject)
    ...assetsRanked.filter((x) => x.r <= 5),
    ...assetsRanked.filter((x) => x.r > 5 && x.s > 0),
  ]
    .slice(0, 8)
    .map(({ a, s }) => ({
      id: a.id,
      name: a.friendlyName || a.name,
      category: a.category,
      makeModel: [a.make, a.model].filter(Boolean).join(" ") || null,
      ipAddress: a.ipAddress,
      managementUrl: a.managementUrl,
      location: a.location?.name ?? null,
      linked: a.id === linkedAssetId,
      relevant: s > 0,
      href: dhUrls.asset(a.id),
    }))

  // ---- SOPs: client SOPs (keyword hits first), global SOPs only on a keyword hit ----
  const sops = runbooks
    .map((r) => ({ r, s: score(tokens, r.title, r.summary, r.asset?.name) }))
    .filter((x) => x.r.clientId === client.id || x.s > 0)
    .sort((a, b) => b.s - a.s || Number(!!b.r.clientId) - Number(!!a.r.clientId) || b.r.updatedAt.getTime() - a.r.updatedAt.getTime())
    .slice(0, 5)
    .map(({ r, s }) => ({
      id: r.id,
      title: r.title,
      summary: r.summary,
      global: !r.clientId,
      relevant: s > 0,
      href: dhUrls.runbook(r.id),
    }))

  // ---- documents: keyword hits (title weighs double), pinned, then recent ----
  const docsOut = docs
    .map((d) => ({
      d,
      s: score(tokens, d.title, d.category) * 2 + score(tokens, d.content?.slice(0, 4000)) + (linkedAssetId && d.assetId === linkedAssetId ? 3 : 0),
    }))
    .sort((a, b) => b.s - a.s || Number(b.d.isPinned) - Number(a.d.isPinned) || b.d.updatedAt.getTime() - a.d.updatedAt.getTime())
    .slice(0, 6)
    .map(({ d, s }) => ({
      id: d.id,
      title: d.title,
      category: d.category,
      isPinned: d.isPinned,
      needsReview: d.needsReview,
      reviewOverdue: !!d.reviewDueAt && d.reviewDueAt < now,
      updatedAt: d.updatedAt.toISOString(),
      relevant: s > 0,
      href: dhUrls.document(client.id, d.id),
    }))

  const alarmsOut = alarms
    .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) || b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 5)
    .map((a) => ({
      id: a.id,
      severity: a.severity,
      type: a.type,
      message: a.message,
      createdAt: a.createdAt.toISOString(),
      assetName: a.asset?.name ?? null,
      href: a.asset ? dhUrls.asset(a.asset.id) : dhUrls.client(client.id),
    }))

  return NextResponse.json({
    ok: true,
    found: true,
    matchedBy,
    client: { id: client.id, name: client.name, href: dhUrls.client(client.id) },
    links: {
      credentials: dhUrls.tab(client.id, "Credentials"),
      assets: dhUrls.tab(client.id, "Assets"),
      documents: dhUrls.tab(client.id, "Documents"),
      sops: dhUrls.tab(client.id, "SOPs"),
      people: dhUrls.tab(client.id, "People"),
      review: dhUrls.review(),
    },
    counts: {
      credentials: credCount,
      assets: assetCount,
      documents: docCount,
      alarms: alarms.length,
      docsReviewOverdue: overdueDocs,
    },
    keywords: tokens,
    credentials: credsRanked,
    assets: assetsOut,
    sops,
    documents: docsOut,
    contacts: people.map((x) => ({ ...x })),
    alarms: alarmsOut,
  })
}
