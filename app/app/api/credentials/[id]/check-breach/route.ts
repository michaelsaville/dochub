import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/crypto"
import { requireAuth } from "@/lib/auth"
import { checkPasswordBreach } from "@/lib/hibp"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const credential = await prisma.credential.findUnique({ where: { id } })
    if (!credential) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const password = decrypt(credential.encryptedPassword)
    const count = await checkPasswordBreach(password)

    return NextResponse.json({ count, compromised: count > 0 })
  } catch {
    return NextResponse.json({ error: "Failed to check" }, { status: 500 })
  }
}
