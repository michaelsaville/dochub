import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"
import { writeAudit } from "@/lib/audit-log"
import { scaffoldDevicePorts } from "@/lib/patch-trace"

/**
 * POST /api/assets/[id]/device-ports — give a device its physical ports.
 *
 * `passthrough: true` (a patch panel) creates FRONT and REAR ports paired 1:1,
 * which is what makes the panel transparent to a path trace. Anything else gets
 * FRONT ports only — on a switch, front port 1 and rear port 1 are unrelated, and
 * pairing them would invent cables that do not exist.
 *
 * Idempotent: re-running with a larger count extends, never duplicates or relabels.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth()
  if (error) return error
  try {
    const { id: assetId } = await params
    const body = await req.json()
    const portCount = Number(body.portCount)
    const passthrough = body.passthrough === true

    if (!Number.isInteger(portCount) || portCount < 1 || portCount > 96) {
      return NextResponse.json({ error: "portCount must be between 1 and 96" }, { status: 400 })
    }

    const asset = await prisma.asset.findUnique({
      where: { id: assetId },
      select: { id: true, name: true, friendlyName: true, location: { select: { clientId: true } } },
    })
    if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 })

    const clientId = asset.location?.clientId
    const scope = await getClientScope()
    if (!scopeAllows(scope, clientId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const total = await scaffoldDevicePorts(assetId, portCount, passthrough)

    await writeAudit({
      action: "device-ports.scaffold",
      actorType: "STAFF",
      actorId: (session?.user as { id?: string })?.id ?? null,
      actorLabel: session?.user?.name ?? "unknown",
      entityType: "asset",
      entityId: assetId,
      clientId: clientId ?? null,
      summary: `Scaffolded ${portCount} ${passthrough ? "pass-through" : "front"} port(s) on ${asset.friendlyName || asset.name}`,
      metadata: { portCount, passthrough, totalPorts: total },
      ip: req.headers.get("x-forwarded-for"),
      userAgent: req.headers.get("user-agent"),
    })

    return NextResponse.json({ ok: true, totalPorts: total })
  } catch {
    return NextResponse.json({ error: "Failed to scaffold ports" }, { status: 500 })
  }
}
