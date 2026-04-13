import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { encrypt } from "@/lib/crypto"
import { requireAuth } from "@/lib/auth"
import crypto from "crypto"

export async function POST(req: Request) {
  const { session, error } = await requireAuth()
  if (error) return error

  const { content, expiresInMinutes, passphrase } = await req.json()
  if (!content?.trim()) {
    return NextResponse.json({ error: "Content required" }, { status: 400 })
  }

  const minutes = Math.min(Math.max(expiresInMinutes || 60, 5), 10080) // 5 min to 7 days
  const expiresAt = new Date(Date.now() + minutes * 60000)

  let passphraseHash: string | null = null
  if (passphrase?.trim()) {
    const { scryptSync, randomBytes } = crypto
    const salt = randomBytes(16).toString("hex")
    const hash = scryptSync(passphrase.trim(), salt, 64).toString("hex")
    passphraseHash = `${salt}:${hash}`
  }

  const note = await prisma.ephemeralNote.create({
    data: {
      encryptedContent: encrypt(content.trim()),
      passphrase: passphraseHash,
      expiresAt,
      createdBy: session?.user?.name ?? null,
    },
  })

  const url = `${process.env.NEXTAUTH_URL || "https://dochub.pcc2k.com"}/note/${note.id}`
  return NextResponse.json({ id: note.id, url, expiresAt })
}

export async function GET() {
  const { error } = await requireAuth()
  if (error) return error

  const notes = await prisma.ephemeralNote.findMany({
    where: { burnedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, expiresAt: true, createdBy: true, createdAt: true, passphrase: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  })

  return NextResponse.json(notes.map(n => ({ ...n, hasPassphrase: !!n.passphrase, passphrase: undefined })))
}
