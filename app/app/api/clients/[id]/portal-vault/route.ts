import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"
import { encrypt, decrypt } from "@/lib/crypto"
import { generateTotp } from "@/lib/portal-vault"

// GET /api/clients/[id]/portal-vault — MSP techs see all MSP_SHARED credentials
// from this client's portal vault. Reveal is inline (techs are already authenticated
// and visiting the client page).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  const { id: clientId } = await params
  if (!scopeAllows(await getClientScope(), clientId)) return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })

  const items = await prisma.portalCredential.findMany({
    where: { clientId, visibility: "MSP_SHARED" },
    orderBy: { label: "asc" },
  })

  return NextResponse.json(items.map(i => {
    const password = i.encryptedPassword ? decrypt(i.encryptedPassword) : null
    let totpCode: string | null = null
    if (i.encryptedTotp) {
      try { totpCode = generateTotp(decrypt(i.encryptedTotp)) } catch { totpCode = null }
    }
    return {
      id: i.id,
      label: i.label,
      username: i.username,
      url: i.url,
      notes: i.notes,
      password,
      totpCode,
      hasTotp: !!i.encryptedTotp,
      ownedByUserId: i.ownedByUserId,
      createdByStaffId: i.createdByStaffId,
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
    }
  }))
}

// POST — MSP techs can add a credential into the client's MSP_SHARED space
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth()
  if (error) return error
  const { id: clientId } = await params
  if (!scopeAllows(await getClientScope(), clientId)) return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })

  const { label, username, password, totp, url, notes } = await req.json()
  if (!label) return NextResponse.json({ error: "label is required" }, { status: 400 })

  const staffId = (session!.user as any).id as string

  const item = await prisma.portalCredential.create({
    data: {
      clientId,
      ownedByUserId: null,
      createdByStaffId: staffId,
      label,
      username: username || null,
      encryptedPassword: password ? encrypt(password) : encrypt(""),
      encryptedTotp: totp ? encrypt(totp) : null,
      url: url || null,
      notes: notes || null,
      visibility: "MSP_SHARED",
    },
  })

  return NextResponse.json({ id: item.id }, { status: 201 })
}
