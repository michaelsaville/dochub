import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function GET(req: Request) {
  const { error } = await requireAuth()
  if (error) return error

  const url = new URL(req.url)
  const clientId = url.searchParams.get("clientId")
  const status = url.searchParams.get("status") ?? "PENDING"

  const where: {
    status?: "PENDING" | "COMMITTED" | "REJECTED" | "FAILED"
    clientId?: string
  } = {}
  if (status && status !== "ALL") where.status = status as typeof where.status
  if (clientId) where.clientId = clientId

  const items = await prisma.intakeSuggestion.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { client: { select: { id: true, name: true } } },
  })

  return NextResponse.json(items)
}
