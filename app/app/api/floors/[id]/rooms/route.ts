import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"

/**
 * Rooms on a floor.
 *
 * `geometry` is optional throughout: a room may be created by someone typing its
 * name during capture and only get drawn later, if ever. Requiring the polygon
 * first is the friction that keeps physical-layer documentation at zero.
 */
async function authorize(floorId: string) {
  const floor = await prisma.floor.findUnique({
    where: { id: floorId },
    select: { id: true, location: { select: { clientId: true } } },
  })
  if (!floor) return { error: NextResponse.json({ error: "Floor not found" }, { status: 404 }) }
  const scope = await getClientScope()
  if (!scopeAllows(scope, floor.location?.clientId)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }
  return { floor }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id: floorId } = await params
    const auth = await authorize(floorId)
    if (auth.error) return auth.error

    const body = await req.json()
    const name = body.name?.trim()
    if (!name) return NextResponse.json({ error: "Room name is required" }, { status: 400 })

    // Case-insensitive match against what is already on this floor, so drawing a
    // room that a tech already typed into an asset does not create a second one.
    const existing = await prisma.room.findFirst({
      where: { floorId, name: { equals: name, mode: "insensitive" } },
      select: { id: true },
    })

    const geometry = Array.isArray(body.points) && body.points.length >= 3
      ? { points: body.points }
      : undefined

    const room = existing
      ? await prisma.room.update({
          where: { id: existing.id },
          // Never blank an existing polygon with an undefined one.
          data: { ...(geometry ? { geometry } : {}), ...(body.color ? { color: body.color } : {}) },
          select: { id: true, name: true, shortId: true, geometry: true, color: true },
        })
      : await prisma.room.create({
          data: { floorId, name, shortId: body.shortId?.trim() || null, geometry, color: body.color ?? null },
          select: { id: true, name: true, shortId: true, geometry: true, color: true },
        })

    return NextResponse.json(room, { status: existing ? 200 : 201 })
  } catch {
    return NextResponse.json({ error: "Failed to save room" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id: floorId } = await params
    const auth = await authorize(floorId)
    if (auth.error) return auth.error

    const roomId = req.nextUrl.searchParams.get("roomId")
    if (!roomId) return NextResponse.json({ error: "roomId is required" }, { status: 400 })

    // The room must belong to the floor we authorized. Without this the authz check
    // above is decorative: it proves access to floor X, then deletes a room on
    // floor Y. Invisible today only because every user is currently unscoped.
    const room = await prisma.room.findFirst({ where: { id: roomId, floorId }, select: { id: true } })
    if (!room) return NextResponse.json({ error: "Room not found on this floor" }, { status: 404 })

    // Assets keep their free-text `room` string; only the resolved pointer clears.
    await prisma.asset.updateMany({ where: { roomId }, data: { roomId: null } })
    await prisma.room.delete({ where: { id: roomId } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Failed to delete room" }, { status: 500 })
  }
}
