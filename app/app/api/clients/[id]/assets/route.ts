import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
