import "server-only"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"
import { isIntakeEnabled } from "@/lib/ai/anthropic"

// Shared guard for /api/agent/pile/* — staff session (TECH+), AI enabled, the
// pile item exists and its matched client (if any) is inside the caller's scope.
export async function guardPileItem(suggestionId: string) {
  const { session, error } = await requireAuth("TECH")
  if (error) return { error }
  const staffId = (session!.user as { id?: string }).id
  if (!staffId) return { error: NextResponse.json({ error: "No staff id on session" }, { status: 401 }) }
  if (!isIntakeEnabled()) return { error: NextResponse.json({ error: "AI is disabled (AI_INTAKE_ENABLED)" }, { status: 503 }) }
  const item = await prisma.noteSuggestion.findUnique({
    where: { id: suggestionId },
    select: { id: true, noteTitle: true, status: true, matchedClientId: true, matchedClientName: true, sourceType: true, sourceFolder: true, sourcePath: true },
  })
  if (!item) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) }
  const scope = await getClientScope()
  if (item.matchedClientId && !scopeAllows(scope, item.matchedClientId)) return { error: NextResponse.json({ error: "Outside your client scope" }, { status: 403 }) }
  return { staff: { id: staffId, email: session!.user?.email ?? null }, scope, item }
}
