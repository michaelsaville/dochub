import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { getClientScope } from "@/lib/client-scope"
import { getAllClientCompleteness } from "@/lib/client-completeness"

// GET /api/clients/completeness
//   default    → { [clientId]: score }            (back-compat for /clients)
//   ?detail=1  → { [clientId]: { score, nextAction, nextActionKey, gaps, type } }
export async function GET(req: Request) {
  const { error } = await requireAuth()
  if (error) return error

  const scope = await getClientScope()
  const all = await getAllClientCompleteness(scope.all ? undefined : scope.clientIds)
  const detail = new URL(req.url).searchParams.get("detail") === "1"

  if (!detail) {
    const scores: Record<string, number> = {}
    for (const [id, r] of Object.entries(all)) scores[id] = r.score
    return NextResponse.json(scores)
  }
  const out: Record<string, { score: number; nextAction: string | null; nextActionKey: string | null; gaps: string[]; type: string }> = {}
  for (const [id, r] of Object.entries(all)) {
    out[id] = { score: r.score, nextAction: r.nextAction, nextActionKey: r.nextActionKey, gaps: r.gaps, type: r.type }
  }
  return NextResponse.json(out)
}
