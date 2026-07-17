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

// Paginated read of the tamper-evident AuditLog (Secure Log). ADMIN-only,
// read-only — there is intentionally no POST/PUT/DELETE on this table anywhere.
// BigInt `seq` is serialized to string.
export async function GET(req: Request) {
  const { error } = await requireAuth("ADMIN")
  if (error) return error

  const url = new URL(req.url)
  const q = (url.searchParams.get("q") ?? "").trim()
  const action = (url.searchParams.get("action") ?? "").trim()
  const actorType = (url.searchParams.get("actorType") ?? "").trim()
  const from = parseDate(url.searchParams.get("from"))
  const to = parseDate(url.searchParams.get("to"))
  const page = Math.max(0, parseInt(url.searchParams.get("page") ?? "0", 10) || 0)

  const where: Record<string, unknown> = {}
  if (action) where.action = action
  if (actorType) where.actorType = actorType
  if (from || to) where.at = { ...(from && { gte: from }), ...(to && { lte: to }) }
  if (q) {
    where.OR = [
      { actorLabel: { contains: q, mode: "insensitive" } },
      { action: { contains: q, mode: "insensitive" } },
      { summary: { contains: q, mode: "insensitive" } },
      { entityId: { contains: q, mode: "insensitive" } },
      { actorId: { contains: q, mode: "insensitive" } },
    ]
  }

  const [rows, total, actionGroups, actorTypeGroups] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { seq: "desc" },
      skip: page * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.groupBy({ by: ["action"], _count: true }),
    prisma.auditLog.groupBy({ by: ["actorType"], _count: true }),
  ])

  return NextResponse.json({
    rows: rows.map((r) => ({
      seq: r.seq.toString(),
      id: r.id,
      at: r.at,
      actorType: r.actorType,
      actorId: r.actorId,
      actorLabel: r.actorLabel,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      clientId: r.clientId,
      summary: r.summary,
      metadata: r.metadata,
      ip: r.ip,
      userAgent: r.userAgent,
      prevHash: r.prevHash,
      hash: r.hash,
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
    hasMore: (page + 1) * PAGE_SIZE < total,
    facets: {
      actions: actionGroups
        .map((g) => ({ value: g.action, count: g._count }))
        .sort((a, b) => b.count - a.count),
      actorTypes: actorTypeGroups
        .map((g) => ({ value: g.actorType, count: g._count }))
        .sort((a, b) => b.count - a.count),
    },
  })
}
