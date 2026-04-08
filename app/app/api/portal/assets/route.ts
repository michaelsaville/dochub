import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requirePortalAuth, getPermissions } from "@/lib/portal-auth"

export async function GET() {
  const { user, error } = await requirePortalAuth()
  if (error) return error
  const perms = getPermissions(user)
  if (!perms.assets) return NextResponse.json({ error: "Access denied" }, { status: 403 })

  const assets = await prisma.asset.findMany({
    where: { location: { clientId: user.clientId }, status: { not: "RETIRED" } },
    select: {
      id: true, name: true, friendlyName: true, category: true, status: true,
      make: true, model: true, serial: true, assetTag: true,
      ipAddress: true, room: true, purchaseDate: true, warrantyExpiry: true,
      location: { select: { name: true, city: true } },
      assetType: { select: { name: true } },
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  })
  return NextResponse.json(assets)
}
