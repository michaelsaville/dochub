import { NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"

/**
 * Gate a read-only kiosk route on a shared KIOSK_TOKEN. Returns a NextResponse
 * to return on failure, or null when authorized.
 *
 * Accepts the token two ways so an unattended iPad wallboard can load a plain
 * URL (no SSO, no header-signing kiosk-browser needed):
 *   - Authorization: Bearer <token>   (preferred for API clients)
 *   - ?token=<token>                  (convenience for a kiosk URL)
 *
 * Fails CLOSED when KIOSK_TOKEN is unset. Constant-time compare. This token
 * only ever gates non-sensitive, aggregate, read-only data — never credentials,
 * passwords, or TOTP seeds (see app/api/kiosk/dashboard/route.ts).
 */
export function requireKioskToken(req: Request): NextResponse | null {
  const secret = process.env.KIOSK_TOKEN
  if (!secret) {
    return NextResponse.json({ error: "KIOSK_TOKEN not configured" }, { status: 503 })
  }

  const header = req.headers.get("authorization") ?? ""
  const fromHeader = header.startsWith("Bearer ") ? header.slice(7) : ""
  const fromQuery = new URL(req.url).searchParams.get("token") ?? ""
  const provided = fromHeader || fromQuery

  const a = Buffer.from(provided)
  const b = Buffer.from(secret)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return null
}
