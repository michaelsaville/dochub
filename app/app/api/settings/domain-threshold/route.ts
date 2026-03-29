import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-options"
import { prisma } from "@/lib/prisma"

const KEY = "domain_expiry_threshold_days"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const setting = await prisma.appSetting.findUnique({ where: { key: KEY } })
  return NextResponse.json({ days: parseInt(setting?.value ?? "30") })
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { days } = await req.json()
  const value = Math.max(1, Math.min(365, parseInt(days) || 30)).toString()
  const setting = await prisma.appSetting.upsert({
    where: { key: KEY },
    update: { value, updatedAt: new Date() },
    create: { key: KEY, value },
  })
  return NextResponse.json({ days: parseInt(setting.value) })
}
