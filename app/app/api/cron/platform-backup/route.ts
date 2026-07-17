import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireCronSecret } from "@/lib/cron-auth"
import { writeAudit } from "@/lib/audit-log"
import { runBackup } from "@/lib/backup/engine"
import { backupKeyConfigured } from "@/lib/backup/crypto-stream"
import { computeNextRunAt, isDue } from "@/lib/backup/schedule"
import { runToDto } from "@/lib/backup/dto"

export const dynamic = "force-dynamic"

/**
 * GET /api/cron/platform-backup — poll target for the host crontab. Fails closed
 * on a missing CRON_SECRET. Self-gates on schedule.enabled + nextRunAt, so a
 * frequent poll (e.g. every 15 min) still produces at most one run per cadence.
 */
export async function GET(req: Request) {
  const denied = requireCronSecret(req)
  if (denied) return denied

  const schedule = await prisma.platformBackupSchedule.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  })

  const now = new Date()
  if (!isDue(schedule.enabled, schedule.nextRunAt, now)) {
    return NextResponse.json({ ran: false, reason: schedule.enabled ? "not_due" : "disabled", nextRunAt: schedule.nextRunAt })
  }

  if (!backupKeyConfigured()) {
    return NextResponse.json({ ran: false, reason: "no_backup_key" }, { status: 503 })
  }

  // Advance nextRunAt BEFORE running so overlapping polls don't double-fire.
  const nextRunAt = computeNextRunAt(
    { enabled: schedule.enabled, frequency: schedule.frequency, hourUtc: schedule.hourUtc, weekday: schedule.weekday },
    now,
  )
  await prisma.platformBackupSchedule.update({
    where: { id: "default" },
    data: { lastRunAt: now, nextRunAt },
  })

  const run = await runBackup({
    scope: "tenant",
    secretsMode: schedule.secretsMode === "decrypted" ? "decrypted" : "ciphertext",
    includeUploads: schedule.includeUploads,
    kind: "scheduled",
    triggeredBy: "cron",
  })

  await writeAudit({
    action: "platform_backup.scheduled_run",
    actorType: "SYSTEM",
    actorLabel: "cron",
    entityType: "platformBackupRun",
    entityId: run.id,
    summary: `Scheduled backup ${run.status}`,
    metadata: { status: run.status, secretsMode: run.secretsMode, sizeBytes: run.sizeBytes == null ? null : Number(run.sizeBytes) },
  })

  return NextResponse.json({ ran: true, run: runToDto(run), nextRunAt })
}
