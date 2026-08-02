import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"
import type { PortState } from "@/lib/port-state"

/**
 * GET /api/racks/[id]/elevation — everything the rack editor needs, in one call.
 *
 * Devices in U order with their DevicePorts, plus every PortLink that touches any
 * of those ports (including links whose far end is outside this rack, so the editor
 * can show a cable leaving the rack rather than pretending the port is empty).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params

    const rack = await prisma.rack.findUnique({
      where: { id },
      select: {
        id: true, name: true, totalU: true,
        location: { select: { id: true, name: true, clientId: true } },
        slots: {
          orderBy: [{ startU: "asc" }, { shelfPos: "asc" }],
          select: {
            id: true, startU: true, heightU: true, label: true,
            asset: {
              select: {
                id: true, name: true, friendlyName: true, category: true,
                assetType: { select: { name: true } },
                devicePorts: {
                  orderBy: [{ side: "asc" }, { portIndex: "asc" }],
                  select: {
                    id: true, side: true, portIndex: true, label: true, pairedPortId: true,
                    switchPort: { select: { isUplink: true, isPoe: true, vlan: { select: { color: true } } } },
                  },
                },
              },
            },
          },
        },
      },
    })
    if (!rack) return NextResponse.json({ error: "Rack not found" }, { status: 404 })

    const scope = await getClientScope()
    if (!scopeAllows(scope, rack.location?.clientId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const portIds = rack.slots.flatMap((s) => s.asset?.devicePorts.map((p) => p.id) ?? [])
    const links = portIds.length
      ? await prisma.portLink.findMany({
          where: { OR: [{ aPortId: { in: portIds } }, { bPortId: { in: portIds } }] },
          select: { id: true, kind: true, aPortId: true, bPortId: true, color: true },
        })
      : []

    // Which ports actually have something on them — drives the state below.
    const building = new Set<string>()
    const patched = new Set<string>()
    for (const l of links) {
      const target = l.kind === "BUILDING" ? building : patched
      target.add(l.aPortId)
      target.add(l.bPortId)
    }

    const devices = rack.slots
      .filter((s) => s.asset)
      .map((s) => {
        const a = s.asset!
        return {
          assetId: a.id,
          name: s.label || a.friendlyName || a.name,
          // Prefer the AssetType name (which is what the tech configured) and fall
          // back to the coarse category enum.
          kind: (a.assetType?.name ?? a.category ?? "OTHER").toUpperCase().replace(/\s+/g, "_"),
          startU: s.startU,
          heightU: s.heightU,
          ports: a.devicePorts.map((p) => {
            let state: PortState = "EMPTY"
            if (p.switchPort?.isUplink) state = "UPLINK"
            else if (patched.has(p.id)) state = "PATCHED"
            // "Cabled but not patched" is the state the whole keystone metaphor
            // exists for, and the one the old SwitchPanel could never express.
            else if (building.has(p.id)) state = "CABLED"
            return {
              id: p.id,
              side: p.side,
              portIndex: p.portIndex,
              label: p.label,
              pairedPortId: p.pairedPortId,
              state,
              vlanColor: p.switchPort?.vlan?.color ?? null,
              isPoe: p.switchPort?.isPoe ?? false,
            }
          }),
        }
      })

    return NextResponse.json({
      id: rack.id,
      name: rack.name,
      totalU: rack.totalU,
      clientId: rack.location?.clientId ?? null,
      locationName: rack.location?.name ?? null,
      devices,
      links,
    })
  } catch {
    return NextResponse.json({ error: "Failed to load rack elevation" }, { status: 500 })
  }
}
