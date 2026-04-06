import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

// Revoke (delete) a key — only owner can revoke their own
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth()
  if (error) return error

  const staffUser = await prisma.staffUser.findUnique({ where: { email: session!.user!.email! } })
  if (!staffUser) return NextResponse.json({ error: "User not found" }, { status: 404 })

  const { id } = await params

  const key = await prisma.apiKey.findUnique({ where: { id } })
  if (!key || key.staffUserId !== staffUser.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  await prisma.apiKey.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
