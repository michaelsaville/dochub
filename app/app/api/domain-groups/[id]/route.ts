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
    const { name, scope, purpose, members, notes } = body
    const group = await prisma.domainGroup.update({
      where: { id },
      data: {
        name: name?.trim(),
        scope: scope?.trim() ?? null,
        purpose: purpose?.trim() ?? null,
        members: Array.isArray(members)
          ? members.map((m: string) => m.trim()).filter(Boolean)
          : undefined,
        notes: notes?.trim() ?? null,
      },
    })
    return NextResponse.json(group)
  } catch (e) {
    return NextResponse.json({ error: "Failed to update group" }, { status: 500 })
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
    await prisma.domainGroup.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: "Failed to delete group" }, { status: 500 })
  }
}
