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
    const { vendorId, carrier, accountNumber, supportPhone, notes } = body
    if (!carrier?.trim()) return NextResponse.json({ error: "Carrier is required" }, { status: 400 })
    const trunk = await prisma.sipTrunk.update({
      where: { id },
      data: {
        ...(vendorId !== undefined && { vendorId: vendorId || null }),
        carrier: carrier.trim(),
        accountNumber: accountNumber?.trim() || null,
        supportPhone: supportPhone?.trim() || null,
        notes: notes?.trim() || null,
      },
      include: {
        vendor: { select: { id: true, name: true, supportPhone: true } },
        dids: { include: { extension: { select: { id: true, extension: true, displayName: true } } } },
      },
    })
    return NextResponse.json(trunk)
  } catch {
    return NextResponse.json({ error: "Failed to update SIP trunk" }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    await prisma.sipTrunk.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Failed to delete SIP trunk" }, { status: 500 })
  }
}
