import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

// DELETE /api/portal-users/[id]/sessions — "Kick" a portal user by purging only
// their active sessions, leaving the account enabled. Replaces the old
// disable→re-enable dance, which stranded the user disabled if the second
// (re-enable) call failed. (B31)
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth("ADMIN")
  if (error) return error
  try {
    const { id } = await params
    await prisma.portalSession.deleteMany({ where: { portalUserId: id } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
