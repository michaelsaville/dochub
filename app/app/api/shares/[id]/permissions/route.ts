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
    const { principal, principalType, domainGroupId, accessLevel, layer, notes } = body
    if (!principal?.trim()) return NextResponse.json({ error: "Principal is required" }, { status: 400 })
    const perm = await prisma.sharePermission.create({
      data: {
        shareId: id,
        principal: principal.trim(),
        principalType: principalType || "GROUP",
        domainGroupId: domainGroupId || null,
        accessLevel: accessLevel || "READ",
        layer: layer || "BOTH",
        notes: notes?.trim() || null,
      },
      include: { domainGroup: { select: { id: true, name: true } } },
    })
    return NextResponse.json(perm, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: "Failed to create permission" }, { status: 500 })
  }
}
