import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { createAlarm } from "@/lib/alarms"

// Raise alarms for assets with warranty expiring within 90 days or already expired
export async function POST(req: Request) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const now = new Date()
    const in90 = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)

    const assets = await prisma.asset.findMany({
      where: {
        status: "ACTIVE",
        warrantyExpiry: { not: null },
      },
      include: { location: { select: { clientId: true } } },
    })

    let raised = 0
    let skipped = 0

    for (const asset of assets) {
      const expiry = asset.warrantyExpiry!
      const clientId = asset.location.clientId

      if (expiry < now) {
        const result = await createAlarm({
          clientId,
          severity: "WARNING",
          type: `WARRANTY_EXPIRED:${asset.id}`,
          message: `Warranty expired: ${asset.name}`,
          details: `Warranty expired on ${expiry.toLocaleDateString()}`,
        })
        result ? raised++ : skipped++
      } else if (expiry < in90) {
        const result = await createAlarm({
          clientId,
          severity: "INFO",
          type: `WARRANTY_EXPIRING:${asset.id}`,
          message: `Warranty expiring soon: ${asset.name}`,
          details: `Expires on ${expiry.toLocaleDateString()}`,
        })
        result ? raised++ : skipped++
      }
    }

    return NextResponse.json({ raised, skipped })
  } catch (e) {
    return NextResponse.json({ error: "Warranty check failed" }, { status: 500 })
  }
}
