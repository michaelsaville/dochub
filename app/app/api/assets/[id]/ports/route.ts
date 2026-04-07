import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const asset = await prisma.asset.findUnique({
      where: { id },
      select: { portCount: true },
    })
    if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 })

    const ports = await prisma.switchPort.findMany({
      where: { assetId: id },
      include: {
        vlan: true,
        interfaces: {
          include: { asset: { select: { id: true, name: true, friendlyName: true, category: true } } },
        },
      },
      orderBy: { portNumber: "asc" },
    })

    return NextResponse.json({ portCount: asset.portCount, ports })
  } catch {
    return NextResponse.json({ error: "Failed to fetch ports" }, { status: 500 })
  }
}
