import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyPortalHmac } from "@/lib/bff-hmac"
import { getPortalAccess, categoryAllowed } from "@/lib/portal-access"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const rawBody = await req.text()
  const verify = verifyPortalHmac(
    rawBody,
    req.headers.get("x-portal-signature"),
    req.headers.get("x-portal-timestamp"),
    process.env.PORTAL_BFF_SECRET ?? "",
  )
  if (!verify.ok) return NextResponse.json({ ok: false, error: verify.reason }, { status: verify.status })

  let payload: { clientId: string; portalUserId?: string }
  try { payload = JSON.parse(rawBody) } catch { return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 }) }
  if (!payload.clientId) return NextResponse.json({ ok: false, error: "clientId required" }, { status: 400 })

  const access = await getPortalAccess(payload.portalUserId, payload.clientId)
  if (access.mode === "denied") return NextResponse.json({ ok: false, error: "Not authorized for this client" }, { status: 403 })
  if (!categoryAllowed(access, "licenses")) return NextResponse.json({ ok: true, licenses: [] })

  const rows = await prisma.license.findMany({
    where: { clientId: payload.clientId, isActive: true },
    select: {
      id: true,
      name: true,
      vendor: true,
      seats: true,
      expiryDate: true,
      renewalDate: true,
      billingTerm: true,
      status: true,
      person: { select: { name: true } },
      _count: { select: { seatAssignments: true } },
    },
    orderBy: [{ expiryDate: "asc" }, { name: "asc" }],
  })

  // assignedSeats is DERIVED from LicenseSeatAssignment rows (no drift); field
  // name preserved for the portal contract.
  const licenses = rows.map(({ _count, ...l }) => ({ ...l, assignedSeats: _count.seatAssignments }))

  return NextResponse.json({ ok: true, licenses })
}
