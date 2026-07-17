import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"
import { prisma } from "@/lib/prisma"

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; websiteId: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  const { id, websiteId } = await params
  if (!scopeAllows(await getClientScope(), id)) return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })
  const body = await req.json()
  const { label, registrar, registrarVendorId, registrarUrl, accountNumber, credentialId, autoRenew, uptimeEnabled, notes } = body
  const updated = await prisma.website.update({
    where: { id: websiteId },
    data: {
      ...(label !== undefined && { label: label?.trim() || null }),
      ...(registrar !== undefined && { registrar: registrar?.trim() || null }),
      ...(registrarVendorId !== undefined && { registrarVendorId: registrarVendorId || null }),
      ...(registrarUrl !== undefined && { registrarUrl: registrarUrl?.trim() || null }),
      ...(accountNumber !== undefined && { accountNumber: accountNumber?.trim() || null }),
      ...(credentialId !== undefined && { credentialId: credentialId || null }),
      ...(autoRenew !== undefined && { autoRenew }),
      ...(uptimeEnabled !== undefined && { uptimeEnabled }),
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
  if (!scopeAllows(await getClientScope(), id)) return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })
  await prisma.website.deleteMany({ where: { id: websiteId, clientId: id } })
  return NextResponse.json({ ok: true })
}
