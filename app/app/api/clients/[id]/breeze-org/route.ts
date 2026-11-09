import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

/** PUT { orgId: string | null } — link (or unlink) this client to a Breeze organization. ADMIN. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth("ADMIN")
  if (error) return error
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const orgId = typeof body.orgId === "string" && body.orgId.trim() ? body.orgId.trim() : null
  if (orgId) {
    // One client per org: release it from any other client first.
    await prisma.client.updateMany({ where: { breezeOrgId: orgId, NOT: { id } }, data: { breezeOrgId: null } })
  }
  const c = await prisma.client.update({ where: { id }, data: { breezeOrgId: orgId }, select: { id: true, breezeOrgId: true } })
  return NextResponse.json(c)
}
