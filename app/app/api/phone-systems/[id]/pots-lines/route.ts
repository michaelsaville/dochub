import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const { vendorId, carrier, accountNumber, supportPhone, circuitId, notes } = await req.json()
    if (!carrier?.trim()) return NextResponse.json({ error: "Carrier is required" }, { status: 400 })
    const line = await prisma.potsLine.create({
      data: {
        systemId: id,
        vendorId: vendorId || null,
        carrier: carrier.trim(),
        accountNumber: accountNumber?.trim() || null,
        supportPhone: supportPhone?.trim() || null,
        circuitId: circuitId?.trim() || null,
        notes: notes?.trim() || null,
      },
      include: {
        vendor: { select: { id: true, name: true, supportPhone: true } },
        numbers: { include: { extension: { select: { id: true, extension: true, displayName: true } } } },
      },
    })
    return NextResponse.json(line, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Failed to create POTS line" }, { status: 500 })
  }
}
