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
    const { name, type, assetId, make, model, ipAddress, macAddress, resolution, location, notes, isActive } = body
    if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 })
    const camera = await prisma.camera.update({
      where: { id },
      data: {
        name: name.trim(),
        type: type || "IP_POE",
        assetId: assetId || null,
        make: make?.trim() || null,
        model: model?.trim() || null,
        ipAddress: ipAddress?.trim() || null,
        macAddress: macAddress?.trim() || null,
        resolution: resolution?.trim() || null,
        location: location?.trim() || null,
        notes: notes?.trim() || null,
        isActive: isActive ?? true,
      },
      include: {
        asset: { select: { id: true, name: true, friendlyName: true } },
      },
    })
    return NextResponse.json(camera)
  } catch {
    return NextResponse.json({ error: "Failed to update camera" }, { status: 500 })
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
    await prisma.camera.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Failed to delete camera" }, { status: 500 })
  }
}
