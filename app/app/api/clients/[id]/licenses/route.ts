import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { writeActivity } from "@/lib/activity"
import { encrypt } from "@/lib/crypto"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const url = new URL(req.url)
    const includeInactive = url.searchParams.get("includeInactive") === "true"
    const licenses = await prisma.license.findMany({
      where: { clientId: id, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: { name: "asc" },
      include: {
        person: { select: { id: true, name: true, email: true } },
        vendorRef: { select: { id: true, name: true, supportPhone: true, supportEmail: true, portalUrl: true } },
        _count: { select: { seatAssignments: true } },
      },
    })
    return NextResponse.json(licenses)
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch licenses" }, { status: 500 })
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const body = await req.json()
    const { name, vendor, vendorId, licenseKey, seats, assignedSeats, purchaseDate, expiryDate, renewalDate, cost, pax8Id, notes, personId } = body
    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }
    const license = await prisma.license.create({
      data: {
        clientId: id,
        name: name.trim(),
        vendor: vendor?.trim() || null,
        vendorId: vendorId || null,
        licenseKey: licenseKey?.trim() ? encrypt(licenseKey.trim()) : null,
        seats: seats ? Number(seats) : null,
        assignedSeats: assignedSeats ? Number(assignedSeats) : null,
        purchaseDate: purchaseDate ? new Date(purchaseDate) : null,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        renewalDate: renewalDate ? new Date(renewalDate) : null,
        cost: cost ? Number(cost) : null,
        pax8Id: pax8Id?.trim() || null,
        notes: notes?.trim() || null,
        personId: personId || null,
      },
      include: {
        person: { select: { id: true, name: true, email: true } },
        vendorRef: { select: { id: true, name: true } },
      },
    })
    await writeActivity({
      clientId: id,
      staffUserId: session!.user.id,
      eventType: "LICENSE_CHANGED",
      title: `License added: ${name.trim()}`,
      body: vendor?.trim() ? `Vendor: ${vendor.trim()}` : null,
    })

    return NextResponse.json(license, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: "Failed to create license" }, { status: 500 })
  }
}
