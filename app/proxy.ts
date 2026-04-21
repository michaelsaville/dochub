import { getToken } from "next-auth/jwt"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const PORTAL_COOKIE = "portal_session"

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // ── Portal routes ────────────────────────────────────────────────────────
  if (pathname.startsWith("/portal") || pathname.startsWith("/api/portal/")) {
    // Always allow portal login page and portal auth API
    if (
      pathname === "/portal/login" ||
      pathname.startsWith("/api/portal/auth/")
    ) {
      return NextResponse.next()
    }
    // Require portal session cookie (full DB validation happens in API routes)
    const token = req.cookies.get(PORTAL_COOKIE)?.value
    if (!token) {
      return NextResponse.redirect(new URL("/portal/login", req.url))
    }
    return NextResponse.next()
  }

  // ── Staff routes ─────────────────────────────────────────────────────────

  // Always allow auth routes and login page
  if (pathname.startsWith("/api/auth") || pathname === "/login") {
    return NextResponse.next()
  }

  // Allow cron, sync, webhook, public share, and BFF endpoints — authenticated via bearer token, HMAC, or public access
  if (
    pathname.startsWith("/api/cron/") ||
    pathname.startsWith("/api/sync/") ||
    pathname.startsWith("/api/integrations/") ||
    pathname.startsWith("/api/webhooks/") ||
    pathname.startsWith("/api/notes/") ||
    pathname.startsWith("/api/share/") ||
    pathname.startsWith("/api/v1/") ||
    pathname.startsWith("/api/scout/") ||
    pathname.startsWith("/api/bff/")
  ) {
    return NextResponse.next()
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })

  // Unauthenticated — redirect to login
  if (!token) {
    const loginUrl = new URL("/login", req.url)
    loginUrl.searchParams.set("callbackUrl", req.url)
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
