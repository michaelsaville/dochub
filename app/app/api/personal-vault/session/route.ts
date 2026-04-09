import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

// GET /api/personal-vault/session — check if vault is unlocked
export async function GET() {
  const { session, error } = await requireAuth()
  if (error) return error

  const userId = (session!.user as any).id as string
  const vaultSession = await prisma.personalVaultSession.findUnique({ where: { staffUserId: userId } })

  if (!vaultSession || vaultSession.expiresAt < new Date()) {
    return NextResponse.json({ unlocked: false })
  }
  return NextResponse.json({ unlocked: true, expiresAt: vaultSession.expiresAt })
}

// DELETE /api/personal-vault/session — lock the vault
export async function DELETE() {
  const { session, error } = await requireAuth()
  if (error) return error

  const userId = (session!.user as any).id as string
  await prisma.personalVaultSession.deleteMany({ where: { staffUserId: userId } })
  return NextResponse.json({ success: true })
}
