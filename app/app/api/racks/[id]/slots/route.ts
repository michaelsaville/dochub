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
    const { startU, heightU, label, networkDeviceId, assetId, notes } = body
    if (!startU) return NextResponse.json({ error: "Start U is required" }, { status: 400 })

    // Check for slot conflicts
    const rack = await prisma.rack.findUnique({ where: { id }, include: { slots: true } })
    if (!rack) return NextResponse.json({ error: "Rack not found" }, { status: 404 })

    const h = heightU || 1
    const end = startU + h - 1
    if (end > rack.totalU) {
      return NextResponse.json({ error: `Slot exceeds rack size (${rack.totalU}U)` }, { status: 400 })
    }

    // Check for overlapping slots
    const conflict = rack.slots.find(s => {
      const sEnd = s.startU + s.heightU - 1
      return startU <= sEnd && end >= s.startU
    })
    if (conflict) {
      return NextResponse.json({ error: `Conflicts with existing slot at U${conflict.startU}` }, { status: 409 })
    }

    const slot = await prisma.rackSlot.create({
      data: {
        rackId: id,
        startU: Number(startU),
        heightU: h,
        label: label?.trim() || null,
        networkDeviceId: networkDeviceId || null,
        assetId: assetId || null,
        notes: notes?.trim() || null,
      },
      include: {
        networkDevice: { select: { id: true, name: true, type: true, make: true, model: true } },
        asset: { select: { id: true, name: true, category: true, make: true, model: true } },
      },
    })
    return NextResponse.json(slot, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: "Failed to create slot" }, { status: 500 })
  }
}
