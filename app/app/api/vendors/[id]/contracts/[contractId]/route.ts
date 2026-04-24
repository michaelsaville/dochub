import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; contractId: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  const { contractId } = await params
  const body = await req.json()
  const data: Record<string, unknown> = {}
  if (body.name !== undefined) data.name = body.name?.trim() || ""
  if (body.contractType !== undefined) data.contractType = body.contractType || null
  if (body.startDate !== undefined) data.startDate = body.startDate ? new Date(body.startDate) : null
  if (body.endDate !== undefined) data.endDate = body.endDate ? new Date(body.endDate) : null
  if (body.autoRenew !== undefined) data.autoRenew = !!body.autoRenew
  if (body.renewalDate !== undefined) data.renewalDate = body.renewalDate ? new Date(body.renewalDate) : null
  if (body.cost !== undefined) data.cost = body.cost ? Math.round(parseFloat(body.cost) * 100) : null
  if (body.costPeriod !== undefined) data.costPeriod = body.costPeriod || null
  if (body.documentUrl !== undefined) data.documentUrl = body.documentUrl || null
  if (body.notes !== undefined) data.notes = body.notes || null
  if (body.clientId !== undefined) data.clientId = body.clientId || null

  const updated = await prisma.vendorContract.update({
    where: { id: contractId },
    data,
    include: { client: { select: { id: true, name: true } } },
  })
  return NextResponse.json(updated)
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; contractId: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  const { contractId } = await params
  await prisma.vendorContract.delete({ where: { id: contractId } })
  return NextResponse.json({ ok: true })
}
