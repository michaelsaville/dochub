import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  const { error: authError } = await requireAuth()
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const clientId = searchParams.get("clientId") || undefined
  const days = parseInt(searchParams.get("days") || "90", 10)

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() + days)

  const assets = await prisma.asset.findMany({
    where: {
      status: { not: "RETIRED" },
      warrantyExpiry: { not: null },
      location: clientId ? { clientId } : undefined,
    },
    select: {
      id: true, name: true, friendlyName: true, category: true, make: true, model: true,
      serial: true, warrantyExpiry: true, purchaseDate: true,
      location: { select: { name: true, client: { select: { name: true } } } },
      assetType: { select: { name: true } },
    },
    orderBy: { warrantyExpiry: "asc" },
  })

  return NextResponse.json({ assets, cutoff: cutoff.toISOString(), days })
}
