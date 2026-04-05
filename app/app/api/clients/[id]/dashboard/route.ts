import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params

    const [rawAssets, rawCreds] = await Promise.all([
      prisma.asset.findMany({
        where: { location: { clientId: id }, isFavorite: true },
        select: {
          id: true, name: true, friendlyName: true, make: true, model: true,
          category: true, status: true, ipAddress: true,
          splashtopUrl: true, managementUrl: true, driverUrl: true,
          rdpEnabled: true, rdpHost: true, rdpPort: true,
          vncEnabled: true, vncHost: true, vncPort: true,
          isFavorite: true,
          location: { select: { name: true } },
          primaryUser: { select: { id: true, name: true } },
          assetType: { select: { name: true } },
        },
        orderBy: { name: "asc" },
      }),
      prisma.credential.findMany({
        where: { clientId: id, isFavorite: true, isRetired: false },
        orderBy: { label: "asc" },
      }),
    ])

    const favCreds = rawCreds.map(c => ({
      ...c,
      encryptedPassword: undefined,
      encryptedTotp: undefined,
      hasPassword: !!c.encryptedPassword,
      hasTotp: !!c.encryptedTotp,
    }))

    return NextResponse.json({ favoritedAssets: rawAssets, favoritedCredentials: favCreds })
  } catch (e) {
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
