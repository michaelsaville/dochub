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
    const { name, type, assetId, credentialId, managementUrl, retentionDays, storageNote, notes, isActive } = body
    if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 })
    const system = await prisma.cameraSystem.update({
      where: { id },
      data: {
        name: name.trim(),
        type,
        assetId: assetId || null,
        credentialId: credentialId || null,
        managementUrl: managementUrl?.trim() || null,
        retentionDays: retentionDays ? parseInt(retentionDays) : null,
        storageNote: storageNote?.trim() || null,
        notes: notes?.trim() || null,
        isActive: isActive ?? true,
      },
      include: {
        asset: { select: { id: true, name: true, friendlyName: true } },
        credential: { select: { id: true, label: true } },
        cameras: {
          include: {
            asset: { select: { id: true, name: true, friendlyName: true } },
          },
          orderBy: { name: "asc" },
        },
      },
    })
    return NextResponse.json(system)
  } catch {
    return NextResponse.json({ error: "Failed to update camera system" }, { status: 500 })
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
    await prisma.cameraSystem.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Failed to delete camera system" }, { status: 500 })
  }
}
