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
    const applications = await prisma.application.findMany({
      where: { clientId: id, isActive: true },
      orderBy: { name: "asc" },
      include: {
        person: { select: { id: true, name: true, email: true } },
        vendorRef: { select: { id: true, name: true, supportPhone: true, supportEmail: true, portalUrl: true } },
        _count: { select: { seatAssignments: true } },
      },
    })
    return NextResponse.json(applications)
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch applications" }, { status: 500 })
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
    const { name, vendor, version, supportUrl, notes, personId, vendorId,
            isLob, accessType, rdpHost, rdpPort, rdpGateway, appUrl, totalSeats } = body
    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }
    const application = await prisma.application.create({
      data: {
        clientId: id,
        name: name.trim(),
        vendor: vendor?.trim() || null,
        version: version?.trim() || null,
        supportUrl: supportUrl?.trim() || null,
        notes: notes?.trim() || null,
        personId: personId || null,
        vendorId: vendorId || null,
        isLob: isLob ?? false,
        accessType: accessType || null,
        rdpHost: rdpHost?.trim() || null,
        rdpPort: rdpPort ? parseInt(rdpPort) : null,
        rdpGateway: rdpGateway?.trim() || null,
        appUrl: appUrl?.trim() || null,
        totalSeats: totalSeats ? parseInt(totalSeats) : null,
      },
      include: {
        person: { select: { id: true, name: true, email: true } },
        vendorRef: { select: { id: true, name: true, supportPhone: true, supportEmail: true, portalUrl: true } },
      },
    })
    return NextResponse.json(application, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: "Failed to create application" }, { status: 500 })
  }
}
