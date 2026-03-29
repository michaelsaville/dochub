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
    const locations = await prisma.location.findMany({
      where: { clientId: id },
      include: {
        assets: {
          orderBy: { name: "asc" },
        },
      },
    })
    const assets = locations.flatMap(l => l.assets)
    return NextResponse.json(assets)
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch assets" }, { status: 500 })
  }
}
