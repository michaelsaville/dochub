import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { hashPassword } from "@/lib/portal-auth"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const { password } = await req.json()
    if (!password || password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })
    }
    const passwordHash = await hashPassword(password)
    await prisma.portalUser.update({ where: { id }, data: { passwordHash } })
    // Invalidate all existing sessions on password reset
    await prisma.portalSession.deleteMany({ where: { portalUserId: id } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
