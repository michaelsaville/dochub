import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { encrypt } from "@/lib/crypto"

// PATCH /api/personal-vault/[id] — update
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth()
  if (error) return error

  const userId = (session!.user as any).id as string
  const { id } = await params
  const { label, username, password, totp, url, notes } = await req.json()

  const existing = await prisma.personalCredential.findFirst({ where: { id, staffUserId: userId } })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const updated = await prisma.personalCredential.update({
    where: { id },
    data: {
      ...(label !== undefined && { label }),
      ...(username !== undefined && { username: username || null }),
      ...(password !== undefined && password !== "" && { encryptedPassword: encrypt(password) }),
      ...(totp !== undefined && { encryptedTotp: totp ? encrypt(totp) : null }),
      ...(url !== undefined && { url: url || null }),
      ...(notes !== undefined && { notes: notes || null }),
    },
  })

  return NextResponse.json({
    id: updated.id,
    label: updated.label,
    username: updated.username,
    url: updated.url,
    notes: updated.notes,
    hasTotp: !!updated.encryptedTotp,
    updatedAt: updated.updatedAt,
  })
}

// DELETE /api/personal-vault/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth()
  if (error) return error

  const userId = (session!.user as any).id as string
  const { id } = await params

  const existing = await prisma.personalCredential.findFirst({ where: { id, staffUserId: userId } })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await prisma.personalCredential.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
