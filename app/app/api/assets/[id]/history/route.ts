import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const history = await prisma.fieldHistory.findMany({
      where: { entityType: "asset", entityId: id },
      orderBy: { changedAt: "desc" },
      take: 100,
    })
    return NextResponse.json(history)
  } catch {
    return NextResponse.json({ error: "Failed to fetch history" }, { status: 500 })
  }
}
