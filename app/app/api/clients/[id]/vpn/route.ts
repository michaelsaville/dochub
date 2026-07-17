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
    const gateways = await prisma.vpnGateway.findMany({
      where: { clientId: id },
      include: {
        asset: { select: { id: true, name: true, friendlyName: true } },
        networkDevice: { select: { id: true, name: true, type: true } },
        credential: { select: { id: true, label: true } },
        accessors: {
          include: {
            person: { select: { id: true, name: true, email: true } },
            vendor: { select: { id: true, name: true } },
            staffUser: { select: { id: true, name: true, email: true } },
            credential: { select: { id: true, label: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { name: "asc" },
    })
    return NextResponse.json(gateways)
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch VPN gateways" }, { status: 500 })
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
    const { name, type, serverAddress, port, protocol, assetId, networkDeviceId, credentialId, serverConfig, clientConfig, notes } = body
    if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 })
    if (!type) return NextResponse.json({ error: "Type is required" }, { status: 400 })
    const gateway = await prisma.vpnGateway.create({
      data: {
        clientId: id,
        name: name.trim(),
        type,
        serverAddress: serverAddress?.trim() || null,
        port: port ? parseInt(port) : null,
        protocol: protocol?.trim() || null,
        assetId: assetId || null,
        networkDeviceId: networkDeviceId || null,
        credentialId: credentialId || null,
        serverConfig: serverConfig?.trim() || null,
        clientConfig: clientConfig?.trim() || null,
        notes: notes?.trim() || null,
      },
      include: {
        asset: { select: { id: true, name: true, friendlyName: true } },
        networkDevice: { select: { id: true, name: true, type: true } },
        credential: { select: { id: true, label: true } },
        accessors: true,
      },
    })
    return NextResponse.json(gateway, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: "Failed to create VPN gateway" }, { status: 500 })
  }
}
