import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export const dynamic = "force-dynamic"

/** PATCH — toggle active state or rename a grant. ADMIN only. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; grantId: string }> },
) {
  const { error } = await requireAuth("ADMIN")
  if (error) return error
  const { id, grantId } = await params
  const body = await req.json()

  const grant = await prisma.vendorClientGrant.findFirst({ where: { id: grantId, clientId: id } })
  if (!grant) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const data: { isActive?: boolean; label?: string | null } = {}
  if (typeof body.isActive === "boolean") data.isActive = body.isActive
  if (body.label !== undefined) data.label = body.label?.trim() || null

  const updated = await prisma.vendorClientGrant.update({ where: { id: grantId }, data })
  return NextResponse.json(updated)
}

/** DELETE — remove a grant entirely (cascades its shares). ADMIN only. */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; grantId: string }> },
) {
  const { error } = await requireAuth("ADMIN")
  if (error) return error
  const { id, grantId } = await params

  const grant = await prisma.vendorClientGrant.findFirst({ where: { id: grantId, clientId: id } })
  if (!grant) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await prisma.vendorClientGrant.delete({ where: { id: grantId } })
  return NextResponse.json({ ok: true })
}
