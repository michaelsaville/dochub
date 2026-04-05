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
    const controllers = await prisma.wifiController.findMany({
      where: { clientId: id },
      include: {
        asset: { select: { id: true, name: true, friendlyName: true } },
        networkDevice: { select: { id: true, name: true, type: true } },
        credential: { select: { id: true, label: true } },
        networks: {
          include: {
            credential: { select: { id: true, label: true } },
            subnet: { select: { id: true, cidr: true, vlan: true, description: true } },
          },
          orderBy: { ssid: "asc" },
        },
      },
      orderBy: { name: "asc" },
    })
    return NextResponse.json(controllers)
  } catch {
    return NextResponse.json({ error: "Failed to fetch wifi controllers" }, { status: 500 })
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
    const { name, type, assetId, networkDeviceId, credentialId, managementUrl, notes } = body
    if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 })
    if (!type) return NextResponse.json({ error: "Type is required" }, { status: 400 })
    const controller = await prisma.wifiController.create({
      data: {
        clientId: id,
        name: name.trim(),
        type,
        assetId: assetId || null,
        networkDeviceId: networkDeviceId || null,
        credentialId: credentialId || null,
        managementUrl: managementUrl?.trim() || null,
        notes: notes?.trim() || null,
      },
      include: {
        asset: { select: { id: true, name: true, friendlyName: true } },
        networkDevice: { select: { id: true, name: true, type: true } },
        credential: { select: { id: true, label: true } },
        networks: true,
      },
    })
    return NextResponse.json(controller, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Failed to create wifi controller" }, { status: 500 })
  }
}
