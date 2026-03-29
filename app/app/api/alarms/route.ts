import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function GET(req: Request) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get("status") // ACTIVE | DISMISSED | RESOLVED | null=all
    const severity = searchParams.get("severity") // INFO | WARNING | CRITICAL | null=all

    const alarms = await prisma.alarm.findMany({
      where: {
        ...(status ? { status: status as any } : {}),
        ...(severity ? { severity: severity as any } : {}),
      },
      orderBy: [
        { severity: "desc" }, // CRITICAL first (alphabetically C > W > I)
        { createdAt: "desc" },
      ],
      include: { client: { select: { id: true, name: true } } },
    })
    return NextResponse.json(alarms)
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch alarms" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const body = await req.json()
    const { clientId, severity, type, message, details } = body
    if (!clientId || !type?.trim() || !message?.trim()) {
      return NextResponse.json({ error: "clientId, type, and message are required" }, { status: 400 })
    }
    const alarm = await prisma.alarm.create({
      data: {
        clientId,
        severity: severity ?? "INFO",
        type: type.trim(),
        message: message.trim(),
        details: details?.trim() || null,
      },
      include: { client: { select: { id: true, name: true } } },
    })
    return NextResponse.json(alarm, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: "Failed to create alarm" }, { status: 500 })
  }
}
