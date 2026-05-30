import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createAlarm } from "@/lib/alarms"
import { requireCronSecret } from "@/lib/cron-auth"

export async function GET(req: Request) {
  const denied = requireCronSecret(req)
  if (denied) return denied

  const now = new Date()

  // Find backup configs with overdue verification
  const overdue = await prisma.backupConfig.findMany({
    where: {
      status: "active",
      nextVerifyBy: { lt: now },
    },
    include: {
      client: { select: { id: true, name: true } },
    },
  })

  let alarms = 0
  for (const config of overdue) {
    const daysPast = Math.ceil((now.getTime() - config.nextVerifyBy!.getTime()) / 86400000)
    await createAlarm({
      clientId: config.client.id,
      severity: daysPast > 7 ? "CRITICAL" : "WARNING",
      type: `Backup Verification Overdue`,
      message: `Backup "${config.name}" verification is ${daysPast} day${daysPast === 1 ? "" : "s"} overdue for ${config.client.name}`,
    })
    alarms++
  }

  return NextResponse.json({ success: true, overdue: overdue.length, alarms })
}
