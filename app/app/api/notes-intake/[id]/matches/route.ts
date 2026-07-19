/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { findMatches } from "@/lib/notes-intake-match"

// POST /api/notes-intake/[id]/matches  body: { clientId, entities }
// Returns likely-existing DocHub records for the given client + entities so the
// reviewer can Update instead of duplicating.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  await params // id not needed beyond auth scoping; entities/client come from the body
  const body = (await req.json().catch(() => ({}))) as any
  const clientId: string = body.clientId
  const entities: any[] = body.entities || []
  if (!clientId) return NextResponse.json({ matches: [] })
  const matches = await findMatches(clientId, entities)
  return NextResponse.json({ matches })
}
