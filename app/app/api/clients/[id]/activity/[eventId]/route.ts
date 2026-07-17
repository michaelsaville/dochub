import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; eventId: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id, eventId } = await params
    if (!scopeAllows(await getClientScope(), id)) return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })
    const body = await req.json()
    const event = await prisma.activityEvent.update({
      where: { id: eventId },
      data: {
        ...(body.isPinned !== undefined && { isPinned: body.isPinned }),
        ...(body.dismiss && { dismissedAt: new Date() }),
      },
      include: { staffUser: { select: { id: true, name: true, email: true } } },
    })
    return NextResponse.json(event)
  } catch (e) {
    return NextResponse.json({ error: "Failed to update event" }, { status: 500 })
  }
}
