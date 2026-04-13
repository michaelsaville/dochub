import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const links = await prisma.assetLink.findMany({
      where: {
        OR: [{ assetId: id }, { linkedAssetId: id }],
      },
      include: {
        asset: { select: { id: true, name: true, friendlyName: true, category: true, ipAddress: true } },
        linkedAsset: { select: { id: true, name: true, friendlyName: true, category: true, ipAddress: true } },
      },
      orderBy: { createdAt: "desc" },
    })

    // Also fetch linked entities (documents, licenses, applications, runbooks, websites)
    const [documents, licenses, applications, runbooks, websites] = await Promise.all([
      prisma.clientDocument.findMany({
        where: { assetId: id },
        select: { id: true, title: true, category: true, clientId: true },
        orderBy: { title: "asc" },
      }),
      prisma.license.findMany({
        where: { assetId: id },
        select: { id: true, name: true, vendor: true, clientId: true },
        orderBy: { name: "asc" },
      }),
      prisma.application.findMany({
        where: { assetId: id },
        select: { id: true, name: true, vendor: true, clientId: true },
        orderBy: { name: "asc" },
      }),
      prisma.runbook.findMany({
        where: { assetId: id },
        select: { id: true, title: true },
        orderBy: { title: "asc" },
      }),
      prisma.website.findMany({
        where: { assetId: id },
        select: { id: true, domain: true, label: true, clientId: true },
        orderBy: { domain: "asc" },
      }),
    ])

    return NextResponse.json({ links, documents, licenses, applications, runbooks, websites })
  } catch {
    return NextResponse.json({ error: "Failed to fetch asset links" }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const body = await req.json()
    const { linkedAssetId, relationType, notes } = body

    if (!linkedAssetId || !relationType) {
      return NextResponse.json({ error: "linkedAssetId and relationType are required" }, { status: 400 })
    }
    if (linkedAssetId === id) {
      return NextResponse.json({ error: "Cannot link an asset to itself" }, { status: 400 })
    }

    // Validate both assets exist and get their client info
    const [asset, linkedAsset] = await Promise.all([
      prisma.asset.findUnique({ where: { id }, include: { location: { select: { clientId: true } } } }),
      prisma.asset.findUnique({ where: { id: linkedAssetId }, include: { location: { select: { clientId: true } } } }),
    ])

    if (!asset || !linkedAsset) {
      return NextResponse.json({ error: "One or both assets not found" }, { status: 404 })
    }
    if (asset.location.clientId !== linkedAsset.location.clientId) {
      return NextResponse.json({ error: "Assets must belong to the same client" }, { status: 400 })
    }

    const link = await prisma.assetLink.create({
      data: {
        assetId: id,
        linkedAssetId,
        relationType,
        notes: notes?.trim() || null,
      },
      include: {
        asset: { select: { id: true, name: true, friendlyName: true, category: true, ipAddress: true } },
        linkedAsset: { select: { id: true, name: true, friendlyName: true, category: true, ipAddress: true } },
      },
    })

    return NextResponse.json(link, { status: 201 })
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "This link already exists" }, { status: 409 })
    }
    return NextResponse.json({ error: "Failed to create asset link" }, { status: 500 })
  }
}
