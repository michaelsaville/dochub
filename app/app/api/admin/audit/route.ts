import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export const dynamic = "force-dynamic"

const PAGE_SIZE = 50

function parseDate(v: string | null): Date | undefined {
  if (!v) return undefined
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? undefined : d
}

/**
 * Global audit-log feed for admins. Two views over data DocHub already
 * collects:
 *   - "field"    → FieldHistory (every tracked edit + every credential
 *                  reveal, including vendor-portal / share / api-key access).
 *   - "activity" → ActivityEvent (per-client high-level events).
 * Read-only. ADMIN-gated.
 */
export async function GET(req: Request) {
  const { error } = await requireAuth("ADMIN")
  if (error) return error

  const url = new URL(req.url)
  const view = url.searchParams.get("view") === "activity" ? "activity" : "field"
  const q = (url.searchParams.get("q") ?? "").trim()
  const from = parseDate(url.searchParams.get("from"))
  const to = parseDate(url.searchParams.get("to"))
  const page = Math.max(0, parseInt(url.searchParams.get("page") ?? "0", 10) || 0)

  if (view === "activity") {
    const eventType = (url.searchParams.get("eventType") ?? "").trim()

    const where: Record<string, unknown> = {}
    if (eventType) where.eventType = eventType
    if (from || to) where.createdAt = { ...(from && { gte: from }), ...(to && { lte: to }) }
    if (q) {
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { body: { contains: q, mode: "insensitive" } },
        { client: { is: { name: { contains: q, mode: "insensitive" } } } },
      ]
    }

    const [rows, total, eventTypeGroups] = await Promise.all([
      prisma.activityEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: page * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          client: { select: { id: true, name: true } },
          staffUser: { select: { name: true, email: true } },
        },
      }),
      prisma.activityEvent.count({ where }),
      prisma.activityEvent.groupBy({ by: ["eventType"], _count: true }),
    ])

    return NextResponse.json({
      view,
      rows: rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        eventType: r.eventType,
        title: r.title,
        body: r.body,
        clientId: r.clientId,
        clientName: r.client?.name ?? null,
        staff: r.staffUser?.name ?? r.staffUser?.email ?? null,
        visibleToClient: r.visibleToClient,
      })),
      total,
      page,
      pageSize: PAGE_SIZE,
      hasMore: (page + 1) * PAGE_SIZE < total,
      facets: {
        eventTypes: eventTypeGroups
          .map((g) => ({ value: g.eventType, count: g._count }))
          .sort((a, b) => a.value.localeCompare(b.value)),
      },
    })
  }

  // ── field-history view ──────────────────────────────────────────────
  const entityType = (url.searchParams.get("entityType") ?? "").trim()
  const field = (url.searchParams.get("field") ?? "").trim()
  const source = (url.searchParams.get("source") ?? "").trim()
  const actor = (url.searchParams.get("actor") ?? "").trim()
  const revealsOnly = url.searchParams.get("revealsOnly") === "1"

  const where: Record<string, unknown> = {}
  if (entityType) where.entityType = entityType
  if (revealsOnly || source) where.field = "reveal"
  else if (field) where.field = field
  if (source) where.newValue = source
  if (actor) where.changedBy = { contains: actor, mode: "insensitive" }
  if (from || to) where.changedAt = { ...(from && { gte: from }), ...(to && { lte: to }) }
  if (q) {
    where.OR = [
      { entityId: { contains: q, mode: "insensitive" } },
      { changedBy: { contains: q, mode: "insensitive" } },
      { field: { contains: q, mode: "insensitive" } },
      { oldValue: { contains: q, mode: "insensitive" } },
      { newValue: { contains: q, mode: "insensitive" } },
    ]
  }

  const [rows, total, entityTypeGroups, fieldGroups, sourceGroups] = await Promise.all([
    prisma.fieldHistory.findMany({
      where,
      orderBy: { changedAt: "desc" },
      skip: page * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.fieldHistory.count({ where }),
    prisma.fieldHistory.groupBy({ by: ["entityType"], _count: true }),
    prisma.fieldHistory.groupBy({ by: ["field"], _count: true }),
    prisma.fieldHistory.groupBy({
      by: ["newValue"],
      where: { field: "reveal" },
      _count: true,
    }),
  ])

  return NextResponse.json({
    view,
    rows: rows.map((r) => ({
      id: r.id,
      changedAt: r.changedAt,
      entityType: r.entityType,
      entityId: r.entityId,
      field: r.field,
      oldValue: r.oldValue,
      newValue: r.newValue,
      changedBy: r.changedBy,
      isReveal: r.field === "reveal",
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
    hasMore: (page + 1) * PAGE_SIZE < total,
    facets: {
      entityTypes: entityTypeGroups
        .map((g) => ({ value: g.entityType, count: g._count }))
        .sort((a, b) => b.count - a.count),
      fields: fieldGroups
        .map((g) => ({ value: g.field, count: g._count }))
        .sort((a, b) => b.count - a.count),
      sources: sourceGroups
        .filter((g) => g.newValue)
        .map((g) => ({ value: g.newValue as string, count: g._count }))
        .sort((a, b) => b.count - a.count),
    },
  })
}
