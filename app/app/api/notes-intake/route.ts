/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { redactEntities, isSealed, openValue, openEntities, SECRET_KEYS_BY_KIND } from "@/lib/notes-intake-secrets"

// Mask only the secret *values* inside a note's text, leaving all other context
// readable. Secrets are extracted from the note, so they appear verbatim in the
// raw text; we blank those substrings (longest first, ≥4 chars to avoid masking
// stray digits) so the reviewer can see what the AI worked with without a reveal.
// The full plaintext still requires the audited /[id]/reveal.
function redactRawText(rawSealed: string, entitiesJson: any): string {
  let text = openValue(rawSealed)
  if (typeof text !== "string") return ""
  const secrets: string[] = []
  for (const e of openEntities(entitiesJson || [])) {
    for (const k of SECRET_KEYS_BY_KIND[e?.kind] || []) {
      const v = e?.fields?.[k]
      if (typeof v === "string" && v.trim().length >= 4) secrets.push(v)
    }
  }
  for (const sv of secrets.sort((a, b) => b.length - a.length)) {
    if (text.includes(sv)) text = text.split(sv).join("••••••")
  }
  return text
}

// GET /api/notes-intake?status=PENDING
// Returns the review queue, the client list, and per-status counts. Entity
// password/TOTP values are redacted; the note's raw text is returned with only
// its secret values masked (see redactRawText) so the source is always
// reviewable. Full secret values are served, audited, via /[id]/reveal.
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

  const safe = suggestions.map((s) => {
    const sealed = isSealed(s.rawText)
    return {
      ...s,
      entitiesJson: redactEntities((s.entitiesJson as any) || []),
      rawText: sealed ? redactRawText(s.rawText, s.entitiesJson) : s.rawText,
      rawTextSealed: sealed,      // true → full plaintext still available via reveal
      rawTextRedacted: sealed,    // the shown text has secret values masked
    }
  })

  const counts: Record<string, number> = {}
  for (const g of grouped) counts[g.status] = g._count._all

  return NextResponse.json({ suggestions: safe, clients, counts })
}
