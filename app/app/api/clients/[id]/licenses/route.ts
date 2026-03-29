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
    const licenses = await prisma.license.findMany({
      where: { clientId: id, isActive: true },
      orderBy: { name: "asc" },
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
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const body = await req.json()
    const { name, vendor, seats, expiryDate, renewalDate, cost, pax8Id, notes } = body
    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }
    const license = await prisma.license.create({
      data: {
        clientId: id,
        name: name.trim(),
        vendor: vendor?.trim() || null,
        seats: seats ? Number(seats) : null,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        renewalDate: renewalDate ? new Date(renewalDate) : null,
        cost: cost ? Number(cost) : null,
        pax8Id: pax8Id?.trim() || null,
        notes: notes?.trim() || null,
      },
    })
    return NextResponse.json(license, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: "Failed to create license" }, { status: 500 })
  }
}
