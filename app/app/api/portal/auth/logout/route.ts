import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { PORTAL_COOKIE } from "@/lib/portal-auth"
import { cookies } from "next/headers"

export async function POST() {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(PORTAL_COOKIE)?.value
    if (token) {
      await prisma.portalSession.deleteMany({ where: { token } })
    }
    const res = NextResponse.json({ success: true })
    res.cookies.set({ name: PORTAL_COOKIE, value: "", maxAge: 0, path: "/" })
    return res
  } catch {
    return NextResponse.json({ error: "Logout failed" }, { status: 500 })
  }
}
