import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"
import { writeAudit } from "@/lib/audit-log"
import { createPortLink } from "@/lib/patch-trace"

/** Resolves a port's owning client, for scoping. */
async function clientOf(portId: string) {
  const p = await prisma.devicePort.findUnique({
    where: { id: portId },
    select: {
      asset: {
        select: { name: true, friendlyName: true, location: { select: { clientId: true } } },
      },
      side: true,
      portIndex: true,
    },
  })
  return p
}

/** POST — patch two ports together (or record a permanent building run). */
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth()
  if (error) return error
  try {
    const body = await req.json()
    const { kind, aPortId, bPortId } = body
    if (kind !== "BUILDING" && kind !== "PATCH") {
      return NextResponse.json({ error: "kind must be BUILDING or PATCH" }, { status: 400 })
    }
    if (!aPortId || !bPortId) {
      return NextResponse.json({ error: "Both ports are required" }, { status: 400 })
    }

    const [a, b] = await Promise.all([clientOf(aPortId), clientOf(bPortId)])
    if (!a || !b) return NextResponse.json({ error: "Port not found" }, { status: 404 })

    const clientId = a.asset?.location?.clientId
    // A cable cannot span two clients. This is a data-integrity check, not just
    // an authorization one — the graph is scoped per client and a cross-client
    // link would make every trace on both sides untrustworthy.
    if (!clientId || clientId !== b.asset?.location?.clientId) {
      return NextResponse.json({ error: "Both ports must belong to the same client" }, { status: 400 })
    }
    const scope = await getClientScope()
    if (!scopeAllows(scope, clientId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    let link
    try {
      link = await createPortLink({
        clientId,
        kind,
        aPortId,
        bPortId,
        color: body.color ?? null,
        cableType: body.cableType ?? null,
        lengthCm: Number.isInteger(body.lengthCm) ? body.lengthCm : null,
        notes: body.notes?.trim() || null,
      })
    } catch (e) {
      // createPortLink enforces the one-link-per-port-per-kind invariant that the
      // two unique indexes cannot express on their own.
      return NextResponse.json({ error: (e as Error).message }, { status: 409 })
    }

    const label = (p: NonNullable<typeof a>) =>
      `${p.asset?.friendlyName || p.asset?.name}:${p.portIndex}${p.side === "REAR" ? "r" : ""}`

    await writeAudit({
      action: "port-link.create",
      actorType: "STAFF",
      actorId: (session?.user as { id?: string })?.id ?? null,
      actorLabel: session?.user?.name ?? "unknown",
      entityType: "port-link",
      entityId: link.id,
      clientId,
      summary: `${kind === "BUILDING" ? "Recorded building run" : "Patched"} ${label(a)} to ${label(b)}`,
      metadata: { kind, aPortId, bPortId },
      ip: req.headers.get("x-forwarded-for"),
      userAgent: req.headers.get("user-agent"),
    })

    return NextResponse.json(link, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Failed to create link" }, { status: 500 })
  }
}

/** DELETE ?id= — unplug a cable. */
export async function DELETE(req: NextRequest) {
  const { session, error } = await requireAuth()
  if (error) return error
  try {
    const id = req.nextUrl.searchParams.get("id")
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })

    const link = await prisma.portLink.findUnique({
      where: { id },
      select: { id: true, clientId: true, kind: true, aPortId: true, bPortId: true },
    })
    if (!link) return NextResponse.json({ error: "Link not found" }, { status: 404 })

    const scope = await getClientScope()
    if (!scopeAllows(scope, link.clientId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    await prisma.portLink.delete({ where: { id } })

    await writeAudit({
      action: "port-link.delete",
      actorType: "STAFF",
      actorId: (session?.user as { id?: string })?.id ?? null,
      actorLabel: session?.user?.name ?? "unknown",
      entityType: "port-link",
      entityId: id,
      clientId: link.clientId,
      // The row is gone; this summary is the only surviving record of the cable.
      summary: `Disconnected ${link.kind} link ${link.aPortId} <-> ${link.bPortId}`,
      ip: req.headers.get("x-forwarded-for"),
      userAgent: req.headers.get("user-agent"),
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Failed to delete link" }, { status: 500 })
  }
}
