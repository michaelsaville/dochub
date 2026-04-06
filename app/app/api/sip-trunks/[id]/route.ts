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
    const { carrier, accountNumber, supportPhone, didRange, notes } = body
    if (!carrier?.trim()) return NextResponse.json({ error: "Carrier is required" }, { status: 400 })
    const trunk = await prisma.sipTrunk.update({
      where: { id },
      data: {
        carrier: carrier.trim(),
        accountNumber: accountNumber?.trim() || null,
        supportPhone: supportPhone?.trim() || null,
        didRange: didRange?.trim() || null,
        notes: notes?.trim() || null,
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
