import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { encrypt } from "@/lib/crypto"

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; licenseId: string }> }
) {
  const { session, error } = await requireAuth()
  if (error) return error
  try {
    const { licenseId } = await params
    const body = await req.json()
    const { name, vendor, vendorId, licenseKey, seats, assignedSeats, purchaseDate, expiryDate, renewalDate, cost, pax8Id, notes, assignedUserId, contactId, isActive } = body

    const current = await prisma.license.findUnique({
      where: { id: licenseId },
      select: { isActive: true, seats: true },
    })

    const changedBy = session?.user?.name ?? "unknown"
    const historyEntries: { entityType: string; entityId: string; field: string; oldValue: string | null; newValue: string | null; changedBy: string }[] = []

    if (current) {
      const tracked = [
        { field: "isActive", oldVal: String(current.isActive), newVal: isActive !== undefined ? String(isActive) : undefined },
        { field: "seats",    oldVal: current.seats != null ? String(current.seats) : null, newVal: seats !== undefined ? (seats ? String(Number(seats)) : null) : undefined },
      ]
      for (const t of tracked) {
        if (t.newVal !== undefined && t.newVal !== t.oldVal) {
          historyEntries.push({ entityType: "license", entityId: licenseId, field: t.field, oldValue: t.oldVal ?? null, newValue: t.newVal ?? null, changedBy })
        }
      }
    }

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
        ...(isActive !== undefined && { isActive }),
      },
      include: {
        assignedUser: { select: { id: true, name: true } },
        contact: { select: { id: true, name: true } },
        vendorRef: { select: { id: true, name: true } },
      },
    })

    if (historyEntries.length > 0) {
      await prisma.fieldHistory.createMany({ data: historyEntries })
    }

    return NextResponse.json(license)
  } catch (e) {
    return NextResponse.json({ error: "Failed to update license" }, { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; licenseId: string }> }
) {
  const { session, error } = await requireAuth()
  if (error) return error
  try {
    const { licenseId } = await params
    const changedBy = session?.user?.name ?? "unknown"
    await prisma.license.update({ where: { id: licenseId }, data: { isActive: false } })
    await prisma.fieldHistory.create({
      data: { entityType: "license", entityId: licenseId, field: "isActive", oldValue: "true", newValue: "false", changedBy },
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: "Failed to archive license" }, { status: 500 })
  }
}
