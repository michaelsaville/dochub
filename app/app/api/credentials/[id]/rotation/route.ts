import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"

/**
 * Rotation-policy quick-branches for a credential:
 *   { exempt?: boolean }        — ADMIN-gated (like allowTechReveal). Excludes
 *                                 the cred from the rotation reminder entirely.
 *   { intervalDays?: number|null } — per-credential override (clamped 1–365);
 *                                    null clears it (falls back to the global default).
 *   { snoozeDays?: number|null }   — suppress the reminder for N days; 0/null clears.
 * Returns the lite credential so the card can update in place.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const body = await req.json().catch(() => ({}))

    const cred = await prisma.credential.findUnique({ where: { id } })
    if (!cred) return NextResponse.json({ error: "Not found" }, { status: 404 })

    if (!scopeAllows(await getClientScope(), cred.clientId)) {
      return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })
    }

    const data: {
      rotationExempt?: boolean
      rotationIntervalDays?: number | null
      rotationSnoozedUntil?: Date | null
    } = {}

    if (body.exempt !== undefined) {
      if (session?.user?.role !== "ADMIN") {
        return NextResponse.json({ error: "Admin role required" }, { status: 403 })
      }
      data.rotationExempt = !!body.exempt
    }

    if (body.intervalDays !== undefined) {
      if (body.intervalDays === null || body.intervalDays === "") {
        data.rotationIntervalDays = null
      } else {
        const n = Math.round(Number(body.intervalDays))
        if (!Number.isFinite(n)) {
          return NextResponse.json({ error: "intervalDays must be a number" }, { status: 400 })
        }
        data.rotationIntervalDays = Math.min(365, Math.max(1, n))
      }
    }

    if (body.snoozeDays !== undefined) {
      const n = Number(body.snoozeDays)
      data.rotationSnoozedUntil =
        Number.isFinite(n) && n > 0 ? new Date(Date.now() + n * 86_400_000) : null
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No rotation fields provided" }, { status: 400 })
    }

    const updated = await prisma.credential.update({ where: { id }, data })

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
    return NextResponse.json({ error: "Failed to update rotation policy" }, { status: 500 })
  }
}
