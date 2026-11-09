import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

/** GET /api/runbooks/review-due — SOPs whose review cycle has lapsed (for /docs/review). */
export async function GET() {
  const { error } = await requireAuth()
  if (error) return error
  const runbooks = await prisma.runbook.findMany({
    where: { reviewDueAt: { lt: new Date() } },
    orderBy: { reviewDueAt: "asc" },
    select: {
      id: true,
      title: true,
      reviewDueAt: true,
      reviewIntervalDays: true,
      updatedAt: true,
      owner: { select: { id: true, name: true, email: true } },
      client: { select: { id: true, name: true } },
    },
  })
  return NextResponse.json(runbooks)
}
