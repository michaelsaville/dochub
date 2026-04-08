import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyPassword, createSession, sessionCookieOptions } from "@/lib/portal-auth"

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json()
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 })
    }

    const user = await prisma.portalUser.findUnique({ where: { email: email.toLowerCase().trim() } })
    if (!user || !user.isActive || !user.passwordHash) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })
    }

    const valid = await verifyPassword(password, user.passwordHash)
    if (!valid) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })
    }

    await prisma.portalUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })

    const token = await createSession(user.id)
    const res = NextResponse.json({ success: true })
    res.cookies.set(sessionCookieOptions(token))
    return res
  } catch {
    return NextResponse.json({ error: "Login failed" }, { status: 500 })
  }
}
