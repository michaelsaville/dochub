import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"
import { writeAudit } from "@/lib/audit-log"

/**
 * Mark a credential as rotated out-of-band. Stamps lastRotated=now (the rotation
 * baseline consumed by lib/rotation.ts) and clears any active snooze, so the
 * reminder is satisfied even when no automation (Graph) rotated it. Mirrors the
 * FieldHistory row the Graph rotate route writes and audits the action.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const cred = await prisma.credential.findUnique({ where: { id } })
    if (!cred) return NextResponse.json({ error: "Not found" }, { status: 404 })

    // RBAC: a scoped tech cannot mark-rotate a credential outside their clients.
    if (!scopeAllows(await getClientScope(), cred.clientId)) {
      return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })
    }

    const changedBy = session?.user?.name ?? "unknown"
    const updated = await prisma.credential.update({
      where: { id },
      data: { lastRotated: new Date(), rotationSnoozedUntil: null },
    })

    await prisma.fieldHistory.create({
      data: {
        entityType: "credential",
        entityId: id,
        field: "rotation",
        oldValue: null,
        newValue: null,
        changedBy,
      },
    }).catch(() => {})

    await writeAudit({
      action: "credential.rotated",
      actorType: "STAFF",
      actorId: (session?.user as { id?: string })?.id ?? null,
      actorLabel: changedBy,
      entityType: "credential",
      entityId: id,
      clientId: cred.clientId,
      summary: `Marked credential "${cred.label}" rotated`,
      metadata: { manual: true },
      ip: req.headers.get("x-forwarded-for"),
      userAgent: req.headers.get("user-agent"),
    })

    return NextResponse.json({
      ...updated,
      encryptedPassword: undefined,
      encryptedTotp: undefined,
      encryptedNotes: undefined,
      hasPassword: !!updated.encryptedPassword,
      hasTotp: !!updated.encryptedTotp,
      hasSecureNotes: !!updated.encryptedNotes,
    })
  } catch (e) {
    return NextResponse.json({ error: "Failed to mark rotated" }, { status: 500 })
  }
}
