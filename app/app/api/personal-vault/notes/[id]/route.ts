import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { encrypt } from "@/lib/crypto"

const CATEGORIES = new Set([
  "LICENSE_KEY", "RECOVERY_CODES", "BIOS_FIRMWARE", "API_TOKEN",
  "SOFTWARE_LICENSE", "SSH_KEY", "PROCEDURE", "GENERIC",
])

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth()
  if (error) return error

  const userId = (session!.user as any).id as string
  const { id } = await params
  const { title, body, category, tags, expiryDate, isFavorite } = await req.json()

  const existing = await prisma.personalSecureNote.findFirst({ where: { id, staffUserId: userId } })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const updated = await prisma.personalSecureNote.update({
    where: { id },
    data: {
      ...(title !== undefined && title?.trim() && { title: title.trim() }),
      ...(body !== undefined && body.length > 0 && { encryptedBody: encrypt(body) }),
      ...(category !== undefined && CATEGORIES.has(category) && { category }),
      ...(tags !== undefined && Array.isArray(tags) && {
        tags: tags.filter((t: any) => typeof t === "string" && t.trim()).map((t: string) => t.trim()),
      }),
      ...(isFavorite !== undefined && { isFavorite: !!isFavorite }),
      ...(expiryDate !== undefined && { expiryDate: expiryDate ? new Date(expiryDate) : null }),
    },
  })

  return NextResponse.json({
    id: updated.id,
    title: updated.title,
    category: updated.category,
    tags: updated.tags,
    isFavorite: updated.isFavorite,
    expiryDate: updated.expiryDate,
    hasBody: !!updated.encryptedBody,
    updatedAt: updated.updatedAt,
  })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth()
  if (error) return error

  const userId = (session!.user as any).id as string
  const { id } = await params

  const existing = await prisma.personalSecureNote.findFirst({ where: { id, staffUserId: userId } })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await prisma.personalSecureNote.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
