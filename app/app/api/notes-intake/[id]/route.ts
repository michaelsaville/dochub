/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

// PATCH /api/notes-intake/[id]
// Save edits: client match, entities, and/or status. When the client match is
// corrected, record a ClientAlias (learning) mapping the note's folder → client.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth()
  if (error) return error
  const { id } = await params

  const suggestion = await prisma.noteSuggestion.findUnique({ where: { id } })
  if (!suggestion) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const body = (await req.json().catch(() => ({}))) as any
  const data: any = {}

  if (body.matchedClientId !== undefined) {
    data.matchedClientId = body.matchedClientId || null
    data.matchedClientName = body.matchedClientName || null
    if (body.clientCorrected) {
      data.clientCorrected = true

      // Learning: remember folder → client so future ingests pre-match.
      if (body.matchedClientId && suggestion.sourceFolder) {
        const alias = suggestion.sourceFolder.trim().toLowerCase()
        if (alias) {
          await prisma.clientAlias.upsert({
            where: { alias_clientId: { alias, clientId: body.matchedClientId } },
            update: { weight: { increment: 1 }, clientName: body.matchedClientName || null },
            create: {
              alias,
              clientId: body.matchedClientId,
              clientName: body.matchedClientName || null,
              kind: "LEARNED",
              createdBy: session?.user?.email ?? null,
            },
          })
        }
      }
    }
  }

  if (body.entities !== undefined) data.entitiesJson = body.entities
  if (body.status !== undefined) {
    data.status = body.status
    data.reviewedBy = session?.user?.email ?? null
  }

  const updated = await prisma.noteSuggestion.update({ where: { id }, data })
  return NextResponse.json({ suggestion: updated })
}
