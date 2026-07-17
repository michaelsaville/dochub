import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { writeAudit } from "@/lib/audit-log"
import { runBackup } from "@/lib/backup/engine"
import { backupKeyConfigured } from "@/lib/backup/crypto-stream"
import { runToDto, scheduleToDto } from "@/lib/backup/dto"

export const dynamic = "force-dynamic"

/** Read (and lazily create) the singleton schedule. */
async function getOrCreateSchedule() {
  return prisma.platformBackupSchedule.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  })
}

/**
 * GET /api/admin/backups — schedule singleton + recent run history. ADMIN.
 */
export async function GET() {
  const { error } = await requireAuth("ADMIN")
  if (error) return error

  const [schedule, runs] = await Promise.all([
    getOrCreateSchedule(),
    prisma.platformBackupRun.findMany({ orderBy: { startedAt: "desc" }, take: 50 }),
  ])

  return NextResponse.json({
    schedule: scheduleToDto(schedule),
    runs: runs.map(runToDto),
    keyConfigured: backupKeyConfigured(),
  })
}

/**
 * POST /api/admin/backups — trigger a manual backup now. ADMIN.
 * Body (all optional): { scope, clientId, secretsMode, includeUploads }.
 * Defaults fall back to the saved schedule. Runs to completion and returns the
 * finished run (fine for this tenant's dataset size). Audited.
 */
export async function POST(req: Request) {
  const { session, error } = await requireAuth("ADMIN")
  if (error) return error

  if (!backupKeyConfigured()) {
    return NextResponse.json({ error: "BACKUP_ENCRYPTION_KEY is not configured" }, { status: 503 })
  }

  const body = await req.json().catch(() => ({}))
  const schedule = await getOrCreateSchedule()

  const scope = body.scope === "client" ? "client" : "tenant"
  const clientId = scope === "client" ? (body.clientId ?? null) : null
  const secretsMode = body.secretsMode === "decrypted" ? "decrypted" : (schedule.secretsMode === "decrypted" ? "decrypted" : "ciphertext")
  const includeUploads = typeof body.includeUploads === "boolean" ? body.includeUploads : schedule.includeUploads

  if (scope === "client" && !clientId) {
    return NextResponse.json({ error: "clientId required for scope=client" }, { status: 400 })
  }

  const actorLabel = session?.user?.name ?? session?.user?.email ?? "admin"
  const actorId = (session?.user as { id?: string })?.id ?? null

  await writeAudit({
    action: "platform_backup.run",
    actorType: "STAFF",
    actorId,
    actorLabel,
    entityType: "platformBackup",
    clientId,
    summary: `Manual ${scope} backup triggered (${secretsMode}${includeUploads ? ", +uploads" : ""})`,
    metadata: { scope, secretsMode, includeUploads },
    ip: req.headers.get("x-forwarded-for"),
    userAgent: req.headers.get("user-agent"),
  })

  const run = await runBackup({
    scope,
    clientId,
    secretsMode,
    includeUploads,
    kind: "manual",
    triggeredBy: actorId ?? "admin",
  })

  return NextResponse.json({ run: runToDto(run) })
}
