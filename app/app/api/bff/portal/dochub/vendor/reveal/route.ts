import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/crypto"
import { generateTotp } from "@/lib/portal-vault"
import { logReveal } from "@/lib/reveal-log"
import { readSignedBody, resolveGrant } from "../_helpers"

export const dynamic = "force-dynamic"

interface Payload {
  vendorId: string
  clientId: string
  credentialId: string
}

/**
 * POST /api/bff/portal/dochub/vendor/reveal  (HMAC-signed, from the portal)
 * Body: { vendorId, clientId, credentialId }
 *
 * Decrypts a single shared credential for the vendor. Re-checks server-side
 * that an ACTIVE grant exists AND that this credential is explicitly shared
 * (a VendorShare row) — passing an arbitrary credentialId yields 404. The
 * TOTP seed is never returned (only the rotating code) so the vendor can't
 * re-enroll the 2FA. Every reveal is logged to FieldHistory.
 */
export async function POST(req: Request) {
  const r = await readSignedBody<Payload>(req)
  if (!r.ok) return r.res
  const { vendorId, clientId, credentialId } = r.body
  if (!vendorId || !clientId || !credentialId) {
    return NextResponse.json(
      { ok: false, error: "vendorId, clientId, credentialId required" },
      { status: 400 },
    )
  }

  const grant = await resolveGrant(vendorId, clientId)
  if (!grant) return NextResponse.json({ ok: false, error: "No active grant" }, { status: 403 })

  // The share row IS the authorization. No row -> the credential does not
  // exist for this vendor.
  const share = await prisma.vendorShare.findUnique({
    where: { grantId_itemType_itemId: { grantId: grant.id, itemType: "CREDENTIAL", itemId: credentialId } },
  })
  if (!share) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 })

  const cred = await prisma.credential.findFirst({
    where: { id: credentialId, clientId, isRetired: false },
  })
  if (!cred) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 })

  const password = cred.encryptedPassword ? decrypt(cred.encryptedPassword) : null
  let totpCode: string | null = null
  if (cred.encryptedTotp) {
    totpCode = generateTotp(decrypt(cred.encryptedTotp))
  }

  await logReveal({
    entityType: "credential",
    entityId: credentialId,
    actor: `vendor:${vendorId}`,
    source: "vendor-portal",
  })

  return NextResponse.json({ ok: true, password, totpCode })
}
