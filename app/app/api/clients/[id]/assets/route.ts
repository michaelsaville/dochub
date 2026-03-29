import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { writeActivity } from "@/lib/activity"

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
          include: {
            assetType: { select: { id: true, name: true } },
            primaryUser: { select: { id: true, name: true } },
          },
        },
      },
    })
    const assets = locations.flatMap(l => l.assets)
    return NextResponse.json(assets)
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch assets" }, { status: 500 })
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const body = await req.json()
    const {
      locationId, assetTypeId, name, make, model, serial, assetTag,
      ipAddress, macAddress, managementUrl, purchaseDate, warrantyExpiry,
      primaryUserId, notes,
    } = body

    if (!locationId?.trim() || !name?.trim()) {
      return NextResponse.json({ error: "locationId and name are required" }, { status: 400 })
    }

    // Verify location belongs to this client
    const location = await prisma.location.findFirst({ where: { id: locationId, clientId: id } })
    if (!location) return NextResponse.json({ error: "Location not found" }, { status: 404 })

    const asset = await prisma.asset.create({
      data: {
        locationId,
        assetTypeId: assetTypeId || null,
        name: name.trim(),
        make: make?.trim() || null,
        model: model?.trim() || null,
        serial: serial?.trim() || null,
        assetTag: assetTag?.trim() || null,
        ipAddress: ipAddress?.trim() || null,
        macAddress: macAddress?.trim() || null,
        managementUrl: managementUrl?.trim() || null,
        purchaseDate: purchaseDate ? new Date(purchaseDate) : null,
        warrantyExpiry: warrantyExpiry ? new Date(warrantyExpiry) : null,
        primaryUserId: primaryUserId || null,
        notes: notes?.trim() || null,
      },
      include: {
        assetType: { select: { id: true, name: true } },
        primaryUser: { select: { id: true, name: true } },
      },
    })

    await writeActivity({
      clientId: id,
      staffUserId: session!.user.id,
      eventType: "ASSET_ADDED",
      title: `Asset added: ${name.trim()}`,
      body: [make?.trim(), model?.trim()].filter(Boolean).join(" ") || null,
    })

    return NextResponse.json(asset, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: "Failed to create asset" }, { status: 500 })
  }
}
