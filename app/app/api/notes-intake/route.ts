import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

// GET /api/notes-intake?status=PENDING
// Returns the review queue for a status, plus the client list (for the picker)
// and per-status counts.
export async function GET(req: Request) {
  const { error } = await requireAuth()
  if (error) return error

  const status = new URL(req.url).searchParams.get("status") || "PENDING"

  const [suggestions, clients, grouped] = await Promise.all([
    prisma.noteSuggestion.findMany({
      where: status === "ALL" ? {} : { status },
      orderBy: [{ matchedClientName: "asc" }, { clientConfidence: "desc" }],
      take: 1000,
    }),
    prisma.client.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.noteSuggestion.groupBy({ by: ["status"], _count: { _all: true } }),
  ])

  const counts: Record<string, number> = {}
  for (const g of grouped) counts[g.status] = g._count._all

  return NextResponse.json({ suggestions, clients, counts })
}
