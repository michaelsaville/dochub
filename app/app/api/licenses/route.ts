import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function GET(req: Request) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const url = new URL(req.url)
    const vendorId = url.searchParams.get("vendorId")
    const excludeVendorId = url.searchParams.get("excludeVendorId")
    const where: Record<string, unknown> = { isActive: true }
    if (vendorId) where.vendorId = vendorId
    if (excludeVendorId) where.vendorId = { not: excludeVendorId } as unknown
    const licenses = await prisma.license.findMany({
      where,
      include: {
        client: { select: { id: true, name: true } },
        vendorRef: { select: { id: true, name: true } },
        person: { select: { id: true, name: true } },
        _count: { select: { seatAssignments: true } },
      },
      orderBy: { renewalDate: "asc" },
    })
    return NextResponse.json(licenses)
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch licenses" }, { status: 500 })
  }
}
