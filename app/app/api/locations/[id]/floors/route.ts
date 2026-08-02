import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"

const FLOOR_SELECT = {
  id: true, name: true, ordinal: true, planStorageName: true,
  planWidth: true, planHeight: true, pxPerMetre: true,
  rooms: { select: { id: true, name: true, shortId: true, geometry: true, color: true } },
} as const

/** GET — floors for a location, with their rooms and any placed assets. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id: locationId } = await params
    const loc = await prisma.location.findUnique({
      where: { id: locationId },
      select: { id: true, clientId: true, name: true },
    })
    if (!loc) return NextResponse.json({ error: "Location not found" }, { status: 404 })

    const scope = await getClientScope()
    if (!scopeAllows(scope, loc.clientId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const [floors, placed] = await Promise.all([
      prisma.floor.findMany({ where: { locationId }, orderBy: { ordinal: "asc" }, select: FLOOR_SELECT }),
      // Assets already pinned. `room` free text comes along so the panel can show
      // what a tech typed even when it never got resolved to a Room entity.
      prisma.asset.findMany({
        where: { locationId, planX: { not: null } },
        select: {
          id: true, name: true, friendlyName: true, category: true,
          floorId: true, roomId: true, planX: true, planY: true, room: true,
        },
      }),
    ])

    return NextResponse.json({ locationId, locationName: loc.name, clientId: loc.clientId, floors, placed })
  } catch {
    return NextResponse.json({ error: "Failed to load floors" }, { status: 500 })
  }
}

/** POST — create a floor. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id: locationId } = await params
    const loc = await prisma.location.findUnique({ where: { id: locationId }, select: { clientId: true } })
    if (!loc) return NextResponse.json({ error: "Location not found" }, { status: 404 })

    const scope = await getClientScope()
    if (!scopeAllows(scope, loc.clientId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const body = await req.json()
    // Next free ordinal — @@unique([locationId, ordinal]) would otherwise reject
    // a second floor created with the default.
    const last = await prisma.floor.findFirst({
      where: { locationId }, orderBy: { ordinal: "desc" }, select: { ordinal: true },
    })
    const floor = await prisma.floor.create({
      data: {
        locationId,
        name: body.name?.trim() || "Ground Floor",
        ordinal: (last?.ordinal ?? -1) + 1,
      },
      select: FLOOR_SELECT,
    })
    return NextResponse.json(floor, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Failed to create floor" }, { status: 500 })
  }
}
