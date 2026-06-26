import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  readSignedBody,
  authorizeClientUser,
  resolveGrantForClient,
  itemVisibleToUser,
  isManageableType,
} from "../_helpers"

export const dynamic = "force-dynamic"

interface Payload {
  clientId: string
  portalUserId: string
  isPortalOwner?: boolean
  grantId: string
  itemType: string
  itemId: string
  note?: string
}

/**
 * POST /api/bff/portal/dochub/client-vendor/share  (HMAC-signed)
 *
 * A CLIENT portal user shares one of their own items (document / file / vault
 * credential) with a vendor. Authorization, in order: the user is linked to
 * the client, the grant is active and belongs to the client, the item type is
 * client-manageable (never internal CREDENTIAL), and the item is both owned by
 * the client AND visible to this user. The share row IS the vendor's
 * authorization to see it.
 */
export async function POST(req: Request) {
  const r = await readSignedBody<Payload>(req)
  if (!r.ok) return r.res
  const p = r.body

  const auth = await authorizeClientUser(p)
  if (!auth.ok) return auth.res
  const { actor } = auth

  if (!isManageableType(p.itemType)) {
    return NextResponse.json({ ok: false, error: "Unsupported item type" }, { status: 400 })
  }
  if (!p.itemId || !p.grantId) {
    return NextResponse.json({ ok: false, error: "grantId, itemId required" }, { status: 400 })
  }

  const grant = await resolveGrantForClient(p.grantId, actor.clientId)
  if (!grant) return NextResponse.json({ ok: false, error: "Grant not found" }, { status: 404 })

  const visible = await itemVisibleToUser(p.itemType, p.itemId, actor)
  if (!visible) return NextResponse.json({ ok: false, error: "Item not found" }, { status: 404 })

  try {
    const share = await prisma.vendorShare.create({
      data: {
        grantId: grant.id,
        itemType: p.itemType,
        itemId: p.itemId,
        note: p.note?.trim() || null,
        createdByPortalUserId: actor.portalUserId,
      },
      select: { id: true, itemType: true, itemId: true, note: true, createdAt: true },
    })
    return NextResponse.json({ ok: true, share }, { status: 201 })
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2002") {
      return NextResponse.json({ ok: false, error: "Already shared" }, { status: 409 })
    }
    console.error("[client-vendor/share]", e)
    return NextResponse.json({ ok: false, error: "Share failed" }, { status: 500 })
  }
}
