import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { encrypt } from "@/lib/crypto"

// PATCH /api/personal-vault/[id] — update.
// `secureNotes` (preferred) or `notes` (back-compat) → encrypted into encryptedNotes.
// Empty string = clear. Undefined = leave as-is.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth()
  if (error) return error

  const userId = (session!.user as any).id as string
  const { id } = await params
  const body = await req.json()
  const { label, username, password, totp, url } = body
  const noteKey = body.secureNotes !== undefined ? "secureNotes"
                : body.notes !== undefined ? "notes"
                : null
  const noteText: string | null = noteKey ? body[noteKey] : null

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
      ...(noteKey !== null && {
        encryptedNotes: noteText && noteText.length > 0 ? encrypt(noteText) : null,
        notes: null, // any write retires the plaintext column
      }),
    },
  })

  return NextResponse.json({
    id: updated.id,
    label: updated.label,
    username: updated.username,
    url: updated.url,
    hasSecureNotes: !!updated.encryptedNotes,
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
