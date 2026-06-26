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
  /** 'managed' = MSP-held internal Credential (staff-shared, default);
   *  'vault' = customer-vault PortalCredential (client-shared, phase 2). */
  kind?: "managed" | "vault"
}

/**
 * POST /api/bff/portal/dochub/vendor/reveal  (HMAC-signed, from the portal)
 * Body: { vendorId, clientId, credentialId, kind? }
 *
 * Decrypts a single shared credential for the vendor. Re-checks server-side
 * that an ACTIVE grant exists AND that this credential is explicitly shared
 * (a VendorShare row of the matching item type) — passing an arbitrary
 * credentialId yields 404. The TOTP seed is never returned (only the rotating
 * code) so the vendor can't re-enroll the 2FA. Every reveal is logged to
 * FieldHistory.
 */
export async function POST(req: Request) {
  const r = await readSignedBody<Payload>(req)
  if (!r.ok) return r.res
  const { vendorId, clientId, credentialId, kind = "managed" } = r.body
  if (!vendorId || !clientId || !credentialId) {
    return NextResponse.json(
      { ok: false, error: "vendorId, clientId, credentialId required" },
      { status: 400 },
    )
  }

  const grant = await resolveGrant(vendorId, clientId)
  if (!grant) return NextResponse.json({ ok: false, error: "No active grant" }, { status: 403 })

  const shareItemType = kind === "vault" ? "PORTAL_CREDENTIAL" : "CREDENTIAL"

  // The share row IS the authorization. No row -> the credential does not
  // exist for this vendor.
  const share = await prisma.vendorShare.findUnique({
    where: { grantId_itemType_itemId: { grantId: grant.id, itemType: shareItemType, itemId: credentialId } },
  })
  if (!share) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 })

  let encryptedPassword: string | null = null
  let encryptedTotp: string | null = null

  if (kind === "vault") {
    // The VendorShare row is the authorization (same model as v1 managed
    // creds): a later change to the credential's internal portal-user
    // visibility (PRIVATE/TEAM/MSP_SHARED) does NOT auto-revoke the vendor's
    // access — the client revokes explicitly via /client-vendor/unshare.
    const cred = await prisma.portalCredential.findFirst({ where: { id: credentialId, clientId } })
    if (!cred) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 })
    encryptedPassword = cred.encryptedPassword
    encryptedTotp = cred.encryptedTotp
  } else {
    const cred = await prisma.credential.findFirst({ where: { id: credentialId, clientId, isRetired: false } })
    if (!cred) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 })
    encryptedPassword = cred.encryptedPassword
    encryptedTotp = cred.encryptedTotp
  }

  const password = encryptedPassword ? decrypt(encryptedPassword) : null
  let totpCode: string | null = null
  if (encryptedTotp) {
    totpCode = generateTotp(decrypt(encryptedTotp))
  }

  await logReveal({
    entityType: kind === "vault" ? "portalCredential" : "credential",
    entityId: credentialId,
    actor: `vendor:${vendorId}`,
    source: "vendor-portal",
  })

  return NextResponse.json({ ok: true, password, totpCode })
}
