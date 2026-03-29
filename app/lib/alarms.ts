import { prisma } from "@/lib/prisma"
import { AlarmSeverity } from "@prisma/client"

/**
 * Create an alarm. Deduplicates by clientId + type — if an ACTIVE alarm of
 * the same type already exists for the client, it is left unchanged.
 * Never throws — safe to call from sync jobs and background checks.
 */
export async function createAlarm({
  clientId,
  severity,
  type,
  message,
  details,
}: {
  clientId: string
  severity: AlarmSeverity
  type: string
  message: string
  details?: string | null
}) {
  try {
    const existing = await prisma.alarm.findFirst({
      where: { clientId, type, status: "ACTIVE" },
    })
    if (existing) return existing

    return await prisma.alarm.create({
      data: { clientId, severity, type, message, details: details ?? null },
    })
  } catch (e) {
    console.error("createAlarm error:", String(e))
    return null
  }
}
