import { prisma } from "@/lib/prisma"

/**
 * DocHub-side authZ for the portal BFF. The HMAC proves the super-portal sent
 * the request — NOT who. This resolves the acting portal user against the
 * super-portal's link table (portal.portal_user_client_links) so DocHub owns
 * authorization instead of trusting clientId / isPortalOwner from the body.
 *
 * Non-breaking by design: when the caller doesn't supply portalUserId (today's
 * data-route calls), mode is "legacy" and behaviour is unchanged. Enforcement
 * activates the moment the portal app starts sending a verified portalUserId.
 */
export type PortalAccess =
  | { mode: "legacy" }
  | { mode: "denied" }
  | { mode: "granted"; isOwner: boolean; permissions: Record<string, boolean> }

export async function getPortalAccess(
  portalUserId: string | undefined | null,
  clientId: string,
): Promise<PortalAccess> {
  if (!portalUserId) return { mode: "legacy" }
  try {
    const rows = await prisma.$queryRaw<{ role: string; permissions: unknown }[]>`
      SELECT role, permissions
      FROM portal.portal_user_client_links
      WHERE "portalUserId" = ${portalUserId} AND "clientId" = ${clientId}
      LIMIT 1
    `
    if (rows.length === 0) return { mode: "denied" }
    const role = rows[0].role
    const permissions = (rows[0].permissions && typeof rows[0].permissions === "object")
      ? (rows[0].permissions as Record<string, boolean>)
      : {}
    return { mode: "granted", isOwner: role === "OWNER", permissions }
  } catch (e) {
    // Don't break the live portal on a lookup error — degrade to legacy.
    console.error("[portal-access] link lookup failed", String(e))
    return { mode: "legacy" }
  }
}

/**
 * Whether a portal read of a given category (assets/documents/contacts/
 * locations/licenses/domains) is allowed. OWNER sees all; an explicit `false`
 * in the per-client permissions denies; absent/true allows (matches today's
 * empty `{}` = allow). Legacy (no portalUserId) = allow for back-compat.
 */
export function categoryAllowed(access: PortalAccess, category: string): boolean {
  if (access.mode === "legacy") return true
  if (access.mode === "denied") return false
  if (access.isOwner) return true
  return access.permissions[category] !== false
}
