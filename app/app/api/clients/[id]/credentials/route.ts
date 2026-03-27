import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { encrypt, decrypt } from "@/lib/crypto"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const credentials = await prisma.credential.findMany({
      where: { clientId: id, isRetired: false },
      orderBy: { label: "asc" },
    })
    // Return with password decrypted but marked as hidden for initial load
    const safe = credentials.map(c => ({
      ...c,
      encryptedPassword: undefined,
      hasPassword: !!c.encryptedPassword,
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
  try {
    const { id } = await params
    const body = await req.json()
    const { label, username, password, url, notes } = body
    if (!label?.trim()) return NextResponse.json({ error: "Label is required" }, { status: 400 })
    if (!password?.trim()) return NextResponse.json({ error: "Password is required" }, { status: 400 })

    const credential = await prisma.credential.create({
      data: {
        clientId: id,
        label: label.trim(),
        username: username || null,
        encryptedPassword: encrypt(password),
        url: url || null,
        notes: notes || null,
      },
    })
    return NextResponse.json({ ...credential, encryptedPassword: undefined, hasPassword: true }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: "Failed to create credential" }, { status: 500 })
  }
}
