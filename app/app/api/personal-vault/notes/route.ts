import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { encrypt } from "@/lib/crypto"

const CATEGORIES = new Set([
  "LICENSE_KEY", "RECOVERY_CODES", "BIOS_FIRMWARE", "API_TOKEN",
  "SOFTWARE_LICENSE", "SSH_KEY", "PROCEDURE", "GENERIC",
])

// GET /api/personal-vault/notes — list (masked, hasBody bool, no ciphertext leaked)
export async function GET() {
  const { session, error } = await requireAuth()
  if (error) return error

  const userId = (session!.user as any).id as string
  const items = await prisma.personalSecureNote.findMany({
    where: { staffUserId: userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      category: true,
      tags: true,
      isFavorite: true,
      expiryDate: true,
      createdAt: true,
      updatedAt: true,
      encryptedBody: true,
    },
  })

  return NextResponse.json(items.map(i => ({
    id: i.id,
    title: i.title,
    category: i.category,
    tags: i.tags,
    isFavorite: i.isFavorite,
    expiryDate: i.expiryDate,
    hasBody: !!i.encryptedBody,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
  })))
}

// POST /api/personal-vault/notes — create. `body` is the plaintext note content.
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth()
  if (error) return error

  const userId = (session!.user as any).id as string
  const { title, body, category, tags, expiryDate, isFavorite } = await req.json()

  if (!title?.trim()) return NextResponse.json({ error: "title is required" }, { status: 400 })
  if (typeof body !== "string" || body.length === 0) {
    return NextResponse.json({ error: "body is required" }, { status: 400 })
  }
  const cat = CATEGORIES.has(category) ? category : "GENERIC"

  const item = await prisma.personalSecureNote.create({
    data: {
      staffUserId: userId,
      title: title.trim(),
      encryptedBody: encrypt(body),
      category: cat,
      tags: Array.isArray(tags) ? tags.filter((t: any) => typeof t === "string" && t.trim()).map((t: string) => t.trim()) : [],
      isFavorite: !!isFavorite,
      expiryDate: expiryDate ? new Date(expiryDate) : null,
    },
  })

  return NextResponse.json({
    id: item.id,
    title: item.title,
    category: item.category,
    tags: item.tags,
    isFavorite: item.isFavorite,
    expiryDate: item.expiryDate,
    hasBody: true,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }, { status: 201 })
}
