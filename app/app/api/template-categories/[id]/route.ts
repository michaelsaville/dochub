import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth("ADMIN")
  if (error) return error
  try {
    const { id } = await params
    const { name, color, order } = await req.json()
    const data: any = {}
    if (name !== undefined) {
      if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 })
      data.name = name.trim()
    }
    if (color !== undefined) data.color = color
    if (order !== undefined) data.order = order
    const cat = await prisma.templateCategory.update({ where: { id }, data })
    return NextResponse.json(cat)
  } catch (e: any) {
    if (e?.code === "P2002") return NextResponse.json({ error: "Category already exists" }, { status: 409 })
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}

// DELETE — Template.categoryId is onDelete:SetNull, so templates in this
// category are simply un-filed, never deleted.
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth("ADMIN")
  if (error) return error
  try {
    const { id } = await params
    await prisma.templateCategory.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
