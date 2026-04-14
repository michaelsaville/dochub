import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { encrypt } from "@/lib/crypto"

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
      accessorType, personId, vendorId, staffUserId,
      thirdPartyName, credentialId, mfaEnabled, accessScope, certExpiry, notes, isActive,
      credLabel, credUsername, credPassword,
    } = body

    // Inline credential creation: look up clientId via gateway
    let resolvedCredentialId = credentialId !== undefined ? (credentialId || null) : undefined
    if (credPassword?.trim()) {
      const existing = await prisma.vpnAccessor.findUnique({
        where: { id },
        select: { gateway: { select: { clientId: true } }, accessorType: true, personId: true },
      })
      if (existing) {
        const label = credLabel?.trim() || "VPN Credential"
        const type = accessorType ?? existing.accessorType
        const resolvedPersonId = (type === "PERSON" ? personId ?? existing.personId : null) || null
        const cred = await prisma.credential.create({
          data: {
            clientId: existing.gateway.clientId,
            label,
            username: credUsername?.trim() || null,
            encryptedPassword: encrypt(credPassword.trim()),
            personId: resolvedPersonId,
            url: null,
          },
        })
        resolvedCredentialId = cred.id
      }
    }

    const accessor = await prisma.vpnAccessor.update({
      where: { id },
      data: {
        accessorType: accessorType ?? undefined,
        personId: personId !== undefined ? (personId || null) : undefined,
        vendorId: vendorId !== undefined ? (vendorId || null) : undefined,
        staffUserId: staffUserId !== undefined ? (staffUserId || null) : undefined,
        thirdPartyName: thirdPartyName?.trim() ?? null,
        credentialId: resolvedCredentialId,
        mfaEnabled: mfaEnabled ?? undefined,
        accessScope: accessScope?.trim() ?? null,
        certExpiry: certExpiry !== undefined ? (certExpiry ? new Date(certExpiry) : null) : undefined,
        notes: notes?.trim() ?? null,
        isActive: isActive ?? undefined,
      },
      include: {
        person: { select: { id: true, name: true, email: true } },
        vendor: { select: { id: true, name: true } },
        staffUser: { select: { id: true, name: true, email: true } },
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
