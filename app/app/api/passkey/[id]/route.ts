import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

// DELETE /api/passkey/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth()
  if (error) return error

  const userId = (session!.user as any).id as string
  const { id } = await params

  const pk = await prisma.staffUserPasskey.findFirst({ where: { id, staffUserId: userId } })
  if (!pk) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await prisma.staffUserPasskey.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
