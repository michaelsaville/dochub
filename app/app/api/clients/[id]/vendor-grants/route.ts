import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export const dynamic = "force-dynamic"

/**
 * GET — list this client's vendor-portal grants with their shared-item ids.
 * Any authed staff may view; mutations require ADMIN (sharing client secrets
 * with an outside party is an admin-level decision).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  const { id } = await params

  const grants = await prisma.vendorClientGrant.findMany({
    where: { clientId: id },
    include: {
      vendor: { select: { id: true, name: true } },
      shares: {
        // The staff panel manages staff-domain item types only. Client-
        // self-managed vault-credential shares (PORTAL_CREDENTIAL) are the
        // client's to manage in the portal; staff see those reveals in the
        // audit log instead.
        where: { itemType: { not: "PORTAL_CREDENTIAL" } },
        select: { id: true, itemType: true, itemId: true, note: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  })

  return NextResponse.json(grants)
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth("ADMIN")
  if (error) return error
  const { id } = await params
  const { vendorId, label } = await req.json()
  if (!vendorId) return NextResponse.json({ error: "vendorId required" }, { status: 400 })

  // Confirm the vendor exists (avoid orphan FKs from a stale client UI).
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId }, select: { id: true } })
  if (!vendor) return NextResponse.json({ error: "Vendor not found" }, { status: 404 })

  try {
    const grant = await prisma.vendorClientGrant.create({
      data: {
        clientId: id,
        vendorId,
        label: label?.trim() || null,
        createdByStaffId: session?.user?.email ?? null,
      },
      include: { vendor: { select: { id: true, name: true } }, shares: true },
    })
    return NextResponse.json(grant, { status: 201 })
  } catch (e: any) {
    if (e.code === "P2002") {
      return NextResponse.json({ error: "This vendor already has a portal grant for this client" }, { status: 409 })
    }
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
