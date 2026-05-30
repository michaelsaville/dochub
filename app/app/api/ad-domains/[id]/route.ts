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
    const { name, netbiosName, functionalLevel, notes, credentialId, credUsername, credPassword, credLabel } = body

    // Fetch the domain to get clientId for credential creation
    const existing = await prisma.adDomain.findUnique({ where: { id }, select: { clientId: true, credentialId: true } })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    let resolvedCredentialId = credentialId !== undefined ? (credentialId || null) : existing.credentialId

    // If a new password was provided, REUSE the linked credential (rotate it)
    // instead of minting a fresh one each time — the old code left an orphan
    // Credential on every password change.
    if (credPassword?.trim()) {
      const label = credLabel?.trim() || `${name?.trim() || "Domain"} – Domain Admin`
      const reuseId = credentialId !== undefined ? (credentialId || null) : existing.credentialId
      if (reuseId) {
        await prisma.credential.update({
          where: { id: reuseId },
          data: {
            label,
            ...(credUsername !== undefined && { username: credUsername?.trim() || null }),
            encryptedPassword: encrypt(credPassword.trim()),
            lastRotated: new Date(),
          },
        })
        resolvedCredentialId = reuseId
      } else {
        const cred = await prisma.credential.create({
          data: {
            clientId: existing.clientId,
            label,
            username: credUsername?.trim() || null,
            encryptedPassword: encrypt(credPassword.trim()),
            url: null,
          },
        })
        resolvedCredentialId = cred.id
      }
    }

    const domain = await prisma.adDomain.update({
      where: { id },
      data: {
        name: name?.trim(),
        netbiosName: netbiosName?.trim() ?? null,
        functionalLevel: functionalLevel?.trim() ?? null,
        notes: notes?.trim() ?? null,
        credentialId: resolvedCredentialId,
      },
      include: { credential: { select: { id: true, label: true, username: true } } },
    })
    return NextResponse.json(domain)
  } catch (e) {
    return NextResponse.json({ error: "Failed to update domain" }, { status: 500 })
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
    await prisma.adDomain.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: "Failed to delete domain" }, { status: 500 })
  }
}
