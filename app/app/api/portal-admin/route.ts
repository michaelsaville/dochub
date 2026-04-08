import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const { error } = await requireAuth()
  if (error) return error

  const users = await prisma.portalUser.findMany({
    include: {
      client: { select: { id: true, name: true } },
      sessions: {
        orderBy: { expiresAt: "desc" },
        take: 1,
        select: { expiresAt: true },
      },
    },
    orderBy: [{ client: { name: "asc" } }, { name: "asc" }],
  })

  return NextResponse.json(users)
}
