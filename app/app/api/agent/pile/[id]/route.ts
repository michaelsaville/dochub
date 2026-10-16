import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { guardPileItem } from "@/lib/pile-agent/auth"

export const dynamic = "force-dynamic"

// GET /api/agent/pile/[id] — the operator's open conversation for a pile item:
// redacted transcript + proposal cards. Never returns history or secrets.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await guardPileItem(id)
  if ("error" in g) return g.error
  const conv = await prisma.agentConversation.findFirst({
    where: { suggestionId: id, staffUserId: g.staff.id, status: "OPEN" },
    orderBy: { createdAt: "desc" },
    select: { id: true, displayJson: true, tokensIn: true, tokensOut: true, cacheRead: true, createdAt: true },
  })
  const proposals = conv
    ? await prisma.agentProposal.findMany({
        where: { conversationId: conv.id, status: { not: "SUPERSEDED" } },
        orderBy: { createdAt: "asc" },
        select: { id: true, kind: true, status: true, displayJson: true, resultJson: true, error: true, rejectReason: true, createdAt: true },
      })
    : []
  return NextResponse.json({ item: g.item, conversation: conv, proposals })
}
