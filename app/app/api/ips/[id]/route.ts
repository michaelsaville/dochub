import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const body = await req.json()
    const { ipAddress, hostname, assetId, personId, notes } = body
    const ip = await prisma.ipAssignment.update({
      where: { id },
      data: {
        ipAddress: ipAddress?.trim(),
        hostname: hostname?.trim() ?? null,
        assetId: assetId ?? null,
        personId: personId ?? null,
        notes: notes?.trim() ?? null,
      },
      include: {
        asset: { select: { id: true, name: true, category: true } },
        person: { select: { id: true, name: true } },
      },
    })
    return NextResponse.json(ip)
  } catch (e) {
    return NextResponse.json({ error: "Failed to update IP assignment" }, { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    await prisma.ipAssignment.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: "Failed to delete IP assignment" }, { status: 500 })
  }
}
