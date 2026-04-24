import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

/**
 * Cross-client recent activity feed for the dashboard "today" view.
 * Returns the last 15 non-dismissed events with the originating staff
 * user and client so the caller can render without extra lookups.
 */
export async function GET() {
  const { error } = await requireAuth()
  if (error) return error
  const events = await prisma.activityEvent.findMany({
    where: { dismissedAt: null },
    orderBy: { createdAt: "desc" },
    take: 15,
    select: {
      id: true,
      eventType: true,
      title: true,
      body: true,
      createdAt: true,
      isPinned: true,
      client: { select: { id: true, name: true } },
      staffUser: { select: { id: true, name: true } },
    },
  })
  return NextResponse.json(events)
}
