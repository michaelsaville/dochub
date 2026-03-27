import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/crypto"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const credential = await prisma.credential.findUnique({ where: { id } })
    if (!credential) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ password: decrypt(credential.encryptedPassword) })
  } catch (e) {
    return NextResponse.json({ error: "Failed to reveal" }, { status: 500 })
  }
}
