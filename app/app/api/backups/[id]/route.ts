import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth()
  if (error) return error
  const { id } = await params
  const body = await req.json()

  const data: any = {}
  if (body.name !== undefined) data.name = body.name.trim()
  if (body.technology !== undefined) data.technology = body.technology.trim()
  if (body.type !== undefined) data.type = body.type
  if (body.frequency !== undefined) data.frequency = body.frequency?.trim() || null
  if (body.window !== undefined) data.window = body.window?.trim() || null
  if (body.retentionPolicy !== undefined) data.retentionPolicy = body.retentionPolicy?.trim() || null
  if (body.target !== undefined) data.target = body.target?.trim() || null
  if (body.encryptionEnabled !== undefined) data.encryptionEnabled = body.encryptionEnabled
  if (body.nextVerifyBy !== undefined) data.nextVerifyBy = body.nextVerifyBy ? new Date(body.nextVerifyBy) : null
  if (body.notes !== undefined) data.notes = body.notes?.trim() || null
  if (body.status !== undefined) data.status = body.status

  // Mark as verified
  if (body.markVerified) {
    data.lastVerifiedAt = new Date()
    data.verifiedBy = session?.user?.name ?? "unknown"
  }

  const config = await prisma.backupConfig.update({
    where: { id },
    data,
    include: {
      protectedAssets: {
        include: { asset: { select: { id: true, name: true, friendlyName: true } } },
      },
    },
  })

  return NextResponse.json(config)
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  const { id } = await params

  await prisma.backupConfig.delete({ where: { id } })
  return NextResponse.json({ success: true })
}

// Add or remove protected assets
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  const { id } = await params
  const { action, assetId, hostname, type, notes } = await req.json()

  if (action === "add") {
    const pa = await prisma.backupProtectedAsset.create({
      data: {
        backupConfigId: id,
        assetId: assetId || null,
        hostname: hostname?.trim() || null,
        type: type || "server",
        notes: notes?.trim() || null,
      },
      include: { asset: { select: { id: true, name: true, friendlyName: true } } },
    })
    return NextResponse.json(pa, { status: 201 })
  }

  if (action === "remove" && assetId) {
    await prisma.backupProtectedAsset.deleteMany({
      where: { backupConfigId: id, assetId },
    })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 })
}
