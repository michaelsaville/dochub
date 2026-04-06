import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireApiKey } from "@/lib/api-auth"

export async function GET(req: Request) {
  const { error } = await requireApiKey(req)
  if (error) return error

  const { searchParams } = new URL(req.url)
  const clientId = searchParams.get("clientId")

  const credentials = await prisma.credential.findMany({
    where: {
      isRetired: false,
      ...(clientId ? { clientId } : {}),
    },
    select: {
      id: true,
      label: true,
      username: true,
      url: true,
      notes: true,
      isFavorite: true,
      lastRotated: true,
      expiryDate: true,
      clientId: true,
      assetId: true,
      client: { select: { id: true, name: true } },
      asset: { select: { id: true, name: true, friendlyName: true } },
    },
    orderBy: [{ isFavorite: "desc" }, { label: "asc" }],
  })

  return NextResponse.json({ credentials })
}
