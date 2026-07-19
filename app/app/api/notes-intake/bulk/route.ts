/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"

// POST /api/notes-intake/bulk  body: { action, ids, clientId?, clientName? }
// Bulk skip / reject / purge / assign-client over a set of suggestions. Does not
// bulk-push to the vault (writes stay per-note). Purge also queues source trash.
export async function POST(req: Request) {
  const { session, error } = await requireAuth()
  if (error) return error
  const body = (await req.json().catch(() => ({}))) as any
  const action: string = body.action
  const ids: string[] = Array.isArray(body.ids) ? body.ids.slice(0, 5000) : []
  if (!ids.length) return NextResponse.json({ error: "No rows selected" }, { status: 400 })

  const reviewedBy = session?.user?.email ?? null

  if (action === "assign") {
    if (!body.clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 })
    const scope = await getClientScope()
    if (!scopeAllows(scope, body.clientId)) return NextResponse.json({ error: "That client is outside your access scope" }, { status: 403 })
    const r = await prisma.noteSuggestion.updateMany({ where: { id: { in: ids } }, data: { matchedClientId: body.clientId, matchedClientName: body.clientName || null, clientCorrected: true } })
    return NextResponse.json({ updated: r.count })
  }

  if (action === "skip" || action === "reject") {
    const r = await prisma.noteSuggestion.updateMany({ where: { id: { in: ids } }, data: { status: action === "skip" ? "SKIPPED" : "REJECTED", reviewedBy } })
    return NextResponse.json({ updated: r.count })
  }

  if (action === "purge") {
    const r = await prisma.noteSuggestion.updateMany({ where: { id: { in: ids } }, data: { status: "PURGED", reviewedBy } })
    // Queue source removal for on-disk sources (host reaper handles vault/export).
    await prisma.noteSuggestion.updateMany({ where: { id: { in: ids }, origin: "ingest", sourceAbsPath: { not: null }, sourceState: { not: "TRASHED" } }, data: { sourcePendingOp: "TRASH" } })
    return NextResponse.json({ updated: r.count })
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}
