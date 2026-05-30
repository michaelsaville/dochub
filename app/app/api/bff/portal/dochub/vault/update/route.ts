import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { encrypt } from "@/lib/crypto"
import { maskItem, readSignedBody, VAULT_VISIBILITY, type VaultVisibility } from "../_helpers"
import { getPortalAccess } from "@/lib/portal-access"

export const dynamic = "force-dynamic"

interface Payload {
  id: string
  clientId: string
  portalUserId: string
  isPortalOwner?: boolean
  label?: string
  username?: string | null
  password?: string | null
  totp?: string | null
  url?: string | null
  notes?: string | null
  visibility?: string
}

export async function POST(req: Request) {
  const r = await readSignedBody<Payload>(req)
  if (!r.ok) return r.res
  const p = r.body

  if (!p.id || !p.clientId || !p.portalUserId) {
    return NextResponse.json(
      { ok: false, error: "id, clientId, portalUserId required" },
      { status: 400 },
    )
  }

  // Owner of the row OR a portal owner of the same client may modify.
  const item = await prisma.portalCredential.findFirst({
    where: { id: p.id, clientId: p.clientId },
  })
  if (!item) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 })
  }
  // Owner-of-row, or a client OWNER (derived from the portal link, not the body).
  const access = await getPortalAccess(p.portalUserId, p.clientId)
  const owner = access.mode === "granted" ? access.isOwner : !!p.isPortalOwner
  const editable = item.ownedByUserId === p.portalUserId || owner
  if (!editable) {
    return NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 })
  }

  const visibility =
    p.visibility && (VAULT_VISIBILITY as readonly string[]).includes(p.visibility)
      ? (p.visibility as VaultVisibility)
      : undefined

  const updated = await prisma.portalCredential.update({
    where: { id: p.id },
    data: {
      ...(p.label !== undefined && { label: p.label }),
      ...(p.username !== undefined && { username: p.username || null }),
      ...(p.password !== undefined && p.password !== null && p.password !== "" && {
        encryptedPassword: encrypt(p.password),
      }),
      ...(p.totp !== undefined && { encryptedTotp: p.totp ? encrypt(p.totp) : null }),
      ...(p.url !== undefined && { url: p.url || null }),
      ...(p.notes !== undefined && { notes: p.notes || null }),
      ...(visibility && { visibility }),
    },
  })

  return NextResponse.json({ ok: true, item: maskItem(updated) })
}
