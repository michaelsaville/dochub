import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function GET() {
  const { error } = await requireAuth()
  if (error) return error

  const clients = await prisma.client.findMany({
    where: { isActive: true },
    select: {
      id: true,
      networkDiagram: { select: { id: true } },
      _count: {
        select: {
          people: true,
          credentials: true,
          locations: true,
          documents: true,
          // `assets` is not a Client relation (assets hang off Location), so the
          // network-gear count is built from the same groupBy the asset check uses.
          cableRuns: true,
          websites: true,
          runbooks: true,
          vlans: true,
        },
      },
    },
  })

  // Count assets per client (through locations)
  const assetCounts = await prisma.asset.groupBy({
    by: ["locationId"],
    _count: true,
  })
  const locationClientMap = await prisma.location.findMany({
    select: { id: true, clientId: true },
  })
  const clientAssetCount: Record<string, number> = {}
  for (const lc of locationClientMap) {
    const ac = assetCounts.find(a => a.locationId === lc.id)
    clientAssetCount[lc.clientId] = (clientAssetCount[lc.clientId] || 0) + (ac?._count || 0)
  }

  // "Has network devices documented" used to count the legacy NetworkDevice table,
  // which has had 0 rows since the asset migration — so the check was permanently
  // unmet and capped EVERY client's score. Count real network-gear assets instead,
  // matching api/clients/[id]/completeness.
  const netCounts = await prisma.asset.groupBy({
    by: ["locationId"],
    where: { category: { in: ["NETWORK_GEAR", "WIRELESS"] } },
    _count: true,
  })
  const clientNetCount: Record<string, number> = {}
  for (const lc of locationClientMap) {
    const nc = netCounts.find(a => a.locationId === lc.id)
    clientNetCount[lc.clientId] = (clientNetCount[lc.clientId] || 0) + (nc?._count || 0)
  }

  const scores: Record<string, number> = {}
  for (const c of clients) {
    const checks = [
      c._count.locations > 0,
      c._count.people > 0,
      (clientAssetCount[c.id] || 0) > 0,
      c._count.credentials > 0,
      c._count.documents > 0,
      c._count.websites > 0,
      !!c.networkDiagram,
      c._count.runbooks > 0,
      c._count.vlans > 0,
      (clientNetCount[c.id] || 0) > 0,
      c._count.cableRuns > 0,
    ]
    // 11 checks now (cabling added) — the weights array must stay the same length
    // or the tail silently scores 0 and every client is capped again.
    const weights = [10, 15, 15, 10, 10, 5, 10, 5, 5, 5, 5]
    const total = weights.reduce((s, w) => s + w, 0)
    const earned = checks.reduce((s, met, i) => s + (met ? weights[i] : 0), 0)
    scores[c.id] = Math.round((earned / total) * 100)
  }

  return NextResponse.json(scores)
}
