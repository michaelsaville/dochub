import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"
import { writeAudit } from "@/lib/audit-log"
import { runFullExport, normalizeSecretsMode } from "@/lib/full-export"

export const dynamic = "force-dynamic"

// Full relational export — SINGLE CLIENT (migration-out for a departing client).
// ADMIN-gated + scopeAllows on the target client (forward-compatible if the
// gate is ever lowered to a scoped TECH). Returns a 48h download token.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireAuth("ADMIN")
  if (error) return error

  const { id } = await params
  const client = await prisma.client.findUnique({ where: { id }, select: { id: true, name: true } })
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 })
  if (!scopeAllows(await getClientScope(), id)) {
    return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const secretsMode = normalizeSecretsMode(body?.secretsMode)
  const actorId = (session?.user as { id?: string })?.id ?? null
  const actorLabel = session?.user?.name ?? session?.user?.email ?? "unknown"

  try {
    const result = await runFullExport({ scope: "client", clientId: id, secretsMode, generatedBy: actorLabel })

    await writeAudit({
      action: "export.full",
      actorType: "STAFF",
      actorId,
      actorLabel,
      entityType: "client",
      entityId: id,
      clientId: id,
      summary:
        `Full export of client "${client.name}" (${secretsMode})` +
        (secretsMode === "decrypted" ? " — SECRETS DECRYPTED" : ""),
      metadata: {
        scope: "client",
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
    console.error("[export.full] client export failed", e)
    return NextResponse.json({ error: "Export failed" }, { status: 500 })
  }
}
