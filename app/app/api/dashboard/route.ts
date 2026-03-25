import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    const [clients, assets] = await Promise.all([
      prisma.client.count({ where: { isActive: true } }),
      prisma.asset.count({ where: { status: "ACTIVE" } }),
    ])
    return NextResponse.json({ clients, assets, alarms: 0, licensesExpiring: 0 })
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 })
  }
}
