import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { encrypt } from "@/lib/crypto"

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; licenseId: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { licenseId } = await params
    const body = await req.json()
    const { name, vendor, vendorId, licenseKey, seats, assignedSeats, purchaseDate, expiryDate, renewalDate, cost, pax8Id, notes, assignedUserId, contactId } = body
    const license = await prisma.license.update({
      where: { id: licenseId },
      data: {
        ...(name?.trim() && { name: name.trim() }),
        ...(vendor !== undefined && { vendor: vendor?.trim() || null }),
        ...(vendorId !== undefined && { vendorId: vendorId || null }),
        ...(licenseKey !== undefined && { licenseKey: licenseKey?.trim() ? encrypt(licenseKey.trim()) : null }),
        ...(seats !== undefined && { seats: seats ? Number(seats) : null }),
        ...(assignedSeats !== undefined && { assignedSeats: assignedSeats ? Number(assignedSeats) : null }),
        ...(purchaseDate !== undefined && { purchaseDate: purchaseDate ? new Date(purchaseDate) : null }),
        ...(expiryDate !== undefined && { expiryDate: expiryDate ? new Date(expiryDate) : null }),
        ...(renewalDate !== undefined && { renewalDate: renewalDate ? new Date(renewalDate) : null }),
        ...(cost !== undefined && { cost: cost ? Number(cost) : null }),
        ...(pax8Id !== undefined && { pax8Id: pax8Id?.trim() || null }),
        ...(notes !== undefined && { notes: notes?.trim() || null }),
        ...(assignedUserId !== undefined && { assignedUserId: assignedUserId || null }),
        ...(contactId !== undefined && { contactId: contactId || null }),
      },
      include: {
        assignedUser: { select: { id: true, name: true } },
        contact: { select: { id: true, name: true } },
        vendorRef: { select: { id: true, name: true } },
      },
    })
    return NextResponse.json(license)
  } catch (e) {
    return NextResponse.json({ error: "Failed to update license" }, { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; licenseId: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { licenseId } = await params
    await prisma.license.update({ where: { id: licenseId }, data: { isActive: false } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: "Failed to delete license" }, { status: 500 })
  }
}
