import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyPortalHmac } from "@/lib/bff-hmac"
import { publish, type AuxEvent } from "@/lib/aux-display-hub"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/aux-display/emit  (HMAC-signed, cross-app)
 *
 * TicketHub calls this when a tech opens a ticket. We resolve the ticket's
 * client/site to a DocHub page and push a navigate event to that user's
 * paired iPad(s). Signed with AUX_BFF_SECRET (falls back to the shared
 * PORTAL_BFF_SECRET) using the same canonical scheme as the portal BFF.
 *
 * Body: {
 *   staffEmail: string,            // who is working — the room key
 *   dochubLocationId?: string,     // TH_Site.dochubLocationId, when linked
 *   clientName?: string,           // fallback resolution by name
 *   ticketNumber?: number,
 *   source?: string,               // e.g. "tickethub"
 * }
 */
export async function POST(req: Request) {
  const rawBody = await req.text()
  const secret = process.env.AUX_BFF_SECRET || process.env.PORTAL_BFF_SECRET || ""
  const verify = verifyPortalHmac(
    rawBody,
    req.headers.get("x-portal-signature"),
    req.headers.get("x-portal-timestamp"),
    secret,
  )
  if (!verify.ok) return NextResponse.json({ ok: false, error: verify.reason }, { status: verify.status })

  let body: {
    staffEmail?: string
    dochubLocationId?: string | null
    clientName?: string | null
    ticketNumber?: number | null
    source?: string | null
  }
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 })
  }

  const email = (body.staffEmail ?? "").trim().toLowerCase()
  if (!email) return NextResponse.json({ ok: false, error: "staffEmail required" }, { status: 400 })

  const source = body.source ?? "tickethub"
  const ticketNumber = typeof body.ticketNumber === "number" ? body.ticketNumber : null

  // Resolve the best DocHub target. Prefer the explicit location FK that
  // TicketHub maintains (TH_Site.dochubLocationId === DocHub Location.id),
  // then fall back to a case-insensitive client-name match.
  let url: string | null = null
  let label: string | null = body.clientName ?? null

  if (body.dochubLocationId) {
    const loc = await prisma.location.findUnique({
      where: { id: body.dochubLocationId },
      include: { client: { select: { name: true } } },
    })
    if (loc) {
      url = `/locations/${loc.id}`
      label = loc.client?.name ?? loc.name ?? label
    }
  }

  if (!url && body.clientName) {
    const client = await prisma.client.findFirst({
      where: { name: { equals: body.clientName, mode: "insensitive" } },
      select: { id: true, name: true },
    })
    if (client) {
      url = `/clients/${client.id}`
      label = client.name
    }
  }

  const event: AuxEvent = url
    ? { type: "navigate", url, label, clientName: body.clientName ?? null, ticketNumber, source, ts: Date.now() }
    : { type: "notfound", url: null, label: null, clientName: body.clientName ?? null, ticketNumber, source, ts: Date.now() }

  const delivered = publish(email, event)

  return NextResponse.json({ ok: true, matched: !!url, delivered, url })
}
