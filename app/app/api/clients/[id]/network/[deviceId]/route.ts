import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; deviceId: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { deviceId } = await params
    const body = await req.json()
    const { name, type, make, model, ipAddress, macAddress, serial, firmwareVersion, managementUrl, locationId, notes, portCount } = body
    const device = await prisma.networkDevice.update({
      where: { id: deviceId },
      data: {
        ...(name?.trim() && { name: name.trim() }),
        ...(type !== undefined && { type }),
        ...(make !== undefined && { make: make?.trim() || null }),
        ...(model !== undefined && { model: model?.trim() || null }),
        ...(ipAddress !== undefined && { ipAddress: ipAddress?.trim() || null }),
        ...(macAddress !== undefined && { macAddress: macAddress?.trim() || null }),
        ...(serial !== undefined && { serial: serial?.trim() || null }),
        ...(firmwareVersion !== undefined && { firmwareVersion: firmwareVersion?.trim() || null }),
        ...(managementUrl !== undefined && { managementUrl: managementUrl?.trim() || null }),
        ...(locationId !== undefined && { locationId: locationId || null }),
        ...(notes !== undefined && { notes: notes?.trim() || null }),
        ...(portCount !== undefined && { portCount: portCount ? Number(portCount) : null }),
      },
      include: { location: { select: { id: true, name: true } } },
    })
    return NextResponse.json(device)
  } catch (e) {
    return NextResponse.json({ error: "Failed to update device" }, { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; deviceId: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { deviceId } = await params
    await prisma.networkDevice.update({ where: { id: deviceId }, data: { isActive: false } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: "Failed to delete device" }, { status: 500 })
  }
}
