import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { encrypt } from "@/lib/crypto"
import { maskItem, readSignedBody, VAULT_VISIBILITY, type VaultVisibility } from "../_helpers"

export const dynamic = "force-dynamic"

interface Payload {
  clientId: string
  portalUserId: string
  label: string
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

  if (!p.clientId || !p.portalUserId || !p.label) {
    return NextResponse.json(
      { ok: false, error: "clientId, portalUserId, label required" },
      { status: 400 },
    )
  }

  const visibility: VaultVisibility =
    (VAULT_VISIBILITY as readonly string[]).includes(p.visibility ?? "")
      ? (p.visibility as VaultVisibility)
      : "PRIVATE"

  const item = await prisma.portalCredential.create({
    data: {
      clientId: p.clientId,
      ownedByUserId: p.portalUserId,
      label: p.label,
      username: p.username || null,
      encryptedPassword: p.password ? encrypt(p.password) : encrypt(""),
      encryptedTotp: p.totp ? encrypt(p.totp) : null,
      url: p.url || null,
      notes: p.notes || null,
      visibility,
    },
  })

  return NextResponse.json({ ok: true, item: maskItem(item) }, { status: 201 })
}
