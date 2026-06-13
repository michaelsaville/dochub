import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-options"

// Hands the kiosk launcher URL to authenticated staff on the aux-display page.
//
// IMPORTANT: this lives under /api/aux-display/ (SSO-gated) — NOT under
// /api/kiosk/* (which proxy.ts intentionally exempts from SSO). Only a
// logged-in non-CLIENT session can read KIOSK_TOKEN here. Returns a RELATIVE
// path; the client builds the absolute URL from window.location.origin
// because req.url is the container's internal 0.0.0.0:3000 bind behind nginx.
export const dynamic = "force-dynamic"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (session.user?.role === "CLIENT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const token = process.env.KIOSK_TOKEN
  if (!token) {
    return NextResponse.json({ configured: false })
  }

  return NextResponse.json({
    configured: true,
    path: `/kiosk?token=${encodeURIComponent(token)}`,
  })
}
