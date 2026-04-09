import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

// GET /api/passkey — list registered passkeys for current user
export async function GET() {
  const { session, error } = await requireAuth()
  if (error) return error

  const userId = (session!.user as any).id as string
  const passkeys = await prisma.staffUserPasskey.findMany({
    where: { staffUserId: userId },
    select: { id: true, name: true, lastUsedAt: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  })
  return NextResponse.json(passkeys)
}
