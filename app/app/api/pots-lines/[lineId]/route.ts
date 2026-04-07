import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function PATCH(req: Request, { params }: { params: Promise<{ lineId: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { lineId } = await params
    const { vendorId, carrier, accountNumber, supportPhone, circuitId, notes, isActive } = await req.json()
    const line = await prisma.potsLine.update({
      where: { id: lineId },
      data: {
        ...(vendorId !== undefined && { vendorId: vendorId || null }),
        ...(carrier !== undefined && { carrier: carrier.trim() }),
        ...(accountNumber !== undefined && { accountNumber: accountNumber?.trim() || null }),
        ...(supportPhone !== undefined && { supportPhone: supportPhone?.trim() || null }),
        ...(circuitId !== undefined && { circuitId: circuitId?.trim() || null }),
        ...(notes !== undefined && { notes: notes?.trim() || null }),
        ...(isActive !== undefined && { isActive }),
      },
      include: {
        vendor: { select: { id: true, name: true, supportPhone: true } },
        numbers: { include: { extension: { select: { id: true, extension: true, displayName: true } } } },
      },
    })
    return NextResponse.json(line)
  } catch {
    return NextResponse.json({ error: "Failed to update POTS line" }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ lineId: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { lineId } = await params
    await prisma.potsLine.delete({ where: { id: lineId } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Failed to delete POTS line" }, { status: 500 })
  }
}
