import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type AssetRow = {
  id: string
  name: string
  friendlyName: string | null
  clientName: string | null
  locationName: string | null
  typeName: string | null
  category: string | null
  make: string | null
  model: string | null
  serial: string | null
  status: string
  purchaseDate: string | null
  warrantyExpiry: string | null
  endOfLife: string | null
  endOfSupport: string | null
  leaseEnd: string | null
  cost: number | null // cents
  refreshDate: string | null
  refreshBasis: string | null
  ageYears: number | null
}

type Bucket = {
  key: string
  label: string
  sortKey: number
  rangeStart: string | null
  rangeEnd: string | null
  count: number
  totalCostCents: number
  assets: AssetRow[]
}

// Calendar year in which the fiscal year containing `d` begins.
function fyStartYear(d: Date, startMonth: number): number {
  const m = d.getMonth() + 1
  return m >= startMonth ? d.getFullYear() : d.getFullYear() - 1
}

function fyLabel(startYear: number, startMonth: number): string {
  if (startMonth === 1) return `FY${startYear}`
  const endYY = String((startYear + 1) % 100).padStart(2, "0")
  return `FY${startYear}-${endYY}`
}

export async function GET(req: NextRequest) {
  const { error: authError } = await requireAuth()
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const clientId = searchParams.get("clientId") || undefined
  let startMonth = parseInt(searchParams.get("fiscalStartMonth") || "1", 10)
  if (!Number.isFinite(startMonth) || startMonth < 1 || startMonth > 12) startMonth = 1

  const raw = await prisma.asset.findMany({
    where: {
      status: { not: "RETIRED" },
      location: clientId ? { clientId } : undefined,
    },
    select: {
      id: true, name: true, friendlyName: true, category: true, status: true,
      make: true, model: true, serial: true,
      purchaseDate: true, warrantyExpiry: true,
      endOfLife: true, endOfSupport: true, leaseEnd: true, cost: true,
      location: { select: { name: true, client: { select: { name: true } } } },
      assetType: { select: { name: true } },
    },
  })

  const now = new Date()
  const MS_YEAR = 365.25 * 24 * 3600 * 1000

  // Refresh driver: first available of EoS -> EoL -> lease end -> warranty.
  function pickRefresh(a: (typeof raw)[number]): { date: Date | null; basis: string | null } {
    if (a.endOfSupport) return { date: a.endOfSupport, basis: "End of Support" }
    if (a.endOfLife) return { date: a.endOfLife, basis: "End of Life" }
    if (a.leaseEnd) return { date: a.leaseEnd, basis: "Lease End" }
    if (a.warrantyExpiry) return { date: a.warrantyExpiry, basis: "Warranty" }
    return { date: null, basis: null }
  }

  const byFy = new Map<string, Bucket>()
  const overdue: Bucket = { key: "OVERDUE", label: "Overdue (refresh past due)", sortKey: -1, rangeStart: null, rangeEnd: null, count: 0, totalCostCents: 0, assets: [] }
  const unscheduled: Bucket = { key: "UNSCHEDULED", label: "Unscheduled (no lifecycle date)", sortKey: Number.POSITIVE_INFINITY, rangeStart: null, rangeEnd: null, count: 0, totalCostCents: 0, assets: [] }

  for (const a of raw) {
    const { date: refresh, basis } = pickRefresh(a)
    const row: AssetRow = {
      id: a.id,
      name: a.name,
      friendlyName: a.friendlyName,
      clientName: a.location?.client?.name ?? null,
      locationName: a.location?.name ?? null,
      typeName: a.assetType?.name ?? null,
      category: a.category ?? null,
      make: a.make,
      model: a.model,
      serial: a.serial,
      status: a.status,
      purchaseDate: a.purchaseDate?.toISOString() ?? null,
      warrantyExpiry: a.warrantyExpiry?.toISOString() ?? null,
      endOfLife: a.endOfLife?.toISOString() ?? null,
      endOfSupport: a.endOfSupport?.toISOString() ?? null,
      leaseEnd: a.leaseEnd?.toISOString() ?? null,
      cost: a.cost ?? null,
      refreshDate: refresh?.toISOString() ?? null,
      refreshBasis: basis,
      ageYears: a.purchaseDate ? Math.round(((now.getTime() - a.purchaseDate.getTime()) / MS_YEAR) * 10) / 10 : null,
    }

    let target: Bucket
    if (!refresh) {
      target = unscheduled
    } else if (refresh < now) {
      target = overdue
    } else {
      const sy = fyStartYear(refresh, startMonth)
      const key = `FY:${sy}`
      let b = byFy.get(key)
      if (!b) {
        const start = new Date(sy, startMonth - 1, 1)
        const end = new Date(sy + 1, startMonth - 1, 1)
        b = { key, label: fyLabel(sy, startMonth), sortKey: sy, rangeStart: start.toISOString(), rangeEnd: end.toISOString(), count: 0, totalCostCents: 0, assets: [] }
        byFy.set(key, b)
      }
      target = b
    }

    target.assets.push(row)
    target.count++
    target.totalCostCents += a.cost ?? 0
  }

  const ordered: Bucket[] = [
    ...(overdue.count ? [overdue] : []),
    ...[...byFy.values()].sort((x, y) => x.sortKey - y.sortKey),
    ...(unscheduled.count ? [unscheduled] : []),
  ]

  // Within a bucket: soonest refresh first, then most expensive first.
  for (const b of ordered) {
    b.assets.sort((x, y) => {
      const dx = x.refreshDate ? Date.parse(x.refreshDate) : Number.POSITIVE_INFINITY
      const dy = y.refreshDate ? Date.parse(y.refreshDate) : Number.POSITIVE_INFINITY
      if (dx !== dy) return dx - dy
      return (y.cost ?? 0) - (x.cost ?? 0)
    })
  }

  const totalCostCents = raw.reduce((s, a) => s + (a.cost ?? 0), 0)
  const scheduledCostCents = ordered
    .filter(b => b.key !== "UNSCHEDULED")
    .reduce((s, b) => s + b.totalCostCents, 0)

  return NextResponse.json({
    fiscalStartMonth: startMonth,
    generatedAt: now.toISOString(),
    buckets: ordered,
    totals: {
      count: raw.length,
      totalCostCents,
      scheduledCostCents,
      overdueCostCents: overdue.totalCostCents,
      unscheduledCount: unscheduled.count,
      costedCount: raw.filter(a => a.cost != null).length,
    },
  })
}
