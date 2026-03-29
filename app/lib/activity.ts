import { prisma } from "@/lib/prisma"
import { ActivityEventType } from "@prisma/client"

/**
 * Write an activity event. Never throws — failures are logged but don't
 * break the caller. Safe to fire-and-forget alongside any mutation.
 */
export async function writeActivity({
  clientId,
  staffUserId,
  eventType,
  title,
  body,
}: {
  clientId: string
  staffUserId?: string | null
  eventType: ActivityEventType
  title: string
  body?: string | null
}) {
  try {
    await prisma.activityEvent.create({
      data: {
        clientId,
        staffUserId: staffUserId ?? null,
        eventType,
        title,
        body: body ?? null,
      },
    })
  } catch (e) {
    console.error("writeActivity error:", String(e))
  }
}
