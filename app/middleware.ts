import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const PORTAL_COOKIE = "portal_session"

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (pathname.startsWith("/portal")) {
    // Always allow login page and portal auth API
    if (
      pathname === "/portal/login" ||
      pathname.startsWith("/api/portal/auth/")
    ) {
      return NextResponse.next()
    }

    // Require portal session cookie (full DB validation happens in API routes / page fetches)
    const token = req.cookies.get(PORTAL_COOKIE)?.value
    if (!token) {
      return NextResponse.redirect(new URL("/portal/login", req.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/portal/:path*", "/api/portal/:path*"],
}
