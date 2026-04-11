import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requirePortalAuth } from "@/lib/portal-auth"
import { encrypt } from "@/lib/crypto"
import { buildVisibilityWhere, maskItem } from "@/lib/portal-vault"

// GET /api/portal/vault — list visible credentials in this portal user's client
export async function GET() {
  const { user, error } = await requirePortalAuth()
  if (error) return error

  const where = buildVisibilityWhere({
    id: user.id,
    clientId: user.clientId,
    isPortalOwner: (user as any).isPortalOwner ?? false,
  })

  const items = await prisma.portalCredential.findMany({
    where,
    orderBy: { label: "asc" },
    select: {
      id: true,
      label: true,
      username: true,
      url: true,
      notes: true,
      encryptedTotp: true,
      visibility: true,
      ownedByUserId: true,
      createdByStaffId: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  return NextResponse.json(items.map(maskItem))
}

// POST /api/portal/vault — create a credential in this portal user's client
export async function POST(req: NextRequest) {
  const { user, error } = await requirePortalAuth()
  if (error) return error

  const { label, username, password, totp, url, notes, visibility } = await req.json()
  if (!label) return NextResponse.json({ error: "label is required" }, { status: 400 })

  const v = (visibility === "TEAM" || visibility === "MSP_SHARED") ? visibility : "PRIVATE"

  const item = await prisma.portalCredential.create({
    data: {
      clientId: user.clientId,
      ownedByUserId: user.id,
      label,
      username: username || null,
      encryptedPassword: password ? encrypt(password) : encrypt(""),
      encryptedTotp: totp ? encrypt(totp) : null,
      url: url || null,
      notes: notes || null,
      visibility: v,
    },
  })

  return NextResponse.json(maskItem(item), { status: 201 })
}
