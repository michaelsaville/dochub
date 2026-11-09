import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { getClientScope } from "@/lib/client-scope"
import { getExpiryItems } from "@/lib/expiry-feed"

export async function GET() {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const now = new Date()
    const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    const scope = await getClientScope()
    const [clients, assets, alarms, licensesExpiring, expiringSoon] = await Promise.all([
      prisma.client.count({ where: { isActive: true } }),
      prisma.asset.count({ where: { status: "ACTIVE" } }),
      prisma.alarm.count({ where: { status: "ACTIVE" } }),
      prisma.license.count({
        where: { isActive: true, OR: [{ expiryDate: { lte: soon, gte: now } }, { renewalDate: { lte: soon, gte: now } }] },
      }),
      // Everything with a hard expiry (SSL, domain, warranty, license, contract,
      // credential, VPN cert, circuit) expiring in the next 30 days.
      getExpiryItems({ scope, from: now, to: soon }).then(items => items.length),
    ])
    return NextResponse.json({ clients, assets, alarms, licensesExpiring, expiringSoon })
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 })
  }
}
