import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function GET() {
  const { error } = await requireAuth()
  if (error) return error

  const runs = await prisma.runbookRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 100,
    include: {
      runbook: { select: { id: true, title: true } },
      client:  { select: { id: true, name: true } },
      steps:   { select: { completed: true } },
    },
  })

  return NextResponse.json(runs)
}
