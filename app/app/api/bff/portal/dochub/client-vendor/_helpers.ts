import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyPortalHmac } from "@/lib/bff-hmac"
import { getPortalAccess } from "@/lib/portal-access"
import { buildVisibilityWhere } from "../vault/_helpers"

/**
 * Shared plumbing for the CLIENT-self-managed vendor-sharing BFF (phase 2).
 *
 * Unlike the vendor BFF (which a VENDOR user calls to READ what was shared
 * with them), this namespace is called by a CLIENT portal user to MANAGE
 * which of their own items a vendor may see. The portal authenticates the
 * client user from its session cookie and asserts { clientId, portalUserId,
 * isPortalOwner } over an HMAC-signed call; DocHub independently:
 *   1. confirms (via getPortalAccess → portal.portal_user_client_links) that
 *      the user is actually linked to that client (an explicit 'denied' is a
 *      hard 403),
 *   2. scopes every grant/item to that client, and
 *   3. enforces "you can only share what you can see" — documents/files must
 *      be portalVisible and vault creds must pass the same visibility filter
 *      the customer vault uses.
 *
 * Internal MSP-held CREDENTIAL shares are intentionally OUT of scope here:
 * the client can neither list nor mutate them. The staff path is unchanged.
 */

/** Item types a CLIENT portal user may self-manage. Internal CREDENTIAL is
 *  deliberately absent — those stay staff-only. */
export const CLIENT_MANAGEABLE_TYPES = ["DOCUMENT", "ATTACHMENT", "PORTAL_CREDENTIAL"] as const
export type ClientManageableType = (typeof CLIENT_MANAGEABLE_TYPES)[number]

export function isManageableType(v: unknown): v is ClientManageableType {
  return typeof v === "string" && (CLIENT_MANAGEABLE_TYPES as readonly string[]).includes(v)
}

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

export interface ClientActor {
  portalUserId: string
  clientId: string
  owner: boolean
}

/**
 * Authorize a portal user to act on a client. getPortalAccess consults
 * portal.portal_user_client_links.
 *
 * Unlike the read-only customer-data BFF (which tolerates 'legacy' for
 * back-compat with callers that predate the link table and omit portalUserId),
 * this phase-2 surface is secret-exposing AND always sends a verified
 * portalUserId — so we fail CLOSED: only an explicit 'granted' is authorized.
 * A 'denied' (not linked) or a 'legacy' degrade (the cross-schema lookup
 * threw) both mean we can't independently confirm the link, so we reject.
 * `owner` is taken solely from the link row — the request body's
 * isPortalOwner is never trusted.
 */
export async function authorizeClientUser(opts: {
  portalUserId?: string
  clientId?: string
  isPortalOwner?: boolean
}): Promise<{ ok: true; actor: ClientActor } | { ok: false; res: NextResponse }> {
  if (!opts.portalUserId || !opts.clientId) {
    return {
      ok: false,
      res: NextResponse.json({ ok: false, error: "portalUserId, clientId required" }, { status: 400 }),
    }
  }
  const access = await getPortalAccess(opts.portalUserId, opts.clientId)
  if (access.mode !== "granted") {
    return {
      ok: false,
      res: NextResponse.json({ ok: false, error: "Not authorized for this client" }, { status: 403 }),
    }
  }
  return {
    ok: true,
    actor: { portalUserId: opts.portalUserId, clientId: opts.clientId, owner: access.isOwner },
  }
}

/** An ACTIVE grant for this (grant, client) pair, or null. */
export async function resolveGrantForClient(grantId: string, clientId: string) {
  if (!grantId || !clientId) return null
  return prisma.vendorClientGrant.findFirst({ where: { id: grantId, clientId, isActive: true } })
}

/**
 * "Can this user SHARE this item?" — the item must belong to the client AND be
 * visible to this portal user. Returns false for anything not visible so the
 * caller can answer 404 without leaking existence.
 */
export async function itemVisibleToUser(
  type: ClientManageableType,
  itemId: string,
  actor: ClientActor,
): Promise<boolean> {
  if (type === "DOCUMENT") {
    return !!(await prisma.clientDocument.findFirst({
      where: { id: itemId, clientId: actor.clientId, portalVisible: true },
      select: { id: true },
    }))
  }
  if (type === "ATTACHMENT") {
    return !!(await prisma.clientAttachment.findFirst({
      where: {
        id: itemId,
        clientId: actor.clientId,
        supersededBy: null,
        OR: [{ portalVisible: true }, { document: { portalVisible: true } }],
      },
      select: { id: true },
    }))
  }
  // PORTAL_CREDENTIAL — same visibility rule the customer vault enforces.
  const where = buildVisibilityWhere({
    clientId: actor.clientId,
    portalUserId: actor.portalUserId,
    isPortalOwner: actor.owner,
  })
  return !!(await prisma.portalCredential.findFirst({
    where: { ...where, id: itemId },
    select: { id: true },
  }))
}
