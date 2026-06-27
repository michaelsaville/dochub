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
    const { ssid, band, security, purpose, credentialId, subnetId, vlanRefId, vlanId, vlanName, isHidden, clientIsolation, bandSteering, notes, isActive } = body
    if (!ssid?.trim()) return NextResponse.json({ error: "SSID is required" }, { status: 400 })
    const network = await prisma.wifiNetwork.update({
      where: { id },
      data: {
        ssid: ssid.trim(),
        band: band || "DUAL",
        security: security || "WPA2_PERSONAL",
        purpose: purpose || "CORPORATE",
        credentialId: credentialId || null,
        subnetId: subnetId || null,
        vlanRefId: vlanRefId || null,
        vlanId: vlanId ? parseInt(vlanId) : null,
        vlanName: vlanName?.trim() || null,
        isHidden: isHidden ?? false,
        clientIsolation: clientIsolation ?? false,
        bandSteering: bandSteering ?? false,
        notes: notes?.trim() || null,
        isActive: isActive ?? true,
      },
      include: {
        credential: { select: { id: true, label: true } },
        subnet: { select: { id: true, cidr: true, vlan: true, description: true } },
      },
    })
    return NextResponse.json(network)
  } catch {
    return NextResponse.json({ error: "Failed to update wifi network" }, { status: 500 })
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
    await prisma.wifiNetwork.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Failed to delete wifi network" }, { status: 500 })
  }
}
