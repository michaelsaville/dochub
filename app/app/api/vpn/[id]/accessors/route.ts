import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function POST(
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
      thirdPartyName, credentialId, mfaEnabled, accessScope, certExpiry, notes,
    } = body
    if (!accessorType) return NextResponse.json({ error: "Accessor type is required" }, { status: 400 })
    const accessor = await prisma.vpnAccessor.create({
      data: {
        gatewayId: id,
        accessorType,
        clientUserId: clientUserId || null,
        vendorId: vendorId || null,
        staffUserId: staffUserId || null,
        contactId: contactId || null,
        thirdPartyName: thirdPartyName?.trim() || null,
        credentialId: credentialId || null,
        mfaEnabled: mfaEnabled ?? false,
        accessScope: accessScope?.trim() || null,
        certExpiry: certExpiry ? new Date(certExpiry) : null,
        notes: notes?.trim() || null,
      },
      include: {
        clientUser: { select: { id: true, name: true, email: true } },
        vendor: { select: { id: true, name: true } },
        staffUser: { select: { id: true, name: true, email: true } },
        contact: { select: { id: true, name: true, role: true } },
        credential: { select: { id: true, label: true } },
      },
    })
    return NextResponse.json(accessor, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: "Failed to create VPN accessor" }, { status: 500 })
  }
}
