import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

/**
 * GET /api/flex-layouts/[id] → the layout plus its ordered fields (for the
 * designer and the /flex/[slug] index). Any authed staff.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const layout = await prisma.flexLayout.findUnique({
      where: { id },
      include: {
        fields: { orderBy: { position: "asc" } },
        _count: { select: { assets: true } },
      },
    })
    if (!layout) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ ...layout, assetCount: layout._count.assets })
  } catch {
    return NextResponse.json({ error: "Failed to fetch layout" }, { status: 500 })
  }
}

/**
 * PATCH /api/flex-layouts/[id] → update layout chrome (name/icon/color/
 * sortOrder/showInNav/isActive). ADMIN only. Slug is intentionally NOT mutable
 * so deep-links stay stable.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAuth("ADMIN")
  if (error) return error
  try {
    const { id } = await params
    const body = await req.json()
    const { name, icon, color, description, sortOrder, showInNav, isActive } = body
    const layout = await prisma.flexLayout.update({
      where: { id },
      data: {
        ...(name?.trim() && { name: name.trim() }),
        ...(icon?.trim() && { icon: icon.trim() }),
        ...(color?.trim() && { color: color.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(sortOrder !== undefined && { sortOrder: Number(sortOrder) || 0 }),
        ...(showInNav !== undefined && { showInNav: !!showInNav }),
        ...(isActive !== undefined && { isActive: !!isActive }),
      },
    })
    return NextResponse.json(layout)
  } catch {
    return NextResponse.json({ error: "Failed to update layout" }, { status: 500 })
  }
}

/**
 * DELETE /api/flex-layouts/[id] → soft-delete (isActive=false). ADMIN only.
 * Blocked (409) while any FlexAsset instances still reference the layout — the
 * caller must archive/remove instances first.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAuth("ADMIN")
  if (error) return error
  try {
    const { id } = await params
    const count = await prisma.flexAsset.count({ where: { layoutId: id } })
    if (count > 0) {
      return NextResponse.json(
        { error: `Cannot delete a layout with ${count} instance(s); archive them first` },
        { status: 409 },
      )
    }
    await prisma.flexLayout.update({ where: { id }, data: { isActive: false } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Failed to delete layout" }, { status: 500 })
  }
}
