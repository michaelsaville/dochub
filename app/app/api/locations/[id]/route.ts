import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

// GET /api/locations/[id] — full detail with relations for the standalone page.
// Includes cross-app TH_Site lookup (best-effort, non-fatal on failure).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const loc = await prisma.location.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true } },
        assets: {
          select: { id: true, name: true, friendlyName: true, category: true, ipAddress: true, status: true },
          orderBy: { name: "asc" },
        },
        networkDevices: {
          select: { id: true, name: true, type: true, ipAddress: true },
          orderBy: { name: "asc" },
        },
        racks: { select: { id: true, name: true } },
        subnets: {
          select: { id: true, cidr: true, vlan: true, description: true },
          orderBy: { cidr: "asc" },
        },
        internetCircuits: {
          select: { id: true, label: true, role: true, status: true, staticBlockCidr: true, wanIp: true, ispNameFallback: true, vendor: { select: { id: true, name: true } } },
          orderBy: { role: "asc" },
        },
        attachments: { select: { id: true } },
      },
    })
    if (!loc) return NextResponse.json({ error: "Not found" }, { status: 404 })

    // Best-effort TH_Site cross-schema lookup. Use cached thSiteId when set;
    // otherwise ILIKE name on tickethub.th_sites within the same client.
    let thSite: { id: string; name: string; address: string | null; city: string | null; state: string | null; zip: string | null; isPrimary: boolean; isBilling: boolean; thClientId: string } | null = null
    try {
      if (loc.thSiteId) {
        const rows = await prisma.$queryRawUnsafe<any[]>(
          `SELECT s.id, s.name, s.address, s.city, s.state, s.zip,
                  s."isPrimary", s."isBilling", s."clientId" AS "thClientId"
             FROM tickethub.th_sites s
            WHERE s.id = $1 LIMIT 1`,
          loc.thSiteId,
        )
        if (rows.length > 0) thSite = rows[0]
      }
      if (!thSite) {
        const rows = await prisma.$queryRawUnsafe<any[]>(
          `SELECT s.id, s.name, s.address, s.city, s.state, s.zip,
                  s."isPrimary", s."isBilling", s."clientId" AS "thClientId"
             FROM tickethub.th_sites s
             JOIN tickethub.th_clients c ON c.id = s."clientId"
            WHERE c.name ILIKE $1 AND s.name ILIKE $2
            LIMIT 1`,
          loc.client.name, loc.name,
        )
        if (rows.length > 0) {
          thSite = rows[0]
          // Cache for next time — silent best-effort.
          try {
            await prisma.location.update({ where: { id }, data: { thSiteId: thSite!.id } })
          } catch {}
        }
      }
    } catch (e) {
      // Cross-schema lookup is non-fatal — the page still renders without it.
      console.warn("[api/locations/:id] TH_Site lookup failed", e)
    }

    return NextResponse.json({ ...loc, thSite })
  } catch (e) {
    console.error("[api/locations/:id GET]", e)
    return NextResponse.json({ error: "Failed to load location" }, { status: 500 })
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const body = await req.json()
    const { name, address, city, state, zip, ispName, wanIp, notes } = body

    const location = await prisma.location.update({
      where: { id },
      data: {
        ...(name?.trim() && { name: name.trim() }),
        ...(address !== undefined && { address: address || null }),
        ...(city !== undefined && { city: city || null }),
        ...(state !== undefined && { state: state || null }),
        ...(zip !== undefined && { zip: zip || null }),
        ...(ispName !== undefined && { ispName: ispName || null }),
        ...(wanIp !== undefined && { wanIp: wanIp || null }),
        ...(notes !== undefined && { notes: notes || null }),
      },
    })
    return NextResponse.json(location)
  } catch (e) {
    return NextResponse.json({ error: "Failed to update location" }, { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    await prisma.location.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: "Failed to delete location" }, { status: 500 })
  }
}
