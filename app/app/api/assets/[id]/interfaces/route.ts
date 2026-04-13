import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const interfaces = await prisma.assetInterface.findMany({
      where: { assetId: id },
      include: {
        vlan: true,
        switchPort: { include: { networkDevice: { select: { id: true, name: true } } } },
        credential: { select: { id: true, label: true, username: true } },
      },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    })
    return NextResponse.json(interfaces)
  } catch {
    return NextResponse.json({ error: "Failed to fetch interfaces" }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const body = await req.json()
    const {
      name, type, macAddress, ipAddress, vlanId, switchPortId, isPrimary, notes,
      tailscaleIp, tailscaleHostname, tailscaleDeviceId,
      tailscaleIsExitNode, tailscaleIsSubnetRouter, tailscaleSubnets,
      tailscaleTags, tailscaleOs, tailscaleVersion, credentialId,
    } = body
    if (!name?.trim()) {
      return NextResponse.json({ error: "Interface name is required" }, { status: 400 })
    }
    const iface = await prisma.assetInterface.create({
      data: {
        assetId: id,
        name: name.trim(),
        type: type || "ETHERNET",
        macAddress: macAddress?.trim() || null,
        ipAddress: ipAddress?.trim() || null,
        vlanId: vlanId || null,
        switchPortId: switchPortId || null,
        isPrimary: isPrimary ?? false,
        notes: notes?.trim() || null,
        tailscaleIp: tailscaleIp?.trim() || null,
        tailscaleHostname: tailscaleHostname?.trim() || null,
        tailscaleDeviceId: tailscaleDeviceId?.trim() || null,
        tailscaleIsExitNode: tailscaleIsExitNode ?? false,
        tailscaleIsSubnetRouter: tailscaleIsSubnetRouter ?? false,
        tailscaleSubnets: tailscaleSubnets?.trim() || null,
        tailscaleTags: tailscaleTags?.trim() || null,
        tailscaleOs: tailscaleOs?.trim() || null,
        tailscaleVersion: tailscaleVersion?.trim() || null,
        credentialId: credentialId || null,
      },
      include: {
        vlan: true,
        switchPort: { include: { networkDevice: { select: { id: true, name: true } } } },
        credential: { select: { id: true, label: true, username: true } },
      },
    })
    return NextResponse.json(iface, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Failed to create interface" }, { status: 500 })
  }
}
