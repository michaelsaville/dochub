import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { isIpv4, ipInCidr } from "@/lib/cidr"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const body = await req.json()
    const { ipAddress, hostname, assetId, personId, notes } = body
    if (!ipAddress?.trim()) return NextResponse.json({ error: "IP address is required" }, { status: 400 })
    const trimmedIp = ipAddress.trim()
    if (!isIpv4(trimmedIp)) return NextResponse.json({ error: "Invalid IPv4 address" }, { status: 400 })
    // Reject an IP that doesn't belong to this subnet — the core IPAM guarantee.
    const subnet = await prisma.subnet.findUnique({ where: { id }, select: { cidr: true } })
    if (subnet && !ipInCidr(trimmedIp, subnet.cidr)) {
      return NextResponse.json({ error: `${trimmedIp} is not inside ${subnet.cidr}` }, { status: 400 })
    }
    const ip = await prisma.ipAssignment.create({
      data: {
        subnetId: id,
        ipAddress: ipAddress.trim(),
        hostname: hostname?.trim() || null,
        assetId: assetId || null,
        personId: personId || null,
        notes: notes?.trim() || null,
      },
      include: {
        asset: { select: { id: true, name: true, category: true } },
        person: { select: { id: true, name: true } },
      },
    })

    // Two-way link: if this IP is tied to an asset that has no primary interface
    // IP yet, back-fill it (and the asset mirror) so documenting the IP here also
    // populates the asset. Never overwrites existing values. Non-fatal.
    if (assetId) {
      try {
        const [primary, assetRow] = await Promise.all([
          prisma.assetInterface.findFirst({ where: { assetId, isPrimary: true } }),
          prisma.asset.findUnique({ where: { id: assetId }, select: { ipAddress: true } }),
        ])
        if (!primary) {
          await prisma.assetInterface.create({ data: { assetId, name: "Primary", type: "ETHERNET", ipAddress: ip.ipAddress, isPrimary: true } })
        } else if (!primary.ipAddress) {
          await prisma.assetInterface.update({ where: { id: primary.id }, data: { ipAddress: ip.ipAddress } })
        }
        if (assetRow && !assetRow.ipAddress) {
          await prisma.asset.update({ where: { id: assetId }, data: { ipAddress: ip.ipAddress } })
        }
      } catch { /* non-fatal */ }
    }

    return NextResponse.json(ip, { status: 201 })
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "That IP is already assigned in this subnet" }, { status: 409 })
    }
    return NextResponse.json({ error: "Failed to create IP assignment" }, { status: 500 })
  }
}
