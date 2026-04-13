import { NextResponse, type NextRequest } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/assets/:id/tickets
 *
 * Queries TicketHub's th_tickets table (tickethub schema) for tickets
 * linked to this DocHub asset via dochubAssetId. Returns lightweight
 * ticket info for the asset detail panel.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAuth()
  if (error) return error
  const { id } = await params

  try {
    const tickets: {
      id: string
      ticketNumber: number
      title: string
      status: string
      priority: string
      createdAt: Date
      closedAt: Date | null
    }[] = await prisma.$queryRaw`
      SELECT
        t.id,
        t."ticketNumber",
        t.title,
        t.status,
        t.priority,
        t."createdAt",
        t."closedAt"
      FROM tickethub.th_tickets t
      WHERE t."dochubAssetId" = ${id}
        AND t."deletedAt" IS NULL
      ORDER BY t."createdAt" DESC
      LIMIT 50
    `

    return NextResponse.json(tickets)
  } catch (e) {
    console.error("[api/assets/tickets] cross-schema query failed", e)
    return NextResponse.json([])
  }
}
