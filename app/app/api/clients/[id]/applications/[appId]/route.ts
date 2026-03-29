import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; appId: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { appId } = await params
    const body = await req.json()
    const { name, vendor, version, supportUrl, notes, assignedUserId } = body
    const application = await prisma.application.update({
      where: { id: appId },
      data: {
        ...(name?.trim() && { name: name.trim() }),
        ...(vendor !== undefined && { vendor: vendor?.trim() || null }),
        ...(version !== undefined && { version: version?.trim() || null }),
        ...(supportUrl !== undefined && { supportUrl: supportUrl?.trim() || null }),
        ...(notes !== undefined && { notes: notes?.trim() || null }),
        ...(assignedUserId !== undefined && { assignedUserId: assignedUserId || null }),
      },
      include: { assignedUser: { select: { id: true, name: true } } },
    })
    return NextResponse.json(application)
  } catch (e) {
    return NextResponse.json({ error: "Failed to update application" }, { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; appId: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { appId } = await params
    await prisma.application.update({ where: { id: appId }, data: { isActive: false } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: "Failed to delete application" }, { status: 500 })
  }
}
