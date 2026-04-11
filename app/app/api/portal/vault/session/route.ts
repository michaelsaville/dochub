import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requirePortalAuth } from "@/lib/portal-auth"
import { verifyPassword } from "@/lib/portal-auth"
import { VAULT_SESSION_MINUTES, getActivePortalVaultSession } from "@/lib/portal-vault"

// GET /api/portal/vault/session — check unlock status
export async function GET() {
  const { user, error } = await requirePortalAuth()
  if (error) return error
  const active = await getActivePortalVaultSession(user.id)
  if (!active) return NextResponse.json({ unlocked: false })
  return NextResponse.json({ unlocked: true, expiresAt: active.expiresAt })
}

// POST /api/portal/vault/session — unlock by re-entering portal password
export async function POST(req: NextRequest) {
  const { user, error } = await requirePortalAuth()
  if (error) return error

  const { password } = await req.json()
  if (!password) return NextResponse.json({ error: "Password required" }, { status: 400 })

  const u = await prisma.portalUser.findUnique({ where: { id: user.id } })
  if (!u || !u.passwordHash) return NextResponse.json({ error: "No password set" }, { status: 400 })

  const ok = await verifyPassword(password, u.passwordHash)
  if (!ok) return NextResponse.json({ error: "Invalid password" }, { status: 401 })

  const expiresAt = new Date(Date.now() + VAULT_SESSION_MINUTES * 60 * 1000)
  await prisma.portalVaultSession.upsert({
    where: { portalUserId: user.id },
    create: { portalUserId: user.id, expiresAt },
    update: { expiresAt },
  })
  return NextResponse.json({ unlocked: true, expiresAt })
}

// DELETE /api/portal/vault/session — lock
export async function DELETE() {
  const { user, error } = await requirePortalAuth()
  if (error) return error
  await prisma.portalVaultSession.deleteMany({ where: { portalUserId: user.id } })
  return NextResponse.json({ success: true })
}
