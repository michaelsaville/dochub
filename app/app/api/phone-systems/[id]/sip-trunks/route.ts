import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const trunks = await prisma.sipTrunk.findMany({ where: { systemId: id }, orderBy: { carrier: "asc" } })
    return NextResponse.json(trunks)
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 })
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
    const { carrier, accountNumber, supportPhone, didRange, notes } = body
    if (!carrier?.trim()) return NextResponse.json({ error: "Carrier is required" }, { status: 400 })
    const trunk = await prisma.sipTrunk.create({
      data: {
        systemId: id,
        carrier: carrier.trim(),
        accountNumber: accountNumber?.trim() || null,
        supportPhone: supportPhone?.trim() || null,
        didRange: didRange?.trim() || null,
        notes: notes?.trim() || null,
      },
    })
    return NextResponse.json(trunk, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Failed to create SIP trunk" }, { status: 500 })
  }
}
