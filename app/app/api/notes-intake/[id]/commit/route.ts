/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { commitSuggestion, NoteEntity } from "@/lib/notes-intake"

function writesEnabled(): boolean {
  const v = process.env.NOTES_INTAKE_WRITES
  return v === undefined || v === "" || v === "true" || v === "1"
}

// POST /api/notes-intake/[id]/commit
// Body: { clientId, entities }  — writes the included entities to DocHub.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth()
  if (error) return error
  const { id } = await params

  if (!writesEnabled()) {
    return NextResponse.json({ error: "Notes-intake writes are disabled (NOTES_INTAKE_WRITES=false)" }, { status: 403 })
  }

  const suggestion = await prisma.noteSuggestion.findUnique({ where: { id } })
  if (!suggestion) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (suggestion.status === "COMMITTED") return NextResponse.json({ error: "Already committed" }, { status: 409 })

  const body = (await req.json().catch(() => ({}))) as any
  const clientId: string | undefined = body.clientId || suggestion.matchedClientId || undefined
  if (!clientId) return NextResponse.json({ error: "No client selected for this note" }, { status: 400 })

  const entities: NoteEntity[] = (body.entities ?? (suggestion.entitiesJson as any) ?? []) as NoteEntity[]

  let summary
  try {
    summary = await commitSuggestion({
      clientId,
      entities,
      noteTitle: suggestion.noteTitle,
      staffUserId: (session?.user as any)?.id ?? null,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Commit failed" }, { status: 400 })
  }

  const updated = await prisma.noteSuggestion.update({
    where: { id },
    data: {
      status: "COMMITTED",
      matchedClientId: clientId,
      entitiesJson: entities as any,
      committedSummaryJson: summary as any,
      committedBy: session?.user?.email ?? null,
      committedAt: new Date(),
    },
  })

  return NextResponse.json({ suggestion: updated, summary })
}
