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
 * Create an alarm. Deduplicates by clientId + type (optionally narrowed by
 * dedupeKey) — if a matching ACTIVE alarm already exists it is left unchanged.
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
  dedupeKey,
}: {
  clientId: string
  severity: AlarmSeverity
  type: string
  message: string
  details?: string | null
  /**
   * Optional per-subject discriminator. Without it, one ACTIVE {clientId,type}
   * alarm suppresses every other of that type — which silently dropped a second
   * concurrent "Site Down" for the same client (B29). Callers with many
   * independent subjects (one per domain) pass a key so each dedups on its own;
   * it's matched against the alarm `message` to mirror the per-domain resolve.
   */
  dedupeKey?: string
}) {
  try {
    const existing = await prisma.alarm.findFirst({
      where: {
        clientId,
        type,
        status: "ACTIVE",
        ...(dedupeKey ? { message: { contains: dedupeKey } } : {}),
      },
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
