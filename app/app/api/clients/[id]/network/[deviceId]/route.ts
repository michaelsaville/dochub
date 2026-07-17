import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; deviceId: string }> }
) {
  const { session, error } = await requireAuth()
  if (error) return error
  try {
    const { id, deviceId } = await params
    if (!scopeAllows(await getClientScope(), id)) return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })
    const body = await req.json()
    const { name, type, make, model, ipAddress, macAddress, serial, firmwareVersion, managementUrl, locationId, notes, portCount, isActive } = body

    const current = await prisma.networkDevice.findUnique({
      where: { id: deviceId },
      select: { ipAddress: true, firmwareVersion: true, isActive: true },
    })

    const changedBy = session?.user?.name ?? "unknown"
    const historyEntries: { entityType: string; entityId: string; field: string; oldValue: string | null; newValue: string | null; changedBy: string }[] = []

    if (current) {
      const tracked = [
        { field: "ipAddress",      oldVal: current.ipAddress,       newVal: ipAddress      !== undefined ? (ipAddress?.trim() || null)      : undefined },
        { field: "firmwareVersion", oldVal: current.firmwareVersion,  newVal: firmwareVersion !== undefined ? (firmwareVersion?.trim() || null) : undefined },
        { field: "isActive",        oldVal: String(current.isActive), newVal: isActive        !== undefined ? String(isActive)                 : undefined },
      ]
      for (const t of tracked) {
        if (t.newVal !== undefined && t.newVal !== t.oldVal) {
          historyEntries.push({ entityType: "networkDevice", entityId: deviceId, field: t.field, oldValue: t.oldVal ?? null, newValue: t.newVal ?? null, changedBy })
        }
      }
    }

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
        ...(isActive !== undefined && { isActive }),
      },
      include: { location: { select: { id: true, name: true } } },
    })

    if (historyEntries.length > 0) {
      await prisma.fieldHistory.createMany({ data: historyEntries })
    }

    return NextResponse.json(device)
  } catch (e) {
    return NextResponse.json({ error: "Failed to update device" }, { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; deviceId: string }> }
) {
  const { session, error } = await requireAuth()
  if (error) return error
  try {
    const { id, deviceId } = await params
    if (!scopeAllows(await getClientScope(), id)) return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })
    const changedBy = session?.user?.name ?? "unknown"
    await prisma.networkDevice.update({ where: { id: deviceId }, data: { isActive: false } })
    await prisma.fieldHistory.create({
      data: { entityType: "networkDevice", entityId: deviceId, field: "isActive", oldValue: "true", newValue: "false", changedBy },
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: "Failed to archive device" }, { status: 500 })
  }
}
