import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { encrypt, decrypt } from "@/lib/crypto"
import { requireAuth } from "@/lib/auth"
import { writeActivity } from "@/lib/activity"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const credentials = await prisma.credential.findMany({
      where: { clientId: id, isRetired: false },
      orderBy: { label: "asc" },
      include: {
        person: { select: { id: true, name: true, email: true } },
      },
    })
    // Return with password decrypted but marked as hidden for initial load
    const safe = credentials.map(c => ({
      ...c,
      encryptedPassword: undefined,
      encryptedTotp: undefined,
      encryptedNotes: undefined,
      hasPassword: !!c.encryptedPassword,
      hasTotp: !!c.encryptedTotp,
      hasSecureNotes: !!c.encryptedNotes,
    }))
    return NextResponse.json(safe)
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch credentials" }, { status: 500 })
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const body = await req.json()
    const { label, username, password, totp, secureNotes, url, notes, personId, expiryDate } = body
    if (!label?.trim()) return NextResponse.json({ error: "Label is required" }, { status: 400 })
    if (!password?.trim()) return NextResponse.json({ error: "Password is required" }, { status: 400 })

    const credential = await prisma.credential.create({
      data: {
        clientId: id,
        label: label.trim(),
        username: username || null,
        encryptedPassword: encrypt(password),
        encryptedTotp: totp?.trim() ? encrypt(totp.trim()) : null,
        encryptedNotes: secureNotes?.trim() ? encrypt(secureNotes.trim()) : null,
        url: url || null,
        notes: notes || null,
        personId: personId || null,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
      },
      include: {
        person: { select: { id: true, name: true, email: true } },
      },
    })

    await writeActivity({
      clientId: id,
      staffUserId: session!.user.id,
      eventType: "CREDENTIAL_ROTATED",
      title: `Credential added: ${label.trim()}`,
    })

    return NextResponse.json({ ...credential, encryptedPassword: undefined, encryptedTotp: undefined, encryptedNotes: undefined, hasPassword: true, hasTotp: !!credential.encryptedTotp, hasSecureNotes: !!credential.encryptedNotes, person: credential.person }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: "Failed to create credential" }, { status: 500 })
  }
}
