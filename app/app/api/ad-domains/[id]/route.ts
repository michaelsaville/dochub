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
    const { name, netbiosName, functionalLevel, notes } = body
    const domain = await prisma.adDomain.update({
      where: { id },
      data: {
        name: name?.trim(),
        netbiosName: netbiosName?.trim() ?? null,
        functionalLevel: functionalLevel?.trim() ?? null,
        notes: notes?.trim() ?? null,
      },
    })
    return NextResponse.json(domain)
  } catch (e) {
    return NextResponse.json({ error: "Failed to update domain" }, { status: 500 })
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
    await prisma.adDomain.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: "Failed to delete domain" }, { status: 500 })
  }
}
