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
    const { label, networkDeviceId, assetId, notes } = body
    const slot = await prisma.rackSlot.update({
      where: { id },
      data: {
        label: label?.trim() ?? null,
        networkDeviceId: networkDeviceId ?? null,
        assetId: assetId ?? null,
        notes: notes?.trim() ?? null,
      },
      include: {
        networkDevice: { select: { id: true, name: true, type: true, make: true, model: true } },
        asset: { select: { id: true, name: true, category: true, make: true, model: true } },
      },
    })
    return NextResponse.json(slot)
  } catch (e) {
    return NextResponse.json({ error: "Failed to update slot" }, { status: 500 })
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
    await prisma.rackSlot.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: "Failed to delete slot" }, { status: 500 })
  }
}
