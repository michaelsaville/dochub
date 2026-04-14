import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; contactId: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id, contactId } = await params

    const [assets, credentials, licenses, applications] = await Promise.all([
      prisma.asset.findMany({
        where: { personId: contactId, location: { clientId: id } },
        select: {
          id: true, name: true, status: true, make: true, model: true,
          assetType: { select: { name: true } },
        },
        orderBy: { name: "asc" },
      }),
      prisma.credential.findMany({
        where: { personId: contactId, clientId: id, isRetired: false },
        select: { id: true, label: true, username: true, url: true },
        orderBy: { label: "asc" },
      }),
      prisma.license.findMany({
        where: { personId: contactId, clientId: id, isActive: true },
        select: { id: true, name: true, vendor: true },
        orderBy: { name: "asc" },
      }),
      prisma.application.findMany({
        where: { personId: contactId, clientId: id, isActive: true },
        select: { id: true, name: true, vendor: true },
        orderBy: { name: "asc" },
      }),
    ])

    return NextResponse.json({ assets, credentials, licenses, applications })
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch contact summary" }, { status: 500 })
  }
}
