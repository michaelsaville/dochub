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
    const {
      accessorType, clientUserId, vendorId, staffUserId, contactId,
      thirdPartyName, credentialId, mfaEnabled, accessScope, certExpiry, notes, isActive,
    } = body
    const accessor = await prisma.vpnAccessor.update({
      where: { id },
      data: {
        accessorType: accessorType ?? undefined,
        clientUserId: clientUserId ?? null,
        vendorId: vendorId ?? null,
        staffUserId: staffUserId ?? null,
        contactId: contactId ?? null,
        thirdPartyName: thirdPartyName?.trim() ?? null,
        credentialId: credentialId ?? null,
        mfaEnabled: mfaEnabled ?? undefined,
        accessScope: accessScope?.trim() ?? null,
        certExpiry: certExpiry !== undefined ? (certExpiry ? new Date(certExpiry) : null) : undefined,
        notes: notes?.trim() ?? null,
        isActive: isActive ?? undefined,
      },
      include: {
        clientUser: { select: { id: true, name: true, email: true } },
        vendor: { select: { id: true, name: true } },
        staffUser: { select: { id: true, name: true, email: true } },
        contact: { select: { id: true, name: true, role: true } },
        credential: { select: { id: true, label: true } },
      },
    })
    return NextResponse.json(accessor)
  } catch (e) {
    return NextResponse.json({ error: "Failed to update VPN accessor" }, { status: 500 })
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
    await prisma.vpnAccessor.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: "Failed to delete VPN accessor" }, { status: 500 })
  }
}
