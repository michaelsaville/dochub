import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const body = await req.json()
    const { ipAddress, hostname, assetId, userId, notes } = body
    if (!ipAddress?.trim()) return NextResponse.json({ error: "IP address is required" }, { status: 400 })
    const ip = await prisma.ipAssignment.create({
      data: {
        subnetId: id,
        ipAddress: ipAddress.trim(),
        hostname: hostname?.trim() || null,
        assetId: assetId || null,
        userId: userId || null,
        notes: notes?.trim() || null,
      },
      include: {
        asset: { select: { id: true, name: true, category: true } },
        user: { select: { id: true, name: true } },
      },
    })
    return NextResponse.json(ip, { status: 201 })
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "That IP is already assigned in this subnet" }, { status: 409 })
    }
    return NextResponse.json({ error: "Failed to create IP assignment" }, { status: 500 })
  }
}
