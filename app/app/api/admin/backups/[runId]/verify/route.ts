import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { writeAudit } from "@/lib/audit-log"
import { verifyBackup } from "@/lib/backup/engine"
import { runToDto } from "@/lib/backup/dto"

export const dynamic = "force-dynamic"

/**
 * POST /api/admin/backups/[runId]/verify — re-read the artifact and confirm its
 * sha256 checksum + GCM/gzip integrity; writes verifiedAt/verifyStatus. ADMIN.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { session, error } = await requireAuth("ADMIN")
  if (error) return error

  const { runId } = await params
  let run
  try {
    run = await verifyBackup(runId)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 404 })
  }

  await writeAudit({
    action: "platform_backup.verify",
    actorType: "STAFF",
    actorId: (session?.user as { id?: string })?.id ?? null,
    actorLabel: session?.user?.name ?? session?.user?.email ?? "admin",
    entityType: "platformBackupRun",
    entityId: run.id,
    clientId: run.clientId,
    summary: `Verified backup — ${run.verifyStatus}`,
    metadata: { verifyStatus: run.verifyStatus },
    ip: req.headers.get("x-forwarded-for"),
    userAgent: req.headers.get("user-agent"),
  })

  return NextResponse.json({ run: runToDto(run) })
}
