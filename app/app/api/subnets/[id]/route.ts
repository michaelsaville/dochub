import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { parseCidr } from "@/lib/cidr"

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
    let normalizedCidr: string | undefined = undefined
    if (cidr !== undefined) {
      const parsed = parseCidr(cidr?.trim() ?? "")
      if (!parsed) return NextResponse.json({ error: "Invalid CIDR — expected e.g. 192.168.1.0/24" }, { status: 400 })
      normalizedCidr = parsed.cidr
    }
    const subnet = await prisma.subnet.update({
      where: { id },
      data: {
        cidr: normalizedCidr,
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
