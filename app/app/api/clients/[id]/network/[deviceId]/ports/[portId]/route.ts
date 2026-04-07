import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

// portId here is the portNumber (integer), not the record id
// We upsert by networkDeviceId + portNumber
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; deviceId: string; portId: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { deviceId, portId } = await params
    const portNumber = Number(portId)
    if (isNaN(portNumber)) return NextResponse.json({ error: "Invalid port number" }, { status: 400 })

    const body = await req.json()
    const { label, isUplink, isPoe, vlanId, notes } = body

    const existing = await prisma.switchPort.findFirst({ where: { networkDeviceId: deviceId, portNumber } })

    let port
    if (existing) {
      port = await prisma.switchPort.update({
        where: { id: existing.id },
        data: {
          ...(label !== undefined && { label: label?.trim() || null }),
          ...(isUplink !== undefined && { isUplink }),
          ...(isPoe !== undefined && { isPoe }),
          ...(vlanId !== undefined && { vlanId: vlanId || null }),
          ...(notes !== undefined && { notes: notes?.trim() || null }),
        },
        include: { vlan: true, interfaces: { include: { asset: { select: { id: true, name: true, friendlyName: true, category: true } } } } },
      })
    } else {
      port = await prisma.switchPort.create({
        data: { networkDeviceId: deviceId, portNumber, label: label?.trim() || null, isUplink: isUplink ?? false, isPoe: isPoe ?? false, vlanId: vlanId || null, notes: notes?.trim() || null },
        include: { vlan: true, interfaces: { include: { asset: { select: { id: true, name: true, friendlyName: true, category: true } } } } },
      })
    }
    return NextResponse.json(port)
  } catch {
    return NextResponse.json({ error: "Failed to update port" }, { status: 500 })
  }
}
