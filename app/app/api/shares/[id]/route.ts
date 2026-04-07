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
    const { name, uncPath, shareType, domainId, assetId, driveLetter, purpose, notes } = body
    const share = await prisma.networkShare.update({
      where: { id },
      data: {
        name: name?.trim(),
        uncPath: uncPath?.trim(),
        shareType: shareType ?? undefined,
        domainId: domainId ?? null,
        assetId: assetId ?? null,
        driveLetter: driveLetter !== undefined ? (driveLetter?.trim().replace(":", "").toUpperCase() || null) : undefined,
        purpose: purpose?.trim() ?? null,
        notes: notes?.trim() ?? null,
      },
      include: {
        domain: { select: { id: true, name: true, netbiosName: true } },
        asset: { select: { id: true, name: true, friendlyName: true } },
        permissions: { include: { domainGroup: { select: { id: true, name: true } } } },
      },
    })
    return NextResponse.json(share)
  } catch (e) {
    return NextResponse.json({ error: "Failed to update share" }, { status: 500 })
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
    await prisma.networkShare.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: "Failed to delete share" }, { status: 500 })
  }
}
