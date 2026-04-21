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

  const domains = await prisma.website.findMany({
    where: { clientId: payload.clientId },
    select: {
      id: true,
      domain: true,
      label: true,
      registrar: true,
      expiresAt: true,
      sslExpiresAt: true,
      sslIssuer: true,
      autoRenew: true,
      isUp: true,
      uptimeEnabled: true,
    },
    orderBy: { domain: "asc" },
  })

  return NextResponse.json({ ok: true, domains })
}
