import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const body = await req.json()
    const { action } = body // "dismiss" | "resolve" | "reopen"

    const data: any = {}
    if (action === "dismiss") {
      data.status = "DISMISSED"
      data.dismissedAt = new Date()
    } else if (action === "resolve") {
      data.status = "RESOLVED"
      data.resolvedAt = new Date()
    } else if (action === "reopen") {
      data.status = "ACTIVE"
      data.dismissedAt = null
      data.resolvedAt = null
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }

    const alarm = await prisma.alarm.update({
      where: { id },
      data,
      include: { client: { select: { id: true, name: true } } },
    })
    return NextResponse.json(alarm)
  } catch (e) {
    return NextResponse.json({ error: "Failed to update alarm" }, { status: 500 })
  }
}
