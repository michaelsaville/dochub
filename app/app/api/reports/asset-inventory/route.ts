import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  const { error: authError } = await requireAuth()
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const clientId = searchParams.get("clientId") || undefined

  const assets = await prisma.asset.findMany({
    where: {
      status: { not: "RETIRED" },
      location: clientId ? { clientId } : undefined,
    },
    select: {
      id: true, name: true, friendlyName: true, category: true, status: true,
      make: true, model: true, serial: true, assetTag: true,
      purchaseDate: true, warrantyExpiry: true,
      location: { select: { name: true, city: true, client: { select: { name: true } } } },
      assetType: { select: { name: true } },
    },
    orderBy: [{ location: { client: { name: "asc" } } }, { category: "asc" }, { name: "asc" }],
  })

  const clients = clientId
    ? await prisma.client.findMany({ where: { id: clientId }, select: { id: true, name: true } })
    : await prisma.client.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } })

  return NextResponse.json({ assets, clients })
}
