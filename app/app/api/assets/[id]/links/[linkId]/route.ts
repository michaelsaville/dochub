import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; linkId: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { linkId } = await params
    const body = await req.json()
    const { relationType, notes } = body
    const link = await prisma.assetLink.update({
      where: { id: linkId },
      data: {
        ...(relationType !== undefined && { relationType }),
        ...(notes !== undefined && { notes: notes?.trim() || null }),
      },
      include: {
        asset: { select: { id: true, name: true, friendlyName: true, category: true, ipAddress: true } },
        linkedAsset: { select: { id: true, name: true, friendlyName: true, category: true, ipAddress: true } },
      },
    })
    return NextResponse.json(link)
  } catch {
    return NextResponse.json({ error: "Failed to update asset link" }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; linkId: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { linkId } = await params
    await prisma.assetLink.delete({ where: { id: linkId } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Failed to delete asset link" }, { status: 500 })
  }
}
