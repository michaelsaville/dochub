/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { writeAudit } from "@/lib/audit-log"
import { guardPileItem } from "@/lib/pile-agent/auth"

// POST /api/agent/pile/[id]/status  { status: "COMMITTED"|"SKIPPED"|"REJECTED"|"PENDING", reason? }
// Finishes (or re-opens) a pile item. Open proposals are superseded when the item
// is finished so nothing stale can be approved later.
const ALLOWED = new Set(["COMMITTED", "SKIPPED", "REJECTED", "PENDING"])

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await guardPileItem(id)
  if ("error" in g) return g.error
  const body = (await req.json().catch(() => ({}))) as any
  const status = String(body.status || "")
  if (!ALLOWED.has(status)) return NextResponse.json({ error: "Bad status" }, { status: 400 })
  const reason = typeof body.reason === "string" ? body.reason.slice(0, 300) : null

  const conv = await prisma.agentConversation.findFirst({ where: { suggestionId: id, staffUserId: g.staff.id, status: "OPEN" }, select: { id: true } })
  const applied = conv ? await prisma.agentProposal.findMany({ where: { conversationId: conv.id, status: "APPLIED" }, select: { resultJson: true } }) : []

  await prisma.noteSuggestion.update({
    where: { id },
    data: {
      status,
      reviewedBy: g.staff.email,
      ...(status === "COMMITTED" ? { committedBy: g.staff.email, committedAt: new Date(), committedSummaryJson: { via: "pile-agent", applied: applied.map((a) => a.resultJson) } as any } : {}),
      ...(reason ? { relevanceReason: reason } : {}),
    },
  })
  if (conv && status !== "PENDING") {
    await prisma.agentProposal.updateMany({ where: { conversationId: conv.id, status: { in: ["PROPOSED", "FAILED"] } }, data: { status: "SUPERSEDED" } })
  }
  await writeAudit({
    action: "agent.pile.status", actorType: "STAFF", actorId: g.staff.id, actorLabel: g.staff.email || "staff",
    entityType: "note_suggestion", entityId: id, clientId: g.item.matchedClientId,
    summary: `pile item "${g.item.noteTitle}" → ${status}`, metadata: { via: "agent", reason, applied: applied.length },
  })
  return NextResponse.json({ ok: true, status })
}
