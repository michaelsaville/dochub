import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/crypto"
import crypto from "crypto"

/** Public endpoint — no auth required. Burns on first successful read. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))

  const note = await prisma.ephemeralNote.findUnique({ where: { id } })
  if (!note || note.burnedAt || note.expiresAt < new Date()) {
    return NextResponse.json({ error: "Note not found or has expired" }, { status: 404 })
  }

  // Verify passphrase if set
  if (note.passphrase) {
    const supplied = body.passphrase?.trim()
    if (!supplied) {
      return NextResponse.json({ error: "Passphrase required", needsPassphrase: true }, { status: 403 })
    }
    const [salt, hash] = note.passphrase.split(":")
    const attempt = crypto.scryptSync(supplied, salt, 64).toString("hex")
    if (attempt !== hash) {
      return NextResponse.json({ error: "Incorrect passphrase", needsPassphrase: true }, { status: 403 })
    }
  }

  // Burn the note
  await prisma.ephemeralNote.update({
    where: { id },
    data: { burnedAt: new Date() },
  })

  const content = decrypt(note.encryptedContent)
  return NextResponse.json({ content })
}

/** HEAD/GET to check if a note exists without burning it */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const note = await prisma.ephemeralNote.findUnique({
    where: { id },
    select: { id: true, burnedAt: true, expiresAt: true, passphrase: true },
  })

  if (!note || note.burnedAt || note.expiresAt < new Date()) {
    return NextResponse.json({ exists: false })
  }

  return NextResponse.json({ exists: true, hasPassphrase: !!note.passphrase })
}
