import { NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"

/**
 * Gate a cron route on Bearer CRON_SECRET. Returns a NextResponse to return on
 * failure, or null when authorized.
 *
 * Fails CLOSED when CRON_SECRET is unset (the old `Bearer ${undefined}` check
 * let `Authorization: Bearer undefined` through). Constant-time compare.
 */
export function requireCronSecret(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 })
  }
  const provided = req.headers.get("authorization") ?? ""
  const expected = `Bearer ${secret}`
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return null
}
