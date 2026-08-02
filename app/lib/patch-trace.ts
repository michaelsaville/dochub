import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"

/**
 * End-to-end path resolution across the physical layer.
 *
 * The graph has two kinds of edge and both are needed for a trace to mean anything:
 *
 *   1. PortLink rows — an actual cable. BUILDING is the permanent in-wall run
 *      (panel rear <-> wall outlet); PATCH is the movable cord (panel front <->
 *      switch port). Traversed in BOTH directions: which end got stored as `a` is
 *      an accident of who clicked first.
 *
 *   2. DevicePort.pairedPortId — the pass-through inside a patch panel, front port
 *      12 to rear port 12. Without this edge every trace dead-ends at the panel,
 *      which is precisely the question people are asking. Also bidirectional: the
 *      pairing is stored on one row only.
 *
 * One recursive CTE, one round trip. Deliberately NOT an adjacency walk in app
 * code — that would cost N round trips per hop and could not be reused by the
 * portal BFF or the printed as-built.
 */

/** Hard ceiling on hops. Real chains are 4-6 (switch -> panel front -> panel rear
 *  -> outlet -> device); anything approaching this is a data problem, not a long run. */
const MAX_HOPS = 12

export type TraceHop = {
  portId: string
  hop: number
  assetId: string
  assetName: string
  side: "FRONT" | "REAR"
  portIndex: number
  portLabel: string | null
  /** How we ARRIVED at this port: null for the origin, else the edge type traversed. */
  via: "BUILDING" | "PATCH" | "PASSTHROUGH" | null
}

/**
 * Walk the physical graph outward from one port.
 *
 * Returns every reachable port in hop order, origin first. A well-formed run is a
 * simple path, so the result reads as the chain; a branch (which should not exist,
 * and is worth surfacing if it does) shows up as siblings at the same hop.
 */
export async function tracePort(portId: string): Promise<TraceHop[]> {
  return prisma.$queryRaw<TraceHop[]>`
    WITH RECURSIVE
    -- Every edge, normalized to (from, to) and labelled with how it is traversed.
    edge AS (
      SELECT "aPortId" AS from_port, "bPortId" AS to_port, kind::text AS via FROM "PortLink"
      UNION ALL
      SELECT "bPortId", "aPortId", kind::text FROM "PortLink"
      UNION ALL
      SELECT id, "pairedPortId", 'PASSTHROUGH' FROM "DevicePort" WHERE "pairedPortId" IS NOT NULL
      UNION ALL
      SELECT "pairedPortId", id, 'PASSTHROUGH' FROM "DevicePort" WHERE "pairedPortId" IS NOT NULL
    ),
    walk(port_id, path, hop, via) AS (
      SELECT ${portId}::text, ARRAY[${portId}::text], 0, NULL::text
      UNION ALL
      SELECT e.to_port, w.path || e.to_port, w.hop + 1, e.via
      FROM walk w
      JOIN edge e ON e.from_port = w.port_id
      -- Cycle guard. Mis-cabled or mis-entered data WILL produce loops, and without
      -- this the CTE never terminates.
      WHERE NOT e.to_port = ANY(w.path)
        AND w.hop < ${MAX_HOPS}
    )
    SELECT w.port_id                        AS "portId",
           w.hop                            AS hop,
           dp."assetId"                     AS "assetId",
           COALESCE(a."friendlyName", a.name) AS "assetName",
           dp.side::text                    AS side,
           dp."portIndex"                   AS "portIndex",
           dp.label                         AS "portLabel",
           w.via                            AS via
    FROM walk w
    JOIN "DevicePort" dp ON dp.id = w.port_id
    JOIN "Asset" a       ON a.id = dp."assetId"
    ORDER BY w.hop, dp."assetId", dp."portIndex"
  `
}

/**
 * `sw-mdf:14 -> PP-A front/12 -> PP-A rear/12 -> TO B-114`
 *
 * ASCII arrows on purpose: this string is reused in printed and PDF output, and
 * @react-pdf's bundled Helvetica silently corrupts non-ASCII glyphs.
 */
export function formatTrace(hops: TraceHop[]): string {
  return hops
    .map((h) => `${h.assetName}${h.portLabel ? ` ${h.portLabel}` : ""}:${h.portIndex}${h.side === "REAR" ? "r" : ""}`)
    .join(" -> ")
}

/**
 * Create a link, enforcing the invariant the database cannot.
 *
 * @@unique([aPortId, kind]) and @@unique([bPortId, kind]) stop a port from holding
 * two links of the same kind *in the same column* — but nothing stops port X being
 * `aPortId` on one row and `bPortId` on another with the same kind. That check has
 * to run inside the insert transaction, because an offline double-tap replaying
 * through two queues is a live path here, not a hypothetical.
 */
export async function createPortLink(input: {
  clientId: string
  kind: "BUILDING" | "PATCH"
  aPortId: string
  bPortId: string
  color?: string | null
  cableType?: string | null
  lengthCm?: number | null
  notes?: string | null
}) {
  if (input.aPortId === input.bPortId) {
    throw new Error("A cable cannot connect a port to itself")
  }
  return prisma.$transaction(async (tx) => {
    const conflicts = await tx.portLink.findMany({
      where: {
        kind: input.kind as Prisma.EnumLinkKindFilter["equals"],
        OR: [
          { aPortId: { in: [input.aPortId, input.bPortId] } },
          { bPortId: { in: [input.aPortId, input.bPortId] } },
        ],
      },
      select: { id: true, aPortId: true, bPortId: true },
    })
    if (conflicts.length > 0) {
      const busy = conflicts.flatMap((c) => [c.aPortId, c.bPortId])
      const which = [input.aPortId, input.bPortId].filter((p) => busy.includes(p))
      throw new Error(
        `Port already has a ${input.kind} connection: ${which.join(", ")}. ` +
          `Disconnect it before patching it somewhere else.`
      )
    }
    return tx.portLink.create({ data: { ...input } })
  })
}

/**
 * Scaffold ports for a device.
 *
 * `passthrough` (a patch panel) gets FRONT and REAR ports paired 1:1, which is what
 * makes it transparent to a trace. A switch gets FRONT ports only — its front port
 * 1 and rear port 1 are unrelated, so pairing them would invent cables that do not
 * exist. Idempotent: re-running never duplicates or overwrites labels.
 */
export async function scaffoldDevicePorts(assetId: string, portCount: number, passthrough: boolean) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.devicePort.findMany({ where: { assetId }, select: { side: true, portIndex: true } })
    const have = new Set(existing.map((p) => `${p.side}:${p.portIndex}`))

    for (let i = 1; i <= portCount; i++) {
      const front = have.has(`FRONT:${i}`)
        ? await tx.devicePort.findUnique({ where: { assetId_side_portIndex: { assetId, side: "FRONT", portIndex: i } } })
        : await tx.devicePort.create({ data: { assetId, side: "FRONT", portIndex: i } })
      if (!passthrough || !front) continue

      const rear = have.has(`REAR:${i}`)
        ? await tx.devicePort.findUnique({ where: { assetId_side_portIndex: { assetId, side: "REAR", portIndex: i } } })
        : await tx.devicePort.create({ data: { assetId, side: "REAR", portIndex: i } })
      if (rear && !front.pairedPortId) {
        await tx.devicePort.update({ where: { id: front.id }, data: { pairedPortId: rear.id } })
      }
    }
    return tx.devicePort.count({ where: { assetId } })
  })
}
