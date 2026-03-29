import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function GET() {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const soon = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    const [clients, assets, alarms, licensesExpiring] = await Promise.all([
      prisma.client.count({ where: { isActive: true } }),
      prisma.asset.count({ where: { status: "ACTIVE" } }),
      prisma.alarm.count({ where: { status: "ACTIVE" } }),
      prisma.license.count({ where: { isActive: true, expiryDate: { lte: soon, gte: new Date() } } }),
    ])
    return NextResponse.json({ clients, assets, alarms, licensesExpiring })
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 })
  }
}
