import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyPortalHmac } from "@/lib/bff-hmac"

export const dynamic = "force-dynamic"

interface AssetsPayload {
  clientId: string
}

export async function POST(req: Request) {
  const rawBody = await req.text()

  const verify = verifyPortalHmac(
    rawBody,
    req.headers.get("x-portal-signature"),
    req.headers.get("x-portal-timestamp"),
    process.env.PORTAL_BFF_SECRET ?? "",
  )
  if (!verify.ok) {
    return NextResponse.json({ ok: false, error: verify.reason }, { status: verify.status })
  }

  let payload: AssetsPayload
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 })
  }
  if (!payload.clientId) {
    return NextResponse.json({ ok: false, error: "clientId required" }, { status: 400 })
  }

  const assets = await prisma.asset.findMany({
    where: {
      location: { clientId: payload.clientId },
      status: { notIn: ["RETIRED", "DISPOSED"] },
    },
    select: {
      id: true,
      name: true,
      friendlyName: true,
      category: true,
      status: true,
      make: true,
      model: true,
      serial: true,
      assetTag: true,
      warrantyExpiry: true,
      room: true,
      location: { select: { id: true, name: true } },
    },
    orderBy: [{ location: { name: "asc" } }, { name: "asc" }],
  })

  return NextResponse.json({ ok: true, assets })
}
