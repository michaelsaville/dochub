import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  const { runId } = await params
  const { stepId, completed, notes } = await req.json()

  const completion = await prisma.runbookStepCompletion.upsert({
    where: { runId_stepId: { runId, stepId } },
    update: {
      completed,
      notes: notes ?? undefined,
      completedAt: completed ? new Date() : null,
    },
    create: {
      runId,
      stepId,
      completed,
      notes: notes ?? null,
      completedAt: completed ? new Date() : null,
    },
  })
  return NextResponse.json(completion)
}
