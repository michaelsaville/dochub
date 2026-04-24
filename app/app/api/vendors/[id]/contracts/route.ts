import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  const { id } = await params
  const contracts = await prisma.vendorContract.findMany({
    where: { vendorId: id },
    orderBy: [{ endDate: "asc" }, { name: "asc" }],
    include: { client: { select: { id: true, name: true } } },
  })
  return NextResponse.json(contracts)
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  const { id } = await params
  const body = await req.json()
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 })
  }
  const created = await prisma.vendorContract.create({
    data: {
      vendorId: id,
      clientId: body.clientId || null,
      name: body.name.trim(),
      contractType: body.contractType || null,
      startDate: body.startDate ? new Date(body.startDate) : null,
      endDate: body.endDate ? new Date(body.endDate) : null,
      autoRenew: !!body.autoRenew,
      renewalDate: body.renewalDate ? new Date(body.renewalDate) : null,
      cost: body.cost ? Math.round(parseFloat(body.cost) * 100) : null,
      costPeriod: body.costPeriod || null,
      documentUrl: body.documentUrl || null,
      notes: body.notes || null,
    },
    include: { client: { select: { id: true, name: true } } },
  })
  return NextResponse.json(created, { status: 201 })
}
