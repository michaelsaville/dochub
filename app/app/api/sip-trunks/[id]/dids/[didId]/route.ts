import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; didId: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { didId } = await params
    const { number, designation, extensionId, notes } = await req.json()
    const did = await prisma.sipDid.update({
      where: { id: didId },
      data: {
        ...(number !== undefined && { number: number.trim() }),
        ...(designation !== undefined && { designation: designation?.trim() || null }),
        ...(extensionId !== undefined && { extensionId: extensionId || null }),
        ...(notes !== undefined && { notes: notes?.trim() || null }),
      },
      include: { extension: { select: { id: true, extension: true, displayName: true } } },
    })
    return NextResponse.json(did)
  } catch {
    return NextResponse.json({ error: "Failed to update DID" }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; didId: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { didId } = await params
    await prisma.sipDid.delete({ where: { id: didId } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Failed to delete DID" }, { status: 500 })
  }
}
