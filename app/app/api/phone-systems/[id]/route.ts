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
    const { name, type, assetId, credentialId, sipDomain, managementUrl, notes, isActive } = body
    if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 })
    const system = await prisma.phoneSystem.update({
      where: { id },
      data: {
        name: name.trim(),
        type,
        assetId: assetId || null,
        credentialId: credentialId || null,
        sipDomain: sipDomain?.trim() || null,
        managementUrl: managementUrl?.trim() || null,
        notes: notes?.trim() || null,
        isActive: isActive ?? true,
      },
      include: {
        asset: { select: { id: true, name: true, friendlyName: true } },
        credential: { select: { id: true, label: true } },
        extensions: {
          include: {
            clientUser: { select: { id: true, name: true, email: true } },
            asset: { select: { id: true, name: true, friendlyName: true } },
            credential: { select: { id: true, label: true } },
            voicemailCred: { select: { id: true, label: true } },
          },
          orderBy: { extension: "asc" },
        },
        sipTrunks: { orderBy: { carrier: "asc" } },
      },
    })
    return NextResponse.json(system)
  } catch {
    return NextResponse.json({ error: "Failed to update phone system" }, { status: 500 })
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
    await prisma.phoneSystem.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Failed to delete phone system" }, { status: 500 })
  }
}
