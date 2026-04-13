import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; interfaceId: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { interfaceId } = await params
    const body = await req.json()
    const {
      name, type, macAddress, ipAddress, vlanId, switchPortId, isPrimary, notes,
      tailscaleIp, tailscaleHostname, tailscaleDeviceId,
      tailscaleIsExitNode, tailscaleIsSubnetRouter, tailscaleSubnets,
      tailscaleTags, tailscaleOs, tailscaleVersion, credentialId,
    } = body
    const iface = await prisma.assetInterface.update({
      where: { id: interfaceId },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(type !== undefined && { type }),
        ...(macAddress !== undefined && { macAddress: macAddress?.trim() || null }),
        ...(ipAddress !== undefined && { ipAddress: ipAddress?.trim() || null }),
        ...(vlanId !== undefined && { vlanId: vlanId || null }),
        ...(switchPortId !== undefined && { switchPortId: switchPortId || null }),
        ...(isPrimary !== undefined && { isPrimary }),
        ...(notes !== undefined && { notes: notes?.trim() || null }),
        ...(tailscaleIp !== undefined && { tailscaleIp: tailscaleIp?.trim() || null }),
        ...(tailscaleHostname !== undefined && { tailscaleHostname: tailscaleHostname?.trim() || null }),
        ...(tailscaleDeviceId !== undefined && { tailscaleDeviceId: tailscaleDeviceId?.trim() || null }),
        ...(tailscaleIsExitNode !== undefined && { tailscaleIsExitNode }),
        ...(tailscaleIsSubnetRouter !== undefined && { tailscaleIsSubnetRouter }),
        ...(tailscaleSubnets !== undefined && { tailscaleSubnets: tailscaleSubnets?.trim() || null }),
        ...(tailscaleTags !== undefined && { tailscaleTags: tailscaleTags?.trim() || null }),
        ...(tailscaleOs !== undefined && { tailscaleOs: tailscaleOs?.trim() || null }),
        ...(tailscaleVersion !== undefined && { tailscaleVersion: tailscaleVersion?.trim() || null }),
        ...(credentialId !== undefined && { credentialId: credentialId || null }),
      },
      include: {
        vlan: true,
        switchPort: { include: { networkDevice: { select: { id: true, name: true } } } },
        credential: { select: { id: true, label: true, username: true } },
      },
    })
    return NextResponse.json(iface)
  } catch {
    return NextResponse.json({ error: "Failed to update interface" }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; interfaceId: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { interfaceId } = await params
    await prisma.assetInterface.delete({ where: { id: interfaceId } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Failed to delete interface" }, { status: 500 })
  }
}
