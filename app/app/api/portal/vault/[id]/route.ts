import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requirePortalAuth } from "@/lib/portal-auth"
import { encrypt } from "@/lib/crypto"
import { maskItem } from "@/lib/portal-vault"

// Owner of the record OR a portal owner of the same client may modify/delete.
async function loadEditable(id: string, user: { id: string; clientId: string; isPortalOwner: boolean }) {
  const item = await prisma.portalCredential.findFirst({ where: { id, clientId: user.clientId } })
  if (!item) return null
  if (item.ownedByUserId === user.id) return item
  if (user.isPortalOwner) return item
  return null
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requirePortalAuth()
  if (error) return error
  const { id } = await params

  const item = await loadEditable(id, {
    id: user.id,
    clientId: user.clientId,
    isPortalOwner: (user as any).isPortalOwner ?? false,
  })
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { label, username, password, totp, url, notes, visibility } = await req.json()
  const v = (visibility === "PRIVATE" || visibility === "TEAM" || visibility === "MSP_SHARED")
    ? visibility : undefined

  const updated = await prisma.portalCredential.update({
    where: { id },
    data: {
      ...(label !== undefined && { label }),
      ...(username !== undefined && { username: username || null }),
      ...(password !== undefined && password !== "" && { encryptedPassword: encrypt(password) }),
      ...(totp !== undefined && { encryptedTotp: totp ? encrypt(totp) : null }),
      ...(url !== undefined && { url: url || null }),
      ...(notes !== undefined && { notes: notes || null }),
      ...(v && { visibility: v }),
    },
  })

  return NextResponse.json(maskItem(updated))
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await requirePortalAuth()
  if (error) return error
  const { id } = await params

  const item = await loadEditable(id, {
    id: user.id,
    clientId: user.clientId,
    isPortalOwner: (user as any).isPortalOwner ?? false,
  })
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await prisma.portalCredential.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
