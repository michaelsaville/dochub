import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"
import { writeAudit } from "@/lib/audit-log"
import { CABLE_RUN_SELECT, normalizeJackLabel, cableRunSummary } from "@/lib/cable-runs"

/** Loads the run and proves it belongs to the client in the URL and to the caller's scope. */
async function authorize(clientId: string, runId: string) {
  const scope = await getClientScope()
  if (!scopeAllows(scope, clientId)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }
  const run = await prisma.cableRun.findFirst({ where: { id: runId, clientId }, select: CABLE_RUN_SELECT })
  if (!run) return { error: NextResponse.json({ error: "Cable run not found" }, { status: 404 }) }
  return { run }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const { session, error } = await requireAuth()
  if (error) return error
  try {
    const { id: clientId, runId } = await params
    const auth = await authorize(clientId, runId)
    if (auth.error) return auth.error

    const body = await req.json()

    // "Verify" is its own action: confirming a run is still true is the single most
    // valuable thing a tech does on site, and it must not require editing a field.
    if (body.verify === true) {
      const run = await prisma.cableRun.update({
        where: { id: runId },
        data: { lastVerifiedAt: new Date(), verifiedBy: session?.user?.name ?? null },
        select: CABLE_RUN_SELECT,
      })
      await writeAudit({
        action: "cable-run.verify",
        actorType: "STAFF",
        actorId: (session?.user as { id?: string })?.id ?? null,
        actorLabel: session?.user?.name ?? "unknown",
        entityType: "cable-run",
        entityId: runId,
        clientId,
        summary: `Verified cable run ${cableRunSummary(run)}`,
        ip: req.headers.get("x-forwarded-for"),
        userAgent: req.headers.get("user-agent"),
      })
      return NextResponse.json(run)
    }

    let jackLabel: string | undefined
    if (body.jackLabel !== undefined) {
      jackLabel = normalizeJackLabel(body.jackLabel)
      if (!jackLabel) return NextResponse.json({ error: "Jack label cannot be empty" }, { status: 400 })
      const clash = await prisma.cableRun.findUnique({
        where: { locationId_jackLabel: { locationId: auth.run!.locationId, jackLabel } },
        select: { id: true },
      })
      if (clash && clash.id !== runId) {
        return NextResponse.json({ error: `Jack "${jackLabel}" already documented at this location` }, { status: 409 })
      }
    }

    const run = await prisma.cableRun.update({
      where: { id: runId },
      data: {
        ...(jackLabel !== undefined && { jackLabel }),
        ...(body.room !== undefined && { room: body.room?.trim() || null }),
        ...(body.panelAssetId !== undefined && { panelAssetId: body.panelAssetId || null }),
        ...(body.panelLabel !== undefined && { panelLabel: body.panelLabel?.trim() || null }),
        ...(body.panelPort !== undefined && { panelPort: Number.isInteger(body.panelPort) ? body.panelPort : null }),
        ...(body.switchAssetId !== undefined && { switchAssetId: body.switchAssetId || null }),
        ...(body.switchPortNumber !== undefined && {
          switchPortNumber: Number.isInteger(body.switchPortNumber) ? body.switchPortNumber : null,
        }),
        ...(body.switchPortId !== undefined && { switchPortId: body.switchPortId || null }),
        ...(body.cableType !== undefined && { cableType: body.cableType?.trim() || null }),
        ...(body.notes !== undefined && { notes: body.notes?.trim() || null }),
        // Any edit is also a verification — the person editing just looked at it.
        lastVerifiedAt: new Date(),
        verifiedBy: session?.user?.name ?? null,
      },
      select: CABLE_RUN_SELECT,
    })

    await writeAudit({
      action: "cable-run.update",
      actorType: "STAFF",
      actorId: (session?.user as { id?: string })?.id ?? null,
      actorLabel: session?.user?.name ?? "unknown",
      entityType: "cable-run",
      entityId: runId,
      clientId,
      summary: `Updated cable run ${cableRunSummary(run)}`,
      metadata: { changed: Object.keys(body) },
      ip: req.headers.get("x-forwarded-for"),
      userAgent: req.headers.get("user-agent"),
    })

    return NextResponse.json(run)
  } catch {
    return NextResponse.json({ error: "Failed to update cable run" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const { session, error } = await requireAuth()
  if (error) return error
  try {
    const { id: clientId, runId } = await params
    const auth = await authorize(clientId, runId)
    if (auth.error) return auth.error

    await prisma.cableRun.delete({ where: { id: runId } })

    await writeAudit({
      action: "cable-run.delete",
      actorType: "STAFF",
      actorId: (session?.user as { id?: string })?.id ?? null,
      actorLabel: session?.user?.name ?? "unknown",
      entityType: "cable-run",
      entityId: runId,
      clientId,
      // The row is gone, so the summary is the only surviving record of what it said.
      summary: `Deleted cable run ${cableRunSummary(auth.run!)}`,
      ip: req.headers.get("x-forwarded-for"),
      userAgent: req.headers.get("user-agent"),
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Failed to delete cable run" }, { status: 500 })
  }
}
