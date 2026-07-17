import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireCronSecret } from "@/lib/cron-auth"

// GET /api/cron/staleness  (Bearer CRON_SECRET)
// Auto-flags client documents that have gone stale — neither reviewed nor
// edited in STALE_DAYS days — into the review queue (/docs/review), so
// freshness stops depending on someone remembering to flag them by hand.
const STALE_DAYS = 180

export async function GET(req: Request) {
  const denied = requireCronSecret(req)
  if (denied) return denied

  const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000)

  const stale = await prisma.clientDocument.findMany({
    where: {
      needsReview: false,
      updatedAt: { lt: cutoff },
      OR: [{ reviewedAt: null }, { reviewedAt: { lt: cutoff } }],
    },
    select: { id: true },
  })

  if (stale.length) {
    await prisma.clientDocument.updateMany({
      where: { id: { in: stale.map((d) => d.id) } },
      data: {
        needsReview: true,
        flaggedAt: new Date(),
        flaggedBy: "system",
        reviewNote: `Auto-flagged: not reviewed or edited in ${STALE_DAYS} days`,
      },
    })
  }

  return NextResponse.json({ flagged: stale.length })
}
