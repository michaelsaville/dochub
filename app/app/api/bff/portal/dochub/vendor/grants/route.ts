import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { readSignedBody } from "../_helpers"

export const dynamic = "force-dynamic"

interface Payload {
  vendorId: string
}

/**
 * POST /api/bff/portal/dochub/vendor/grants  (HMAC-signed, from the portal)
 * Body: { vendorId }
 *
 * Returns the active client grants for a vendor so the portal can build its
 * client switcher and reconcile after a staff revoke. Authoritative — only
 * ACTIVE grants are returned.
 */
export async function POST(req: Request) {
  const r = await readSignedBody<Payload>(req)
  if (!r.ok) return r.res
  const { vendorId } = r.body
  if (!vendorId) return NextResponse.json({ ok: false, error: "vendorId required" }, { status: 400 })

  const grants = await prisma.vendorClientGrant.findMany({
    where: { vendorId, isActive: true },
    select: {
      clientId: true,
      label: true,
      client: { select: { name: true } },
      _count: { select: { shares: true } },
    },
    orderBy: { createdAt: "asc" },
  })

  return NextResponse.json({
    ok: true,
    grants: grants.map((g) => ({
      clientId: g.clientId,
      clientName: g.client.name,
      label: g.label,
      sharedCount: g._count.shares,
    })),
  })
}
