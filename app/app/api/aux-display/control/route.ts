import { NextResponse } from "next/server"
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
 * Body: { url: string (relative path), label?: string, fromRole?: AuxRole }
 */
export async function POST(req: Request) {
  const { session, error } = await requireAuth()
  if (error) return error

  const email = session?.user?.email
  if (!email) return NextResponse.json({ ok: false, error: "no email on session" }, { status: 400 })

  let body: { url?: string; label?: string | null; fromRole?: string }
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

  const event: AuxEvent = {
    type: "navigate",
    target,
    url,
    label: body.label ?? null,
    clientName: null,
    ticketNumber: null,
    source: "cast",
    ts: Date.now(),
  }

  const delivered = publish(email, event)
  return NextResponse.json({ ok: true, delivered, target })
}
