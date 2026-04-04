import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; websiteId: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  const { id, websiteId } = await params
  const body = await req.json()
  const { label, registrar, registrarUrl, accountNumber, autoRenew, notes } = body
  const updated = await prisma.website.update({
    where: { id: websiteId },
    data: {
      ...(label !== undefined && { label: label?.trim() || null }),
      ...(registrar !== undefined && { registrar: registrar?.trim() || null }),
      ...(registrarUrl !== undefined && { registrarUrl: registrarUrl?.trim() || null }),
      ...(accountNumber !== undefined && { accountNumber: accountNumber?.trim() || null }),
      ...(autoRenew !== undefined && { autoRenew }),
      ...(notes !== undefined && { notes: notes?.trim() || null }),
    },
  })
  return NextResponse.json(updated)
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; websiteId: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  const { id, websiteId } = await params
  await prisma.website.deleteMany({ where: { id: websiteId, clientId: id } })
  return NextResponse.json({ ok: true })
}
