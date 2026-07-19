/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { openEntities, openValue } from "@/lib/notes-intake-secrets"
import { logReveal } from "@/lib/reveal-log"

// POST /api/notes-intake/[id]/reveal — decrypt the staged secrets (entity
// passwords/TOTP + note rawText) for one suggestion and return them, writing an
// append-only audit entry (same hash-chained log as vault credential reveals).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth()
  if (error) return error
  const { id } = await params

  const s = await prisma.noteSuggestion.findUnique({ where: { id } })
  if (!s) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const entities = openEntities((s.entitiesJson as any) || [])
  const rawText = openValue(s.rawText)

  try {
    const hdrs = await headers()
    await logReveal({
      entityType: "notes-intake",
      entityId: id,
      source: "staff",
      actor: session?.user?.email ?? null,
      actorId: (session?.user as any)?.id ?? null,
      clientId: s.matchedClientId ?? null,
      ip: hdrs.get("x-forwarded-for") || hdrs.get("x-real-ip"),
      userAgent: hdrs.get("user-agent"),
    })
  } catch (e) { console.error("[notes-intake reveal] audit failed", e) }

  return NextResponse.json({ entities, rawText })
}
