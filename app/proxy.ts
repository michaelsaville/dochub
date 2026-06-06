import { getToken } from "next-auth/jwt"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // ── Portal routes — fully retired in Phase 8 of the portal merge ────────
  // The customer-facing portal moved to portal.pcc2k.com. Anything that
  // still hits /portal/* or /api/portal/* gets bounced to the merged portal.
  // BFF routes (/api/bff/*) handled separately below.
  if (pathname.startsWith("/portal") || pathname.startsWith("/api/portal/")) {
    return NextResponse.redirect("https://portal.pcc2k.com/")
  }

  // ── Staff routes ─────────────────────────────────────────────────────────

  // Always allow auth routes and login page
  if (pathname.startsWith("/api/auth") || pathname === "/login") {
    return NextResponse.next()
  }

  // Allow cron, sync, webhook, public share, BFF, and AI proxy
  // endpoints — authenticated via bearer token, HMAC, or public access
  if (
    pathname.startsWith("/api/cron/") ||
    pathname.startsWith("/api/sync/") ||
    pathname.startsWith("/api/integrations/") ||
    pathname.startsWith("/api/webhooks/") ||
    pathname.startsWith("/api/notes/") ||
    pathname.startsWith("/api/share/") ||
    pathname.startsWith("/api/v1/") ||
    pathname.startsWith("/api/scout/") ||
    pathname.startsWith("/api/bff/") ||
    pathname.startsWith("/api/aux-display/emit") ||
    pathname.startsWith("/api/ai/")
  ) {
    return NextResponse.next()
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })

  // Unauthenticated — redirect to login. Use a RELATIVE callbackUrl (path +
  // query) rather than req.url: req.url reflects the container's internal
  // 0.0.0.0:3000 bind address, so an absolute callbackUrl would point the user
  // at an unreachable origin after login (and NextAuth would discard it,
  // dropping them on the homepage instead of their intended page).
  if (!token) {
    const loginUrl = new URL("/login", req.url)
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname + req.nextUrl.search)
    return NextResponse.redirect(loginUrl)
  }

  // CLIENT role — only allowed in /portal
  if (token.role === "CLIENT" && !pathname.startsWith("/portal")) {
    return NextResponse.redirect(new URL("/portal", req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
