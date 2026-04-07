import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function POST(req: Request, { params }: { params: Promise<{ lineId: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { lineId } = await params
    const { number, designation, port, extensionId, notes } = await req.json()
    if (!number?.trim()) return NextResponse.json({ error: "Number is required" }, { status: 400 })
    const num = await prisma.potsNumber.create({
      data: {
        lineId,
        number: number.trim(),
        designation: designation?.trim() || null,
        port: port?.trim() || null,
        extensionId: extensionId || null,
        notes: notes?.trim() || null,
      },
      include: { extension: { select: { id: true, extension: true, displayName: true } } },
    })
    return NextResponse.json(num, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Failed to create number" }, { status: 500 })
  }
}
