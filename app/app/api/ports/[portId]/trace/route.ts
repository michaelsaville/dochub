import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"
import { tracePort, formatTrace } from "@/lib/patch-trace"

/**
 * GET /api/ports/[portId]/trace — the end-to-end physical path through this port.
 *
 * This is the 2am endpoint: given any port anywhere in the chain, return the whole
 * run. Scope is resolved through the port's owning asset -> location -> client.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ portId: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { portId } = await params

    const port = await prisma.devicePort.findUnique({
      where: { id: portId },
      select: { id: true, asset: { select: { location: { select: { clientId: true } } } } },
    })
    if (!port) return NextResponse.json({ error: "Port not found" }, { status: 404 })

    const scope = await getClientScope()
    if (!scopeAllows(scope, port.asset?.location?.clientId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const hops = await tracePort(portId)
    return NextResponse.json({ hops, chain: formatTrace(hops) })
  } catch {
    return NextResponse.json({ error: "Failed to trace port" }, { status: 500 })
  }
}
