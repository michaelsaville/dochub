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
    const shares = await prisma.networkShare.findMany({
      where: { clientId: id },
      include: {
        domain: { select: { id: true, name: true, netbiosName: true } },
        asset: { select: { id: true, name: true, friendlyName: true } },
        permissions: {
          include: { domainGroup: { select: { id: true, name: true } } },
          orderBy: { principal: "asc" },
        },
      },
      orderBy: { name: "asc" },
    })
    return NextResponse.json(shares)
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch shares" }, { status: 500 })
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
    const { name, uncPath, shareType, domainId, assetId, driveLetter, purpose, notes } = body
    if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 })
    if (!uncPath?.trim()) return NextResponse.json({ error: "UNC path is required" }, { status: 400 })
    const share = await prisma.networkShare.create({
      data: {
        clientId: id,
        name: name.trim(),
        uncPath: uncPath.trim(),
        shareType: shareType || "SMB",
        domainId: domainId || null,
        assetId: assetId || null,
        driveLetter: driveLetter?.trim().replace(":", "").toUpperCase() || null,
        purpose: purpose?.trim() || null,
        notes: notes?.trim() || null,
      },
      include: {
        domain: { select: { id: true, name: true, netbiosName: true } },
        asset: { select: { id: true, name: true, friendlyName: true } },
        permissions: { include: { domainGroup: { select: { id: true, name: true } } } },
      },
    })
    return NextResponse.json(share, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: "Failed to create share" }, { status: 500 })
  }
}
