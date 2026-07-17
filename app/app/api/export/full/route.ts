import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { writeAudit } from "@/lib/audit-log"
import { runFullExport, normalizeSecretsMode } from "@/lib/full-export"

export const dynamic = "force-dynamic"

// Full relational export — WHOLE TENANT. ADMIN-only. Extends (never replaces)
// the redacted CSV export at /api/export/[entity]. Returns a 48h download token.
export async function POST(req: Request) {
  const { session, error } = await requireAuth("ADMIN")
  if (error) return error

  const body = await req.json().catch(() => ({}))
  const secretsMode = normalizeSecretsMode(body?.secretsMode)
  const actorId = (session?.user as { id?: string })?.id ?? null
  const actorLabel = session?.user?.name ?? session?.user?.email ?? "unknown"

  try {
    const result = await runFullExport({ scope: "tenant", secretsMode, generatedBy: actorLabel })

    await writeAudit({
      action: "export.full",
      actorType: "STAFF",
      actorId,
      actorLabel,
      entityType: "tenant",
      summary:
        `Full tenant export (${secretsMode})` +
        (secretsMode === "decrypted" ? " — SECRETS DECRYPTED" : ""),
      metadata: {
        scope: "tenant",
        secretsMode,
        filename: result.filename,
        sizeBytes: result.sizeBytes,
        counts: result.counts,
      },
      ip: req.headers.get("x-forwarded-for"),
      userAgent: req.headers.get("user-agent"),
    })

    return NextResponse.json({
      token: result.token,
      downloadUrl: `/api/export/full/download/${result.token}`,
      filename: result.filename,
      sizeBytes: result.sizeBytes,
      expiresAt: result.expiresAt,
      counts: result.counts,
    })
  } catch (e) {
    console.error("[export.full] tenant export failed", e)
    return NextResponse.json({ error: "Export failed" }, { status: 500 })
  }
}
