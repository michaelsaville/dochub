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
    const racks = await prisma.rack.findMany({
      where: { location: { clientId: id } },
      include: {
        location: { select: { id: true, name: true } },
        slots: {
          include: {
            networkDevice: { select: { id: true, name: true, type: true, make: true, model: true } },
            asset: { select: { id: true, name: true, category: true, make: true, model: true } },
          },
          orderBy: { startU: "asc" },
        },
      },
      orderBy: [{ location: { name: "asc" } }, { name: "asc" }],
    })
    return NextResponse.json(racks)
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch racks" }, { status: 500 })
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const body = await req.json()
    const { name, locationId, totalU, notes } = body
    if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 })
    if (!locationId) return NextResponse.json({ error: "Location is required" }, { status: 400 })
    // Verify location belongs to this client
    const location = await prisma.location.findFirst({ where: { id: locationId, clientId: id } })
    if (!location) return NextResponse.json({ error: "Location not found" }, { status: 404 })
    const rack = await prisma.rack.create({
      data: {
        locationId,
        name: name.trim(),
        totalU: totalU || 42,
        notes: notes?.trim() || null,
      },
      include: {
        location: { select: { id: true, name: true } },
        slots: true,
      },
    })
    return NextResponse.json(rack, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: "Failed to create rack" }, { status: 500 })
  }
}
