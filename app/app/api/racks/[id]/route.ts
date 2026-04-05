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
    const { name, totalU, notes } = body
    const rack = await prisma.rack.update({
      where: { id },
      data: {
        name: name?.trim(),
        totalU: totalU ? Number(totalU) : undefined,
        notes: notes?.trim() ?? null,
      },
    })
    return NextResponse.json(rack)
  } catch (e) {
    return NextResponse.json({ error: "Failed to update rack" }, { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    await prisma.rack.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: "Failed to delete rack" }, { status: 500 })
  }
}
