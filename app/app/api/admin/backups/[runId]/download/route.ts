import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { writeAudit } from "@/lib/audit-log"
import { createReadStream } from "fs"
import { stat } from "fs/promises"
import { Readable } from "stream"
import path from "path"

export const dynamic = "force-dynamic"

/**
 * GET /api/admin/backups/[runId]/download — stream the ENCRYPTED `.dhb` artifact
 * as an attachment. The bytes are AES-256-GCM-encrypted under BACKUP_ENCRYPTION_KEY
 * and are never decrypted here — decryption is the offline restore CLI's job.
 * Crown-jewel access, so every download is audited. ADMIN.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { session, error } = await requireAuth("ADMIN")
  if (error) return error

  const { runId } = await params
  const run = await prisma.platformBackupRun.findUnique({ where: { id: runId } })
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!run.storagePath) return NextResponse.json({ error: "No artifact on this run" }, { status: 404 })

  let size: number
  try {
    size = (await stat(run.storagePath)).size
  } catch {
    return NextResponse.json({ error: "Backup file missing on disk" }, { status: 410 })
  }

  await writeAudit({
    action: "platform_backup.download",
    actorType: "STAFF",
    actorId: (session?.user as { id?: string })?.id ?? null,
    actorLabel: session?.user?.name ?? session?.user?.email ?? "admin",
    entityType: "platformBackupRun",
    entityId: run.id,
    clientId: run.clientId,
    summary: `Downloaded encrypted backup ${path.basename(run.storagePath)}`,
    metadata: { secretsMode: run.secretsMode, sizeBytes: size },
    ip: req.headers.get("x-forwarded-for"),
    userAgent: req.headers.get("user-agent"),
  })

  const fileName = path.basename(run.storagePath)
  const stream = Readable.toWeb(createReadStream(run.storagePath)) as ReadableStream

  return new Response(stream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Length": String(size),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
