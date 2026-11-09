import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

/**
 * GET /api/documents/flagged — the /docs/review queue.
 *
 * Two reasons a document is in the queue:
 *   - flagged: needsReview = true (by hand, by the staleness cron, or a
 *     TicketHub "write a doc from this ticket" draft)
 *   - overdue: its review cycle (reviewIntervalDays) has lapsed — reviewDueAt < now
 * A doc can be both. "Mark reviewed" (PATCH needsReview:false) clears the flag
 * and restarts the cycle.
 */
export async function GET() {
  const { error } = await requireAuth()
  if (error) return error

  const now = new Date()
  const docs = await prisma.clientDocument.findMany({
    where: { OR: [{ needsReview: true }, { reviewDueAt: { lt: now } }] },
    orderBy: [{ flaggedAt: "asc" }, { reviewDueAt: "asc" }],
    select: {
      id: true,
      title: true,
      category: true,
      needsReview: true,
      reviewNote: true,
      flaggedAt: true,
      flaggedBy: true,
      reviewDueAt: true,
      reviewIntervalDays: true,
      sourceTicketId: true,
      updatedAt: true,
      owner: { select: { id: true, name: true, email: true } },
      client: { select: { id: true, name: true } },
      folder: { select: { id: true, name: true } },
    },
  })

  return NextResponse.json(
    docs.map((d) => ({ ...d, reviewOverdue: !!d.reviewDueAt && d.reviewDueAt < now })),
  )
}
