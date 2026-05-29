import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

// Per-seat assignments for a license. The assigned-seat count is DERIVED from
// these rows (no more hand-typed assignedSeats that drifts).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  const { id } = await params

  const seats = await prisma.licenseSeatAssignment.findMany({
    where: { licenseId: id },
    include: {
      person: { select: { id: true, name: true, email: true } },
      asset: { select: { id: true, name: true, friendlyName: true } },
    },
    orderBy: { createdAt: "asc" },
  })
  return NextResponse.json(seats)
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  const { id } = await params
  const body = await req.json()

  const license = await prisma.license.findUnique({ where: { id }, select: { id: true } })
  if (!license) return NextResponse.json({ error: "License not found" }, { status: 404 })

  if (!body.personId && !body.assetId && !body.notes?.trim()) {
    return NextResponse.json({ error: "Pick a person or asset (or add a note) for the seat" }, { status: 400 })
  }

  const seat = await prisma.licenseSeatAssignment.create({
    data: {
      licenseId: id,
      personId: body.personId || null,
      assetId: body.assetId || null,
      notes: body.notes?.trim() || null,
    },
    include: {
      person: { select: { id: true, name: true, email: true } },
      asset: { select: { id: true, name: true, friendlyName: true } },
    },
  })
  return NextResponse.json(seat, { status: 201 })
}
