import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createAlarm } from "@/lib/alarms"
import { requireCronSecret } from "@/lib/cron-auth"
import { stat } from "fs/promises"
import path from "path"

const UPLOAD_DIR = "/uploads"

/**
 * Called by cron: GET /api/cron/uploads-integrity (Bearer CRON_SECRET).
 *
 * The /uploads volume lives OUTSIDE the Postgres dump, so a volume loss
 * would leave every ClientAttachment row pointing at a missing file (the
 * serve route 404s). This walks current files and flags any whose bytes
 * are gone, raising one summary alarm so it can't go unnoticed.
 */
export async function GET(req: Request) {
  const denied = requireCronSecret(req)
  if (denied) return denied

  const atts = await prisma.clientAttachment.findMany({
    where: { supersededBy: null },
    select: { id: true, storageName: true, originalName: true, clientId: true },
  })

  const missing: { id: string; originalName: string; clientId: string }[] = []
  for (const a of atts) {
    try {
      await stat(path.join(UPLOAD_DIR, a.storageName))
    } catch {
      missing.push({ id: a.id, originalName: a.originalName, clientId: a.clientId })
    }
  }

  if (missing.length > 0) {
    // Group by client for clearer alarms; cap the sample in the message.
    const byClient = new Map<string, number>()
    for (const m of missing) byClient.set(m.clientId, (byClient.get(m.clientId) ?? 0) + 1)
    const sample = missing.slice(0, 5).map((m) => m.originalName).join(", ")
    await createAlarm({
      clientId: missing[0].clientId,
      severity: "CRITICAL",
      type: "Attachment files missing on disk",
      message: `${missing.length} file(s) across ${byClient.size} client(s) have a database row but no file on the /uploads volume (e.g. ${sample}). Restore the uploads backup.`,
    })
  }

  return NextResponse.json({ success: true, checked: atts.length, missing: missing.length })
}
