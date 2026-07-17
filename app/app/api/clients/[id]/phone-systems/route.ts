import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    if (!scopeAllows(await getClientScope(), id)) return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })
    const systems = await prisma.phoneSystem.findMany({
      where: { clientId: id },
      include: {
        asset: { select: { id: true, name: true, friendlyName: true } },
        credential: { select: { id: true, label: true } },
        extensions: {
          include: {
            person: { select: { id: true, name: true, email: true } },
            asset: { select: { id: true, name: true, friendlyName: true } },
            credential: { select: { id: true, label: true } },
            voicemailCred: { select: { id: true, label: true } },
          },
          orderBy: { extension: "asc" },
        },
        sipTrunks: {
          include: {
            vendor: { select: { id: true, name: true, supportPhone: true } },
            dids: {
              include: { extension: { select: { id: true, extension: true, displayName: true } } },
              orderBy: { number: "asc" },
            },
          },
          orderBy: { carrier: "asc" },
        },
        potsLines: {
          include: {
            vendor: { select: { id: true, name: true, supportPhone: true } },
            numbers: {
              include: { extension: { select: { id: true, extension: true, displayName: true } } },
              orderBy: { number: "asc" },
            },
          },
          orderBy: { carrier: "asc" },
        },
      },
      orderBy: { name: "asc" },
    })
    return NextResponse.json(systems)
  } catch {
    return NextResponse.json({ error: "Failed to fetch phone systems" }, { status: 500 })
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
    if (!scopeAllows(await getClientScope(), id)) return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })
    const body = await req.json()
    const { name, type, assetId, credentialId, sipDomain, managementUrl, notes } = body
    if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 })
    if (!type) return NextResponse.json({ error: "Type is required" }, { status: 400 })
    const system = await prisma.phoneSystem.create({
      data: {
        clientId: id,
        name: name.trim(),
        type,
        assetId: assetId || null,
        credentialId: credentialId || null,
        sipDomain: sipDomain?.trim() || null,
        managementUrl: managementUrl?.trim() || null,
        notes: notes?.trim() || null,
      },
      include: {
        asset: { select: { id: true, name: true, friendlyName: true } },
        credential: { select: { id: true, label: true } },
        extensions: true,
        sipTrunks: { include: { vendor: { select: { id: true, name: true, supportPhone: true } }, dids: true } },
        potsLines: { include: { vendor: { select: { id: true, name: true, supportPhone: true } }, numbers: true } },
      },
    })
    return NextResponse.json(system, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Failed to create phone system" }, { status: 500 })
  }
}
