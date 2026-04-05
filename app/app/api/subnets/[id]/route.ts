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
    const { cidr, locationId, gateway, dns1, dns2, vlan, description, notes } = body
    const subnet = await prisma.subnet.update({
      where: { id },
      data: {
        cidr: cidr?.trim(),
        locationId: locationId ?? null,
        gateway: gateway?.trim() ?? null,
        dns1: dns1?.trim() ?? null,
        dns2: dns2?.trim() ?? null,
        vlan: vlan?.trim() ?? null,
        description: description?.trim() ?? null,
        notes: notes?.trim() ?? null,
      },
      include: { location: { select: { id: true, name: true } } },
    })
    return NextResponse.json(subnet)
  } catch (e) {
    return NextResponse.json({ error: "Failed to update subnet" }, { status: 500 })
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
    await prisma.subnet.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: "Failed to delete subnet" }, { status: 500 })
  }
}
