import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function GET(req: Request, { params }: { params: Promise<{ id: string; deviceId: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { deviceId } = await params
    const device = await prisma.networkDevice.findUnique({
      where: { id: deviceId },
      select: { portCount: true },
    })
    if (!device) return NextResponse.json({ error: "Device not found" }, { status: 404 })

    const ports = await prisma.switchPort.findMany({
      where: { networkDeviceId: deviceId },
      include: {
        vlan: true,
        interfaces: {
          include: { asset: { select: { id: true, name: true, friendlyName: true, category: true } } },
        },
      },
      orderBy: { portNumber: "asc" },
    })

    return NextResponse.json({ portCount: device.portCount, ports })
  } catch {
    return NextResponse.json({ error: "Failed to fetch ports" }, { status: 500 })
  }
}
