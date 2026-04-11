import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requirePortalAuth } from "@/lib/portal-auth"
import { decrypt } from "@/lib/crypto"
import { buildVisibilityWhere, generateTotp, getActivePortalVaultSession } from "@/lib/portal-vault"

// GET /api/portal/vault/[id]/reveal — requires unlocked vault session
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requirePortalAuth()
  if (error) return error
  const { id } = await params

  const active = await getActivePortalVaultSession(user.id)
  if (!active) {
    return NextResponse.json({ error: "Vault locked" }, { status: 403 })
  }

  const where = buildVisibilityWhere({
    id: user.id,
    clientId: user.clientId,
    isPortalOwner: (user as any).isPortalOwner ?? false,
  })

  const item = await prisma.portalCredential.findFirst({ where: { ...where, id } })
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const password = item.encryptedPassword ? decrypt(item.encryptedPassword) : null
  let totpCode: string | null = null
  let totpSecret: string | null = null
  if (item.encryptedTotp) {
    totpSecret = decrypt(item.encryptedTotp)
    totpCode = generateTotp(totpSecret)
  }
  return NextResponse.json({ password, totpCode, totpSecret })
}
