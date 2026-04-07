import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { encrypt } from "@/lib/crypto"

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
      credLabel, credUsername, credPassword,
    } = body
    if (!accessorType) return NextResponse.json({ error: "Accessor type is required" }, { status: 400 })

    // Resolve clientId from gateway
    const gateway = await prisma.vpnGateway.findUnique({ where: { id }, select: { clientId: true } })
    if (!gateway) return NextResponse.json({ error: "Gateway not found" }, { status: 404 })

    // Inline credential creation: create and link to user if CLIENT_USER
    let resolvedCredentialId = credentialId || null
    if (credPassword?.trim()) {
      const label = credLabel?.trim() || "VPN Credential"
      const cred = await prisma.credential.create({
        data: {
          clientId: gateway.clientId,
          label,
          username: credUsername?.trim() || null,
          encryptedPassword: encrypt(credPassword.trim()),
          userId: accessorType === "CLIENT_USER" && clientUserId ? clientUserId : null,
          contactId: accessorType === "CONTACT" && contactId ? contactId : null,
          url: null,
        },
      })
      resolvedCredentialId = cred.id
    }

    const accessor = await prisma.vpnAccessor.create({
      data: {
        gatewayId: id,
        accessorType,
        clientUserId: clientUserId || null,
        vendorId: vendorId || null,
        staffUserId: staffUserId || null,
        contactId: contactId || null,
        thirdPartyName: thirdPartyName?.trim() || null,
        credentialId: resolvedCredentialId,
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
