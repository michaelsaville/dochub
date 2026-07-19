/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"
import { commitSuggestion, NoteEntity } from "@/lib/notes-intake"
import { openEntities, sealEntities, SECRET_KEYS_BY_KIND } from "@/lib/notes-intake-secrets"

// Secure-by-default: writes are OFF unless NOTES_INTAKE_WRITES is explicitly true.
function writesEnabled(): boolean {
  const v = process.env.NOTES_INTAKE_WRITES
  return v === "true" || v === "1"
}

// POST /api/notes-intake/[id]/commit — body: { clientId, entities }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth()
  if (error) return error
  const { id } = await params

  if (!writesEnabled()) {
    return NextResponse.json({ error: "Notes-intake writes are disabled (set NOTES_INTAKE_WRITES=true)" }, { status: 403 })
  }

  const suggestion = await prisma.noteSuggestion.findUnique({ where: { id } })
  if (!suggestion) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (suggestion.status === "COMMITTED") return NextResponse.json({ error: "Already committed" }, { status: 409 })

  const body = (await req.json().catch(() => ({}))) as any
  const clientId: string | undefined = body.clientId || suggestion.matchedClientId || undefined
  if (!clientId) return NextResponse.json({ error: "No client selected for this note" }, { status: 400 })

  const scope = await getClientScope()

  // Reconcile secrets: the draft may carry plaintext (revealed/edited) or blank
  // (masked) secret fields. For any blank secret, fall back to the sealed value
  // from the DB row (opened) matched by eid — so unrevealed secrets still commit.
  const dbOpen = openEntities((suggestion.entitiesJson as any) || [])
  const dbById: Record<string, any> = {}
  for (const e of dbOpen) if (e?.eid) dbById[e.eid] = e
  const draftEntities: any[] = body.entities ?? dbOpen
  const entities: NoteEntity[] = draftEntities.map((de: any) => {
    const keys = SECRET_KEYS_BY_KIND[de.kind] || []
    if (!keys.length) return de
    const db = de.eid ? dbById[de.eid] : null
    const fields = { ...(de.fields || {}) }
    for (const k of keys) if (!fields[k] && db?.fields?.[k]) fields[k] = db.fields[k]
    return { ...de, fields }
  })

  // Per-entity client routing: an entity may target a different client than the
  // note. Group by effective client, scope-check each, commit per group.
  const groups = new Map<string, NoteEntity[]>()
  for (const e of entities) {
    const cid = (e as any).targetClientId || clientId
    if (!groups.has(cid)) groups.set(cid, [])
    groups.get(cid)!.push(e)
  }
  for (const cid of groups.keys()) {
    if (!scopeAllows(scope, cid)) return NextResponse.json({ error: "A target client is outside your access scope" }, { status: 403 })
  }

  const summary: any = { credentials: [], assets: [], phoneExtensions: [], updated: [], locationUpdated: false, skipped: [] }
  const staffUserId = (session?.user as any)?.id ?? null
  try {
    for (const [cid, ents] of groups) {
      const s = await commitSuggestion({ clientId: cid, entities: ents, noteTitle: suggestion.noteTitle, staffUserId })
      summary.credentials.push(...s.credentials)
      summary.assets.push(...s.assets)
      summary.phoneExtensions.push(...s.phoneExtensions)
      summary.updated.push(...s.updated)
      summary.locationUpdated = summary.locationUpdated || s.locationUpdated
      summary.skipped.push(...s.skipped)
    }
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Commit failed" }, { status: 400 })
  }

  // Re-seal secrets before persisting the committed row (never store plaintext).
  const updated = await prisma.noteSuggestion.update({
    where: { id },
    data: {
      status: "COMMITTED",
      matchedClientId: clientId,
      entitiesJson: sealEntities(entities) as any,
      committedSummaryJson: summary as any,
      committedBy: session?.user?.email ?? null,
      committedAt: new Date(),
    },
  })

  return NextResponse.json({ suggestion: updated, summary })
}
