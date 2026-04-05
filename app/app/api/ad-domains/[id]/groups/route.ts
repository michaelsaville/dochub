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
    const body = await req.json()
    const { name, scope, purpose, members, notes } = body
    if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 })
    const group = await prisma.domainGroup.create({
      data: {
        domainId: id,
        name: name.trim(),
        scope: scope?.trim() || null,
        purpose: purpose?.trim() || null,
        members: Array.isArray(members)
          ? members.map((m: string) => m.trim()).filter(Boolean)
          : [],
        notes: notes?.trim() || null,
      },
    })
    return NextResponse.json(group, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: "Failed to create group" }, { status: 500 })
  }
}
