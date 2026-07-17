import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"

// GET /api/clients/[id]/vendors — vendors associated with this client
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    if (!scopeAllows(await getClientScope(), id)) return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })
    const client = await prisma.client.findUnique({
      where: { id },
      select: {
        vendors: {
          orderBy: { name: "asc" },
          include: {
            contacts: { orderBy: { name: "asc" } },
            _count: { select: { licenses: true, applications: true } },
          },
        },
      },
    })
    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 })
    return NextResponse.json(client.vendors)
  } catch {
    return NextResponse.json({ error: "Failed to fetch vendors" }, { status: 500 })
  }
}

// POST /api/clients/[id]/vendors — associate a vendor with this client
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    if (!scopeAllows(await getClientScope(), id)) return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })
    const body = await req.json()
    const { vendorId } = body
    if (!vendorId) {
      return NextResponse.json({ error: "vendorId is required" }, { status: 400 })
    }
    await prisma.client.update({
      where: { id },
      data: { vendors: { connect: { id: vendorId } } },
    })
    return NextResponse.json({ success: true }, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Failed to associate vendor" }, { status: 500 })
  }
}

// DELETE /api/clients/[id]/vendors — disassociate a vendor from this client
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    if (!scopeAllows(await getClientScope(), id)) return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })
    const body = await req.json()
    const { vendorId } = body
    if (!vendorId) {
      return NextResponse.json({ error: "vendorId is required" }, { status: 400 })
    }
    await prisma.client.update({
      where: { id },
      data: { vendors: { disconnect: { id: vendorId } } },
    })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Failed to remove vendor" }, { status: 500 })
  }
}
