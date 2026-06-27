import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { parseCidr } from "@/lib/cidr"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const subnets = await prisma.subnet.findMany({
      where: { clientId: id },
      include: {
        location: { select: { id: true, name: true } },
        ipAssignments: {
          include: {
            asset: { select: { id: true, name: true, category: true } },
            person: { select: { id: true, name: true } },
          },
          orderBy: { ipAddress: "asc" },
        },
      },
      orderBy: { cidr: "asc" },
    })
    return NextResponse.json(subnets)
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch subnets" }, { status: 500 })
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
    const { cidr, locationId, gateway, dns1, dns2, vlan, vlanRefId, description, notes } = body
    if (!cidr?.trim()) return NextResponse.json({ error: "CIDR is required" }, { status: 400 })
    const parsed = parseCidr(cidr.trim())
    if (!parsed) return NextResponse.json({ error: "Invalid CIDR — expected e.g. 192.168.1.0/24" }, { status: 400 })
    const subnet = await prisma.subnet.create({
      data: {
        clientId: id,
        cidr: parsed.cidr, // normalized to the network address
        locationId: locationId || null,
        gateway: gateway?.trim() || null,
        dns1: dns1?.trim() || null,
        dns2: dns2?.trim() || null,
        vlan: vlan?.trim() || null,
        vlanRefId: vlanRefId || null,
        description: description?.trim() || null,
        notes: notes?.trim() || null,
      },
      include: {
        location: { select: { id: true, name: true } },
        ipAssignments: true,
      },
    })
    return NextResponse.json(subnet, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: "Failed to create subnet" }, { status: 500 })
  }
}
