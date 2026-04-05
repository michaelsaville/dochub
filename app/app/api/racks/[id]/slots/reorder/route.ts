import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const { slotIds } = await req.json()
    if (!Array.isArray(slotIds) || slotIds.length === 0) {
      return NextResponse.json({ error: "slotIds required" }, { status: 400 })
    }

    // Update each slot's shelfPos to match its index in the new order
    await prisma.$transaction(
      slotIds.map((slotId: string, idx: number) =>
        prisma.rackSlot.update({ where: { id: slotId }, data: { shelfPos: idx } })
      )
    )

    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: "Failed to reorder slots" }, { status: 500 })
  }
}
