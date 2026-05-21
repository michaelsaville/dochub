import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { encrypt } from "@/lib/crypto"

// GET /api/personal-vault — list current user's personal credentials (masked)
// Plaintext `notes` is NOT returned — only `hasSecureNotes` bool. Reveal via /[id]/reveal.
export async function GET() {
  const { session, error } = await requireAuth()
  if (error) return error

  const userId = (session!.user as any).id as string
  const items = await prisma.personalCredential.findMany({
    where: { staffUserId: userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      label: true,
      username: true,
      url: true,
      encryptedNotes: true,
      notes: true, // legacy fallback — only used to compute hasSecureNotes
      encryptedTotp: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  return NextResponse.json(items.map(i => ({
    id: i.id,
    label: i.label,
    username: i.username,
    url: i.url,
    hasSecureNotes: !!(i.encryptedNotes || i.notes),
    hasTotp: !!i.encryptedTotp,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
  })))
}

// POST /api/personal-vault — create a personal credential.
// `secureNotes` (preferred) or `notes` (back-compat) — either gets encrypted into encryptedNotes.
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth()
  if (error) return error

  const userId = (session!.user as any).id as string
  const body = await req.json()
  const { label, username, password, totp, url } = body
  const noteText: string | null = (body.secureNotes ?? body.notes ?? null) || null

  if (!label) return NextResponse.json({ error: "label is required" }, { status: 400 })

  const item = await prisma.personalCredential.create({
    data: {
      staffUserId: userId,
      label,
      username: username || null,
      encryptedPassword: password ? encrypt(password) : encrypt(""),
      encryptedTotp: totp ? encrypt(totp) : null,
      url: url || null,
      encryptedNotes: noteText ? encrypt(noteText) : null,
      notes: null, // never write plaintext on new rows
    },
  })

  return NextResponse.json({
    id: item.id,
    label: item.label,
    username: item.username,
    url: item.url,
    hasSecureNotes: !!item.encryptedNotes,
    hasTotp: !!item.encryptedTotp,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }, { status: 201 })
}
