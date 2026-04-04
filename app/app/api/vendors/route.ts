import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function GET() {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const vendors = await prisma.vendor.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { contacts: true, clients: true, licenses: true } },
      },
    })
    return NextResponse.json(vendors)
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch vendors" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const body = await req.json()
    const { name, category, website, supportUrl, supportPhone, supportEmail, accountNumber, portalUrl, notes } = body
    if (!name?.trim()) {
      return NextResponse.json({ error: "Vendor name is required" }, { status: 400 })
    }
    const vendor = await prisma.vendor.create({
      data: {
        name: name.trim(),
        category: category || "OTHER",
        website: website?.trim() || null,
        supportUrl: supportUrl?.trim() || null,
        supportPhone: supportPhone?.trim() || null,
        supportEmail: supportEmail?.trim() || null,
        accountNumber: accountNumber?.trim() || null,
        portalUrl: portalUrl?.trim() || null,
        notes: notes?.trim() || null,
      },
    })
    return NextResponse.json(vendor, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: "Failed to create vendor" }, { status: 500 })
  }
}
