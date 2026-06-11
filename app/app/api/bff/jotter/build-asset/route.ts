import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyPortalHmac } from "@/lib/bff-hmac"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const CATEGORIES = [
  "NETWORK_GEAR", "WIRELESS", "SERVER", "NAS", "COMPUTER", "LAPTOP", "TABLET",
  "PRINTER", "PHONE_SYSTEM", "PHONE_ENDPOINT", "WEBSITE", "VPN", "OTHER",
] as const

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)

/**
 * POST /api/bff/jotter/build-asset  (HMAC-signed, cross-app)
 *
 * Lands a confirmed Jotter note as a DocHub asset (dataSource=JOTTER) under the
 * caller-chosen client/location. The Jotter user already confirmed the note;
 * here it becomes a real, editable asset surfaced in the client's Assets tab for
 * review. Signed with JOTTER_BFF_SECRET.
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

  let p: Record<string, unknown>
  try {
    p = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 })
  }

  const clientId = str(p.clientId)
  const locationId = str(p.locationId)
  const name = str(p.name)
  if (!clientId || !locationId || !name) {
    return NextResponse.json({ ok: false, error: "clientId, locationId, name required" }, { status: 400 })
  }

  // Location must belong to the named client (defence against a forged pairing).
  const location = await prisma.location.findFirst({ where: { id: locationId, clientId } })
  if (!location) {
    return NextResponse.json({ ok: false, error: "location not found for client" }, { status: 404 })
  }

  const category = CATEGORIES.includes(p.category as (typeof CATEGORIES)[number])
    ? (p.category as (typeof CATEGORIES)[number])
    : "OTHER"

  const asset = await prisma.asset.create({
    data: {
      locationId,
      name: name.slice(0, 200),
      category,
      make: str(p.make),
      model: str(p.model),
      serial: str(p.serial),
      ipAddress: str(p.ipAddress),
      macAddress: str(p.macAddress),
      vlan: str(p.vlan),
      switchPort: str(p.switchPort),
      os: str(p.os),
      notes: str(p.notes),
      dataSource: "JOTTER",
    },
    select: { id: true },
  })

  const base = process.env.NEXTAUTH_URL ?? "https://dochub.pcc2k.com"
  return NextResponse.json({ ok: true, assetId: asset.id, url: `${base}/clients/${clientId}` })
}
