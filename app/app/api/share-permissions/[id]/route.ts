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
    const { principal, principalType, domainGroupId, accessLevel, layer, notes } = body
    const perm = await prisma.sharePermission.update({
      where: { id },
      data: {
        principal: principal?.trim(),
        principalType: principalType ?? undefined,
        domainGroupId: domainGroupId ?? null,
        accessLevel: accessLevel ?? undefined,
        layer: layer ?? undefined,
        notes: notes?.trim() ?? null,
      },
      include: { domainGroup: { select: { id: true, name: true } } },
    })
    return NextResponse.json(perm)
  } catch (e) {
    return NextResponse.json({ error: "Failed to update permission" }, { status: 500 })
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
    await prisma.sharePermission.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: "Failed to delete permission" }, { status: 500 })
  }
}
