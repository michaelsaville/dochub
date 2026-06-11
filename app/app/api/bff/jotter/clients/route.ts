import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyPortalHmac } from "@/lib/bff-hmac"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/bff/jotter/clients  (HMAC-signed, cross-app)
 *
 * Returns the active client list (+ each client's first active location) so
 * Jotter's fan-out modal can let the user pick where an asset lands. Signed
 * with JOTTER_BFF_SECRET using the same canonical scheme as the portal BFF.
 */
export async function POST(req: Request) {
  const rawBody = await req.text()
  const verify = verifyPortalHmac(
    rawBody,
    req.headers.get("x-jotter-signature"),
    req.headers.get("x-jotter-timestamp"),
    process.env.JOTTER_BFF_SECRET ?? "",
  )
  if (!verify.ok) return NextResponse.json({ ok: false, error: verify.reason }, { status: verify.status })

  const clients = await prisma.client.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      locations: {
        where: { isActive: true },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { id: true, name: true },
      },
    },
  })

  return NextResponse.json({
    clients: clients.map((c) => ({
      id: c.id,
      name: c.name,
      locationId: c.locations[0]?.id ?? null,
      locationName: c.locations[0]?.name ?? null,
    })),
  })
}
