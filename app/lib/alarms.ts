import { prisma } from "@/lib/prisma"
import { AlarmSeverity } from "@prisma/client"
import { postAlarmToTeams } from "@/lib/teams"
import { sendPush } from "@/lib/push"

function pushPriority(s: AlarmSeverity): "low" | "normal" | "high" | "critical" {
  if (s === "CRITICAL") return "critical"
  if (s === "WARNING") return "high"
  return "normal"
}

/**
 * Create an alarm. Deduplicates by clientId + type — if an ACTIVE alarm of
 * the same type already exists for the client, it is left unchanged.
 * Never throws — safe to call from sync jobs and background checks.
 *
 * On a NEWLY-created active alarm it fans out to Teams + push, so the
 * time-critical machine events (site down, backup failure, verify overdue)
 * actually reach someone instead of only landing in a DB row.
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

    const alarm = await prisma.alarm.create({
      data: { clientId, severity, type, message, details: details ?? null },
      include: { client: { select: { name: true } } },
    })

    // Notify (best-effort, deduped above so we only fire once per active alarm).
    try {
      await Promise.allSettled([
        postAlarmToTeams({ severity, type, message, clientName: alarm.client.name, alarmId: alarm.id }),
        sendPush({ title: `${severity}: ${type}`, message: `${alarm.client.name} — ${message}`, priority: pushPriority(severity) }),
      ])
    } catch (e) {
      console.error("createAlarm notify error:", String(e))
    }

    return alarm
  } catch (e) {
    console.error("createAlarm error:", String(e))
    return null
  }
}
