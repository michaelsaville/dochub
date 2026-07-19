/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { redactEntities, isSealed } from "@/lib/notes-intake-secrets"

// GET /api/notes-intake?status=PENDING
// Returns the review queue, the client list, and per-status counts. Secrets are
// stripped from every row here (entity password/TOTP redacted, sealed rawText
// withheld) — they are only served, audited, via /[id]/reveal.
export async function GET(req: Request) {
  const { error } = await requireAuth()
  if (error) return error

  const status = new URL(req.url).searchParams.get("status") || "PENDING"

  const [suggestions, clients, grouped] = await Promise.all([
    prisma.noteSuggestion.findMany({
      where: status === "ALL" ? {} : { status },
      orderBy: [{ matchedClientName: "asc" }, { clientConfidence: "desc" }],
      take: 2000,
    }),
    prisma.client.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.noteSuggestion.groupBy({ by: ["status"], _count: { _all: true } }),
  ])

  const safe = suggestions.map((s) => ({
    ...s,
    entitiesJson: redactEntities((s.entitiesJson as any) || []),
    rawText: isSealed(s.rawText) ? null : s.rawText,
    rawTextSealed: isSealed(s.rawText),
  }))

  const counts: Record<string, number> = {}
  for (const g of grouped) counts[g.status] = g._count._all

  return NextResponse.json({ suggestions: safe, clients, counts })
}
