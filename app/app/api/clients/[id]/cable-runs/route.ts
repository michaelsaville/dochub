import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"
import { writeAudit } from "@/lib/audit-log"
import { CABLE_RUN_SELECT, normalizeJackLabel, cableRunSummary } from "@/lib/cable-runs"

// Cable runs for one client. Every mutation writes an AuditLog row — the existing
// /api/racks/** routes write none, which is the gap this feature set is meant to
// close, not repeat.

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id: clientId } = await params
    const scope = await getClientScope()
    if (!scopeAllows(scope, clientId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const locationId = req.nextUrl.searchParams.get("locationId")?.trim() || undefined
    const runs = await prisma.cableRun.findMany({
      where: { clientId, ...(locationId ? { locationId } : {}) },
      select: CABLE_RUN_SELECT,
      // Stable ordering: the rest of the app relies on heap order and visibly
      // reshuffles as rows are edited. A field-edited table must not do that.
      orderBy: [{ room: "asc" }, { jackLabel: "asc" }],
    })
    return NextResponse.json(runs)
  } catch {
    return NextResponse.json({ error: "Failed to fetch cable runs" }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth()
  if (error) return error
  try {
    const { id: clientId } = await params
    const scope = await getClientScope()
    if (!scopeAllows(scope, clientId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const body = await req.json()
    const jackLabel = normalizeJackLabel(body.jackLabel)
    if (!jackLabel) return NextResponse.json({ error: "Jack label is required" }, { status: 400 })
    if (!body.locationId) return NextResponse.json({ error: "Location is required" }, { status: 400 })

    // The location must belong to this client — otherwise a caller could attach a
    // run to another client's site via a forged locationId while passing the
    // clientId scope check above.
    const location = await prisma.location.findFirst({
      where: { id: body.locationId, clientId },
      select: { id: true },
    })
    if (!location) return NextResponse.json({ error: "Location not found for this client" }, { status: 400 })

    // Idempotent replay of a queued offline write (see CableRun.clientOpId).
    if (body.clientOpId) {
      const dupe = await prisma.cableRun.findUnique({
        where: { clientOpId: body.clientOpId },
        select: CABLE_RUN_SELECT,
      })
      if (dupe) return NextResponse.json({ ...dupe, deduplicated: true })
    }

    const existing = await prisma.cableRun.findUnique({
      where: { locationId_jackLabel: { locationId: body.locationId, jackLabel } },
      select: { id: true },
    })
    if (existing) {
      return NextResponse.json(
        { error: `Jack "${jackLabel}" already documented at this location`, existingId: existing.id },
        { status: 409 }
      )
    }

    const run = await prisma.cableRun.create({
      data: {
        clientId,
        locationId: body.locationId,
        jackLabel,
        room: body.room?.trim() || null,
        panelAssetId: body.panelAssetId || null,
        panelLabel: body.panelLabel?.trim() || null,
        panelPort: Number.isInteger(body.panelPort) ? body.panelPort : null,
        switchAssetId: body.switchAssetId || null,
        switchPortNumber: Number.isInteger(body.switchPortNumber) ? body.switchPortNumber : null,
        switchPortId: body.switchPortId || null,
        cableType: body.cableType?.trim() || null,
        notes: body.notes?.trim() || null,
        clientOpId: body.clientOpId || null,
        // A run entered by a human is verified by definition, at the moment of entry.
        lastVerifiedAt: new Date(),
        verifiedBy: session?.user?.name ?? null,
      },
      select: CABLE_RUN_SELECT,
    })

    await writeAudit({
      action: "cable-run.create",
      actorType: "STAFF",
      actorId: (session?.user as { id?: string })?.id ?? null,
      actorLabel: session?.user?.name ?? "unknown",
      entityType: "cable-run",
      entityId: run.id,
      clientId,
      summary: `Documented cable run ${cableRunSummary(run)}`,
      metadata: { locationId: body.locationId, jackLabel },
      ip: req.headers.get("x-forwarded-for"),
      userAgent: req.headers.get("user-agent"),
    })

    return NextResponse.json(run, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Failed to create cable run" }, { status: 500 })
  }
}
