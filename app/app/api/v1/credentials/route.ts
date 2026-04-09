import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireApiKey } from "@/lib/api-auth"

export async function GET(req: Request) {
  const { error } = await requireApiKey(req)
  if (error) return error

  const { searchParams } = new URL(req.url)
  const clientId = searchParams.get("clientId")
  const search = searchParams.get("search")

  const credentials = await prisma.credential.findMany({
    where: {
      isRetired: false,
      ...(clientId ? { clientId } : {}),
      ...(search ? {
        OR: [
          { label: { contains: search, mode: "insensitive" } },
          { username: { contains: search, mode: "insensitive" } },
          { url: { contains: search, mode: "insensitive" } },
          { notes: { contains: search, mode: "insensitive" } },
          { client: { name: { contains: search, mode: "insensitive" } } },
        ],
      } : {}),
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
      encryptedTotp: true,
      client: { select: { id: true, name: true } },
      asset: { select: { id: true, name: true, friendlyName: true } },
    },
    orderBy: [{ isFavorite: "desc" }, { label: "asc" }],
  })

  // Return flat array for extension compatibility
  const flat = credentials.map(c => ({ ...c, hasTotp: !!c.encryptedTotp, encryptedTotp: undefined, clientName: c.client?.name }))
  return NextResponse.json(flat)
}
