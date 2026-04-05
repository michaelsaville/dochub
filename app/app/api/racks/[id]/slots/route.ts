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

    if (startU === undefined || startU === null) {
      return NextResponse.json({ error: "Start U is required" }, { status: 400 })
    }

    const rack = await prisma.rack.findUnique({ where: { id }, include: { slots: true } })
    if (!rack) return NextResponse.json({ error: "Rack not found" }, { status: 404 })

    const h = heightU || 1
    const isTopShelf = startU === 0

    // Boundary check (skip for top-of-rack shelf)
    if (!isTopShelf) {
      const end = startU + h - 1
      if (end > rack.totalU) {
        return NextResponse.json({ error: `Slot exceeds rack size (${rack.totalU}U)` }, { status: 400 })
      }

      // Conflict check: only block slots from DIFFERENT startU that overlap this U range
      const end2 = startU + h - 1
      const conflict = rack.slots.find(s => {
        if (s.startU === startU) return false  // same row = shelf mode, allowed
        const sEnd = s.startU + s.heightU - 1
        return startU <= sEnd && end2 >= s.startU
      })
      if (conflict) {
        return NextResponse.json({ error: `Conflicts with existing slot at U${conflict.startU}` }, { status: 409 })
      }
    }

    // Auto-assign next shelfPos for this U
    const slotsAtU = rack.slots.filter(s => s.startU === startU)
    const shelfPos = slotsAtU.length

    const slot = await prisma.rackSlot.create({
      data: {
        rackId: id,
        startU: Number(startU),
        heightU: isTopShelf ? 1 : h,
        shelfPos,
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
