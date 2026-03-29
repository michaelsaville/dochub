import { getToken } from "next-auth/jwt"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Always allow auth routes and login page
  if (pathname.startsWith("/api/auth") || pathname === "/login") {
    return NextResponse.next()
  }

  // Allow the cron endpoint — authenticated via CRON_SECRET bearer token, not session
  if (pathname === "/api/cron/sync") {
    return NextResponse.next()
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })

  // Unauthenticated — redirect to login
  if (!token) {
    const loginUrl = new URL("/login", req.url)
    loginUrl.searchParams.set("callbackUrl", req.url)
    return NextResponse.redirect(loginUrl)
  }

  // CLIENT role — only allowed in /portal (future feature)
  if (token.role === "CLIENT" && !pathname.startsWith("/portal")) {
    return NextResponse.redirect(new URL("/portal", req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
