import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyPortalHmac } from "@/lib/bff-hmac"

/**
 * Shared plumbing for the vendor-portal BFF. A "vendor" here is a CLIENT's
 * outside vendor (e.g. "American Choice" servicing "Braddock Medical") who
 * signs in to the vendor portal and may see ONLY the credentials/documents
 * explicitly shared with them via VendorShare rows.
 *
 * Authorization is owned entirely by DocHub: the portal authenticates the
 * vendor user and asserts { vendorId, clientId } over an HMAC-signed call;
 * DocHub independently confirms an ACTIVE VendorClientGrant exists and that
 * every returned item has a matching VendorShare (default-deny).
 */

export async function readSignedBody<T>(req: Request): Promise<
  | { ok: true; body: T }
  | { ok: false; res: NextResponse }
> {
  const rawBody = await req.text()
  const verify = verifyPortalHmac(
    rawBody,
    req.headers.get("x-portal-signature"),
    req.headers.get("x-portal-timestamp"),
    process.env.PORTAL_BFF_SECRET ?? "",
  )
  if (!verify.ok) {
    return {
      ok: false,
      res: NextResponse.json({ ok: false, error: verify.reason }, { status: verify.status }),
    }
  }
  try {
    return { ok: true, body: JSON.parse(rawBody) as T }
  } catch {
    return {
      ok: false,
      res: NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 }),
    }
  }
}

/**
 * Resolve the active grant for a (vendorId, clientId) pair. Returns null when
 * no grant exists or it's been deactivated — callers must treat null as a
 * hard 403/404 (the vendor sees nothing).
 */
export async function resolveGrant(vendorId: string, clientId: string) {
  if (!vendorId || !clientId) return null
  return prisma.vendorClientGrant.findFirst({
    where: { vendorId, clientId, isActive: true },
  })
}

/**
 * The set of itemIds of a given type that are shared inside a grant. The
 * authorization gate for every read: an item must be in this set or it does
 * not exist as far as the vendor is concerned.
 */
export async function sharedIds(
  grantId: string,
  itemType: "CREDENTIAL" | "DOCUMENT" | "ATTACHMENT",
): Promise<string[]> {
  const rows = await prisma.vendorShare.findMany({
    where: { grantId, itemType },
    select: { itemId: true },
  })
  return rows.map((r) => r.itemId)
}
