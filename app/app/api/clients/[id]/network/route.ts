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
    const devices = await prisma.networkDevice.findMany({
      where: { clientId: id, isActive: true },
      include: { location: { select: { id: true, name: true } } },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    })
    return NextResponse.json(devices)
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch network devices" }, { status: 500 })
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
    const { name, type, make, model, ipAddress, macAddress, serial, firmwareVersion, managementUrl, locationId, notes, portCount } = body
    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }
    const device = await prisma.networkDevice.create({
      data: {
        clientId: id,
        name: name.trim(),
        type: type || "OTHER",
        make: make?.trim() || null,
        model: model?.trim() || null,
        ipAddress: ipAddress?.trim() || null,
        macAddress: macAddress?.trim() || null,
        serial: serial?.trim() || null,
        firmwareVersion: firmwareVersion?.trim() || null,
        managementUrl: managementUrl?.trim() || null,
        locationId: locationId || null,
        notes: notes?.trim() || null,
        portCount: portCount ? Number(portCount) : null,
      },
      include: { location: { select: { id: true, name: true } } },
    })
    return NextResponse.json(device, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: "Failed to create network device" }, { status: 500 })
  }
}
