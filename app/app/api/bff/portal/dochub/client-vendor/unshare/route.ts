import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { readSignedBody, authorizeClientUser, CLIENT_MANAGEABLE_TYPES } from "../_helpers"

export const dynamic = "force-dynamic"

interface Payload {
  clientId: string
  portalUserId: string
  isPortalOwner?: boolean
  grantId: string
  shareId: string
}

/**
 * POST /api/bff/portal/dochub/client-vendor/unshare  (HMAC-signed)
 *
 * Remove a client-manageable share. Double-scoped: the share must be of a
 * manageable type AND sit under an active grant belonging to this client.
 * Internal CREDENTIAL shares can never be removed here (not a manageable
 * type), so a client can't undo staff-managed credential sharing.
 */
export async function POST(req: Request) {
  const r = await readSignedBody<Payload>(req)
  if (!r.ok) return r.res
  const p = r.body

  const auth = await authorizeClientUser(p)
  if (!auth.ok) return auth.res
  const { actor } = auth

  if (!p.shareId || !p.grantId) {
    return NextResponse.json({ ok: false, error: "grantId, shareId required" }, { status: 400 })
  }

  const share = await prisma.vendorShare.findFirst({
    where: {
      id: p.shareId,
      grantId: p.grantId,
      itemType: { in: [...CLIENT_MANAGEABLE_TYPES] },
      // Only the client's OWN shares — never a staff-created doc/file share.
      createdByPortalUserId: { not: null },
      grant: { clientId: actor.clientId, isActive: true },
    },
    select: { id: true },
  })
  if (!share) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 })

  await prisma.vendorShare.delete({ where: { id: share.id } })
  return NextResponse.json({ ok: true })
}
