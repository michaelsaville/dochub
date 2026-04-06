import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; interfaceId: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { interfaceId } = await params
    const body = await req.json()
    const { name, macAddress, ipAddress, vlanId, switchPortId, isPrimary, notes } = body
    const iface = await prisma.assetInterface.update({
      where: { id: interfaceId },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(macAddress !== undefined && { macAddress: macAddress?.trim() || null }),
        ...(ipAddress !== undefined && { ipAddress: ipAddress?.trim() || null }),
        ...(vlanId !== undefined && { vlanId: vlanId || null }),
        ...(switchPortId !== undefined && { switchPortId: switchPortId || null }),
        ...(isPrimary !== undefined && { isPrimary }),
        ...(notes !== undefined && { notes: notes?.trim() || null }),
      },
      include: {
        vlan: true,
        switchPort: { include: { networkDevice: { select: { id: true, name: true } } } },
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
