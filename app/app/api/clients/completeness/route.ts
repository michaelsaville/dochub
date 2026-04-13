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
      _count: {
        select: {
          contacts: true,
          credentials: true,
          locations: true,
          documents: true,
          networkDevices: true,
          websites: true,
          networkDiagrams: true,
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

  const scores: Record<string, number> = {}
  for (const c of clients) {
    const checks = [
      c._count.locations > 0,
      c._count.contacts > 0,
      (clientAssetCount[c.id] || 0) > 0,
      c._count.credentials > 0,
      c._count.documents > 0,
      c._count.websites > 0,
      c._count.networkDiagrams > 0,
      c._count.runbooks > 0,
      c._count.vlans > 0,
      c._count.networkDevices > 0,
    ]
    const weights = [10, 15, 15, 10, 10, 5, 10, 5, 5, 5]
    const total = weights.reduce((s, w) => s + w, 0)
    const earned = checks.reduce((s, met, i) => s + (met ? weights[i] : 0), 0)
    scores[c.id] = Math.round((earned / total) * 100)
  }

  return NextResponse.json(scores)
}
