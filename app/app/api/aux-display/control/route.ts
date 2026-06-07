import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { publish, type AuxEvent, type AuxRole } from "@/lib/aux-display-hub"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/aux-display/control  (session-authenticated, same-origin)
 *
 * The reverse channel: a device "casts" its current view to the OTHER screen
 * in the same user's room. The iPad (fromRole "ipad") pushes to the desktop;
 * the desktop pushes to the iPad. No HMAC — the caller is a logged-in DocHub
 * session, and it can only ever address its own room (keyed by its email).
 *
 * Body: {
 *   url: string (relative path),   // the DocHub page to show on a DocHub tab
 *   label?: string,
 *   fromRole?: AuxRole,
 *   clientId?: string,             // DocHub client id — when set, ALSO opens
 *                                  // that customer in a TicketHub desktop tab
 * }
 *
 * A customer cast lands wherever the tech's desktop actually is: the DocHub
 * url drives a DocHub tab, and (if clientId resolves to a TicketHub client)
 * the same tap opens that customer in a TicketHub tab.
 */
export async function POST(req: Request) {
  const { session, error } = await requireAuth()
  if (error) return error

  const email = session?.user?.email
  if (!email) return NextResponse.json({ ok: false, error: "no email on session" }, { status: 400 })

  let body: { url?: string; label?: string | null; fromRole?: string; clientId?: string | null }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 })
  }

  // Only allow same-app relative navigation. Reject anything that could send
  // the other screen off-site (scheme, protocol-relative //host, etc.).
  const url = (body.url ?? "").trim()
  if (!url.startsWith("/") || url.startsWith("//")) {
    return NextResponse.json({ ok: false, error: "url must be a relative path" }, { status: 400 })
  }

  const fromRole: AuxRole = body.fromRole === "desktop" ? "desktop" : "ipad"
  const target: AuxRole = fromRole === "desktop" ? "ipad" : "desktop"
  const label = body.label ?? null

  // The DocHub-tab event.
  let delivered = publish(email, {
    type: "navigate",
    target,
    app: "dochub",
    url,
    label,
    clientName: null,
    ticketNumber: null,
    source: "cast",
    ts: Date.now(),
  })

  // Customer cast → also open that customer in a TicketHub desktop tab. Only
  // meaningful when casting TO the desktop (target "desktop").
  let tickethub: { matched: boolean; url: string | null } = { matched: false, url: null }
  if (body.clientId && target === "desktop") {
    const thUrl = await resolveTicketHubClientUrl(body.clientId)
    if (thUrl) {
      tickethub = { matched: true, url: thUrl }
      delivered += publish(email, {
        type: "navigate",
        target: "desktop",
        app: "tickethub",
        url: thUrl,
        label,
        clientName: null,
        ticketNumber: null,
        source: "cast",
        ts: Date.now(),
      })
    }
  }

  return NextResponse.json({ ok: true, delivered, target, tickethub })
}

/**
 * Map a DocHub client id to a TicketHub client-detail URL by case-insensitive
 * name match across the shared database's schemas. Returns null if there's no
 * matching TicketHub client.
 */
async function resolveTicketHubClientUrl(dochubClientId: string): Promise<string | null> {
  try {
    const client = await prisma.client.findUnique({
      where: { id: dochubClientId },
      select: { name: true },
    })
    if (!client?.name) return null
    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM tickethub.th_clients WHERE lower(name) = lower($1) LIMIT 1`,
      client.name,
    )
    if (!rows.length) return null
    return `/clients/${rows[0].id}`
  } catch {
    return null
  }
}
