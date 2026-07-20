/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { findMatches } from "@/lib/notes-intake-match"
import { suggestIpCompletions, inferRelations, clientHintsFromIps, ipConsistency } from "@/lib/notes-intake-relate"

// POST /api/notes-intake/[id]/matches  body: { clientId, entities }
// Returns, for the given client + entities:
//   matches        — likely-existing DocHub records (Update vs create)
//   ipCompletions  — partial IPs completable from the client's subnet
//   relations      — credential ↔ asset pairings within this note
//   ipConsistency  — the note's IPs fit the matched client's subnet (affirm)
//   clientHints    — a distinctive subnet points at a *different* client
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  await params // id not needed beyond auth scoping; entities/client come from the body
  const body = (await req.json().catch(() => ({}))) as any
  const clientId: string = body.clientId
  const entities: any[] = body.entities || []

  const relations = inferRelations(entities)
  const clientHints = await clientHintsFromIps(entities, clientId)

  if (!clientId) return NextResponse.json({ matches: [], ipCompletions: [], relations, ipConsistency: null, clientHints })

  const [matches, ipCompletions, consistency] = await Promise.all([
    findMatches(clientId, entities),
    suggestIpCompletions(clientId, entities),
    ipConsistency(clientId, entities),
  ])
  return NextResponse.json({ matches, ipCompletions, relations, ipConsistency: consistency, clientHints })
}
