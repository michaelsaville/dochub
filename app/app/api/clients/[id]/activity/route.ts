import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { writeActivity } from "@/lib/activity"

const MANUAL_TYPES = ["TECH_NOTE", "SITE_VISIT", "KNOWN_ISSUE", "PLANNED_MAINTENANCE"] as const

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const events = await prisma.activityEvent.findMany({
      where: { clientId: id },
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
      include: { staffUser: { select: { id: true, name: true, email: true } } },
    })
    return NextResponse.json(events)
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch activity" }, { status: 500 })
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const body = await req.json()
    const { eventType, title, bodyText } = body

    if (!MANUAL_TYPES.includes(eventType)) {
      return NextResponse.json({ error: "Invalid event type" }, { status: 400 })
    }
    if (!title?.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 })
    }

    await writeActivity({
      clientId: id,
      staffUserId: session!.user.id,
      eventType,
      title: title.trim(),
      body: bodyText?.trim() || null,
    })

    const events = await prisma.activityEvent.findMany({
      where: { clientId: id },
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
      include: { staffUser: { select: { id: true, name: true, email: true } } },
    })
    return NextResponse.json(events, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: "Failed to create event" }, { status: 500 })
  }
}
