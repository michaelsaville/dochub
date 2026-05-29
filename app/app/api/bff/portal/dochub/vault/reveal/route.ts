import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/crypto"
import { generateTotp } from "@/lib/portal-vault"
import { logReveal } from "@/lib/reveal-log"
import { buildVisibilityWhere, readSignedBody } from "../_helpers"

export const dynamic = "force-dynamic"

interface Payload {
  id: string
  clientId: string
  portalUserId: string
  isPortalOwner?: boolean
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

  const where = buildVisibilityWhere({
    clientId: p.clientId,
    portalUserId: p.portalUserId,
    isPortalOwner: !!p.isPortalOwner,
  })

  const item = await prisma.portalCredential.findFirst({ where: { ...where, id: p.id } })
  if (!item) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 })

  const password = item.encryptedPassword ? decrypt(item.encryptedPassword) : null
  let totpCode: string | null = null
  if (item.encryptedTotp) {
    // Generate the rotating code but DO NOT return the seed — handing the
    // customer the TOTP secret would let them re-enroll the 2FA permanently.
    totpCode = generateTotp(decrypt(item.encryptedTotp))
  }

  await logReveal({ entityType: "portalCredential", entityId: p.id, actor: `portal:${p.portalUserId}`, source: "portal" })

  return NextResponse.json({ ok: true, password, totpCode })
}
