import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"

/**
 * PATCH /api/assets/[id]/placement — pin an asset on a floor plan, and/or set its room.
 *
 * Setting a room by NAME creates or matches the Room and keeps the free-text
 * `Asset.room` in sync. Both representations are maintained on purpose: the string
 * is what a technician types, the pointer is what the floor plan draws. Blocking on
 * "create the room first" is exactly the friction that left Asset.room at 0.8%.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const asset = await prisma.asset.findUnique({
      where: { id },
      select: { id: true, locationId: true, location: { select: { clientId: true } } },
    })
    if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 })

    const scope = await getClientScope()
    if (!scopeAllows(scope, asset.location?.clientId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await req.json()
    const data: Record<string, unknown> = {}

    if (body.floorId !== undefined) {
      if (body.floorId) {
        // A pin must not land on another location's plan.
        const floor = await prisma.floor.findFirst({
          where: { id: body.floorId, locationId: asset.locationId },
          select: { id: true },
        })
        if (!floor) return NextResponse.json({ error: "Floor is not at this asset's location" }, { status: 400 })
      }
      data.floorId = body.floorId || null
    }
    if (body.planX !== undefined) data.planX = Number.isFinite(Number(body.planX)) ? Number(body.planX) : null
    if (body.planY !== undefined) data.planY = Number.isFinite(Number(body.planY)) ? Number(body.planY) : null

    // Room by name: create-or-match, and mirror into the free-text column.
    if (body.roomName !== undefined) {
      const name = String(body.roomName ?? "").trim()
      if (!name) {
        data.roomId = null
        data.room = null
      } else {
        const floorId = (data.floorId as string | null | undefined) ?? body.floorId ?? null
        let room = null
        if (floorId) {
          room = await prisma.room.findFirst({
            where: { floorId, name: { equals: name, mode: "insensitive" } },
            select: { id: true, name: true },
          })
          if (!room) room = await prisma.room.create({ data: { floorId, name }, select: { id: true, name: true } })
        }
        data.roomId = room?.id ?? null
        // Store the canonical spelling when one exists, so "upstairs rack" and
        // "Upstairs Rack" converge instead of drifting further apart.
        data.room = room?.name ?? name
      }
    } else if (body.roomId !== undefined) {
      data.roomId = body.roomId || null
    }

    const updated = await prisma.asset.update({
      where: { id },
      data,
      select: { id: true, floorId: true, roomId: true, room: true, planX: true, planY: true },
    })
    return NextResponse.json(updated)
  } catch {
    return NextResponse.json({ error: "Failed to update placement" }, { status: 500 })
  }
}
