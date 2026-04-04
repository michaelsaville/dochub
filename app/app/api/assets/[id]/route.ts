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
    const asset = await prisma.asset.findUnique({
      where: { id },
      include: {
        location: { include: { client: true } },
        assetType: { select: { id: true, name: true } },
        primaryUser: { select: { id: true, name: true } },
        contact: { select: { id: true, name: true } },
      },
    })
    if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(asset)
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch asset" }, { status: 500 })
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const body = await req.json()
    const {
      assetTypeId, name, make, model, serial, assetTag,
      ipAddress, macAddress, vlan, switchPort, managementUrl,
      splashtopUrl, purchaseDate, warrantyExpiry, room, notes,
      status, primaryUserId, contactId,
    } = body
    const asset = await prisma.asset.update({
      where: { id },
      data: {
        ...(assetTypeId !== undefined && { assetTypeId: assetTypeId || null }),
        ...(contactId !== undefined && { contactId: contactId || null }),
        ...(name?.trim() && { name: name.trim() }),
        ...(make !== undefined && { make: make?.trim() || null }),
        ...(model !== undefined && { model: model?.trim() || null }),
        ...(serial !== undefined && { serial: serial?.trim() || null }),
        ...(assetTag !== undefined && { assetTag: assetTag?.trim() || null }),
        ...(ipAddress !== undefined && { ipAddress: ipAddress?.trim() || null }),
        ...(macAddress !== undefined && { macAddress: macAddress?.trim() || null }),
        ...(vlan !== undefined && { vlan: vlan?.trim() || null }),
        ...(switchPort !== undefined && { switchPort: switchPort?.trim() || null }),
        ...(managementUrl !== undefined && { managementUrl: managementUrl?.trim() || null }),
        ...(splashtopUrl !== undefined && { splashtopUrl: splashtopUrl?.trim() || null }),
        ...(purchaseDate !== undefined && { purchaseDate: purchaseDate ? new Date(purchaseDate) : null }),
        ...(warrantyExpiry !== undefined && { warrantyExpiry: warrantyExpiry ? new Date(warrantyExpiry) : null }),
        ...(room !== undefined && { room: room?.trim() || null }),
        ...(notes !== undefined && { notes: notes?.trim() || null }),
        ...(status && { status }),
        ...(primaryUserId !== undefined && { primaryUserId: primaryUserId || null }),
      },
      include: {
        assetType: { select: { id: true, name: true } },
        primaryUser: { select: { id: true, name: true } },
        contact: { select: { id: true, name: true } },
      },
    })
    return NextResponse.json(asset)
  } catch (e) {
    return NextResponse.json({ error: "Failed to update asset" }, { status: 500 })
  }
}
