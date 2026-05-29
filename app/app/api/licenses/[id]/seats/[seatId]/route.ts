import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; seatId: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  const { seatId } = await params
  try {
    await prisma.licenseSeatAssignment.delete({ where: { id: seatId } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Failed to remove seat" }, { status: 500 })
  }
}
