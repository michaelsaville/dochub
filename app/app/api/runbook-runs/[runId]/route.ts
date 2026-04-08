import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  const { runId } = await params
  const { status, notes } = await req.json()
  const run = await prisma.runbookRun.update({
    where: { id: runId },
    data: {
      ...(status && { status }),
      ...(notes !== undefined && { notes }),
      ...((status === "COMPLETED" || status === "ABANDONED") && { completedAt: new Date() }),
    },
    include: {
      client: { select: { id: true, name: true } },
      steps: {
        include: { step: true },
        orderBy: { step: { order: "asc" } },
      },
    },
  })
  return NextResponse.json(run)
}
