import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyPortalHmac } from "@/lib/bff-hmac"

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

  let payload: { clientId: string }
  try { payload = JSON.parse(rawBody) } catch { return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 }) }
  if (!payload.clientId) return NextResponse.json({ ok: false, error: "clientId required" }, { status: 400 })

  const licenses = await prisma.license.findMany({
    where: { clientId: payload.clientId, isActive: true },
    select: {
      id: true,
      name: true,
      vendor: true,
      seats: true,
      assignedSeats: true,
      expiryDate: true,
      renewalDate: true,
      billingTerm: true,
      status: true,
      person: { select: { name: true } },
    },
    orderBy: [{ expiryDate: "asc" }, { name: "asc" }],
  })

  return NextResponse.json({ ok: true, licenses })
}
