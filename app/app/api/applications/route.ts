import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

// GET /api/applications?vendorId=&excludeVendorId= — used by RelationLinker
// pickers on Vendor detail. Returns all applications, optionally scoped.
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
    const apps = await prisma.application.findMany({
      where,
      orderBy: { name: "asc" },
      select: { id: true, name: true, vendor: true, vendorId: true, clientId: true },
    })
    return NextResponse.json(apps)
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch applications" }, { status: 500 })
  }
}
