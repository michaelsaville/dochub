import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { buildVisibilityWhere, maskItem, readSignedBody } from "../_helpers"
import { getPortalAccess } from "@/lib/portal-access"

export const dynamic = "force-dynamic"

interface Payload {
  clientId: string
  portalUserId: string
  isPortalOwner?: boolean
}

export async function POST(req: Request) {
  const r = await readSignedBody<Payload>(req)
  if (!r.ok) return r.res
  const { clientId, portalUserId, isPortalOwner } = r.body
  if (!clientId || !portalUserId) {
    return NextResponse.json(
      { ok: false, error: "clientId and portalUserId required" },
      { status: 400 },
    )
  }

  // Derive owner from the super-portal client-link instead of trusting the body.
  // Conservative: only override when a link exists (avoids breaking unlinked users).
  const access = await getPortalAccess(portalUserId, clientId)
  const owner = access.mode === "granted" ? access.isOwner : !!isPortalOwner

  const items = await prisma.portalCredential.findMany({
    where: buildVisibilityWhere({ clientId, portalUserId, isPortalOwner: owner }),
    orderBy: { label: "asc" },
    select: {
      id: true,
      label: true,
      username: true,
      url: true,
      notes: true,
      encryptedTotp: true,
      visibility: true,
      ownedByUserId: true,
      createdByStaffId: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  return NextResponse.json({ ok: true, items: items.map(maskItem) })
}
