import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { writeAudit } from "@/lib/audit-log"
import { encrypt } from "@/lib/crypto"
import { scheduleToDto } from "@/lib/backup/dto"
import { computeNextRunAt } from "@/lib/backup/schedule"

export const dynamic = "force-dynamic"

const clampInt = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = Math.trunc(Number(v))
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt
}

/**
 * PATCH /api/admin/backups/schedule — update the singleton schedule. ADMIN.
 * Recomputes nextRunAt from the new cadence. The S3 secret is accepted in
 * plaintext and stored encrypted (lib/crypto ENCRYPTION_KEY); it is never
 * returned. Audited.
 */
export async function PATCH(req: Request) {
  const { session, error } = await requireAuth("ADMIN")
  if (error) return error

  const body = await req.json().catch(() => ({}))
  const current = await prisma.platformBackupSchedule.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  })

  const data: Record<string, unknown> = {}

  if (typeof body.enabled === "boolean") data.enabled = body.enabled
  if (body.frequency === "daily" || body.frequency === "weekly") data.frequency = body.frequency
  if (body.hourUtc !== undefined) data.hourUtc = clampInt(body.hourUtc, 0, 23, current.hourUtc)
  if (body.weekday !== undefined) data.weekday = body.weekday === null ? null : clampInt(body.weekday, 0, 6, 0)
  if (body.retentionCount !== undefined) data.retentionCount = clampInt(body.retentionCount, 1, 3650, current.retentionCount)
  if (body.maxAgeDays !== undefined) data.maxAgeDays = body.maxAgeDays === null ? null : clampInt(body.maxAgeDays, 1, 3650, 90)
  if (typeof body.includeUploads === "boolean") data.includeUploads = body.includeUploads
  if (body.secretsMode === "ciphertext" || body.secretsMode === "decrypted") data.secretsMode = body.secretsMode
  if (body.target === "local" || body.target === "s3") data.target = body.target
  if (body.s3Bucket !== undefined) data.s3Bucket = body.s3Bucket || null
  if (body.s3Prefix !== undefined) data.s3Prefix = body.s3Prefix || null
  if (body.s3Endpoint !== undefined) data.s3Endpoint = body.s3Endpoint || null
  if (body.s3AccessKey !== undefined) data.s3AccessKey = body.s3AccessKey || null
  // secret in plaintext -> encrypt at rest; empty string clears it
  if (body.s3SecretKey !== undefined) {
    data.s3SecretKeyEnc = body.s3SecretKey ? encrypt(String(body.s3SecretKey)) : null
  }

  // Recompute the next fire time from the effective cadence.
  const effEnabled = (data.enabled ?? current.enabled) as boolean
  const effFrequency = (data.frequency ?? current.frequency) as string
  const effHour = (data.hourUtc ?? current.hourUtc) as number
  const effWeekday = (data.weekday !== undefined ? data.weekday : current.weekday) as number | null
  data.nextRunAt = computeNextRunAt({ enabled: effEnabled, frequency: effFrequency, hourUtc: effHour, weekday: effWeekday })

  const updated = await prisma.platformBackupSchedule.update({ where: { id: "default" }, data })

  await writeAudit({
    action: "platform_backup.schedule_update",
    actorType: "STAFF",
    actorId: (session?.user as { id?: string })?.id ?? null,
    actorLabel: session?.user?.name ?? session?.user?.email ?? "admin",
    entityType: "platformBackupSchedule",
    entityId: "default",
    summary: `Backup schedule updated (${effEnabled ? effFrequency : "disabled"})`,
    metadata: { enabled: effEnabled, frequency: effFrequency, hourUtc: effHour, secretsMode: updated.secretsMode, target: updated.target },
    ip: req.headers.get("x-forwarded-for"),
    userAgent: req.headers.get("user-agent"),
  })

  return NextResponse.json({ schedule: scheduleToDto(updated) })
}
