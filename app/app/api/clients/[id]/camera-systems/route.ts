import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const systems = await prisma.cameraSystem.findMany({
      where: { clientId: id },
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
      orderBy: { name: "asc" },
    })
    return NextResponse.json(systems)
  } catch {
    return NextResponse.json({ error: "Failed to fetch camera systems" }, { status: 500 })
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const body = await req.json()
    const { name, type, assetId, credentialId, managementUrl, retentionDays, storageNote, notes } = body
    if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 })
    if (!type) return NextResponse.json({ error: "Type is required" }, { status: 400 })
    const system = await prisma.cameraSystem.create({
      data: {
        clientId: id,
        name: name.trim(),
        type,
        assetId: assetId || null,
        credentialId: credentialId || null,
        managementUrl: managementUrl?.trim() || null,
        retentionDays: retentionDays ? parseInt(retentionDays) : null,
        storageNote: storageNote?.trim() || null,
        notes: notes?.trim() || null,
      },
      include: {
        asset: { select: { id: true, name: true, friendlyName: true } },
        credential: { select: { id: true, label: true } },
        cameras: true,
      },
    })
    return NextResponse.json(system, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Failed to create camera system" }, { status: 500 })
  }
}
