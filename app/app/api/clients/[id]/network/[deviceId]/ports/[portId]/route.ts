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
    const { label, isUplink, vlanId, notes } = body

    const port = await prisma.switchPort.upsert({
      where: { networkDeviceId_portNumber: { networkDeviceId: deviceId, portNumber } },
      update: {
        ...(label !== undefined && { label: label?.trim() || null }),
        ...(isUplink !== undefined && { isUplink }),
        ...(vlanId !== undefined && { vlanId: vlanId || null }),
        ...(notes !== undefined && { notes: notes?.trim() || null }),
      },
      create: {
        networkDeviceId: deviceId,
        portNumber,
        label: label?.trim() || null,
        isUplink: isUplink ?? false,
        vlanId: vlanId || null,
        notes: notes?.trim() || null,
      },
      include: {
        vlan: true,
        interfaces: {
          include: { asset: { select: { id: true, name: true, friendlyName: true, category: true } } },
        },
      },
    })
    return NextResponse.json(port)
  } catch {
    return NextResponse.json({ error: "Failed to update port" }, { status: 500 })
  }
}
