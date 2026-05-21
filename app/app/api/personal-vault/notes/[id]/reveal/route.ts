import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { decrypt } from "@/lib/crypto"

// GET /api/personal-vault/notes/[id]/reveal — decrypt note body.
// Requires an active PersonalVaultSession for this user (same gate as credential reveal).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth()
  if (error) return error

  const userId = (session!.user as any).id as string
  const { id } = await params

  const vaultSession = await prisma.personalVaultSession.findUnique({ where: { staffUserId: userId } })
  if (!vaultSession || vaultSession.expiresAt < new Date()) {
    if (vaultSession && vaultSession.expiresAt < new Date()) {
      await prisma.personalVaultSession.delete({ where: { staffUserId: userId } }).catch(() => {})
    }
    return NextResponse.json({ error: "Vault locked. Authenticate with passkey first." }, { status: 403 })
  }

  const item = await prisma.personalSecureNote.findFirst({ where: { id, staffUserId: userId } })
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const body = decrypt(item.encryptedBody)
  return NextResponse.json({ body })
}
