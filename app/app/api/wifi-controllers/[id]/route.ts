import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const body = await req.json()
    const { name, type, assetId, networkDeviceId, credentialId, managementUrl, notes, isActive } = body
    if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 })
    const controller = await prisma.wifiController.update({
      where: { id },
      data: {
        name: name.trim(),
        type,
        assetId: assetId || null,
        networkDeviceId: networkDeviceId || null,
        credentialId: credentialId || null,
        managementUrl: managementUrl?.trim() || null,
        notes: notes?.trim() || null,
        isActive: isActive ?? true,
      },
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
    })
    return NextResponse.json(controller)
  } catch {
    return NextResponse.json({ error: "Failed to update wifi controller" }, { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    await prisma.wifiController.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Failed to delete wifi controller" }, { status: 500 })
  }
}
