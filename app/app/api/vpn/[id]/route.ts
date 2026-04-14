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
    const { name, type, serverAddress, port, protocol, assetId, networkDeviceId, credentialId, serverConfig, clientConfig, notes, isActive } = body
    const gateway = await prisma.vpnGateway.update({
      where: { id },
      data: {
        name: name?.trim(),
        type: type ?? undefined,
        serverAddress: serverAddress?.trim() ?? null,
        port: port !== undefined ? (port ? parseInt(port) : null) : undefined,
        protocol: protocol?.trim() ?? null,
        assetId: assetId ?? null,
        networkDeviceId: networkDeviceId ?? null,
        credentialId: credentialId ?? null,
        serverConfig: serverConfig?.trim() ?? null,
        clientConfig: clientConfig?.trim() ?? null,
        notes: notes?.trim() ?? null,
        isActive: isActive ?? undefined,
      },
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
        },
      },
    })
    return NextResponse.json(gateway)
  } catch (e) {
    return NextResponse.json({ error: "Failed to update VPN gateway" }, { status: 500 })
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
    await prisma.vpnGateway.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: "Failed to delete VPN gateway" }, { status: 500 })
  }
}
