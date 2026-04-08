import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  const { id } = await params
  const runs = await prisma.runbookRun.findMany({
    where: { runbookId: id },
    orderBy: { startedAt: "desc" },
    take: 30,
    include: {
      client: { select: { id: true, name: true } },
      steps: { select: { completed: true } },
    },
  })
  return NextResponse.json(runs)
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth()
  if (error) return error
  const { id } = await params
  const { clientId } = await req.json()
  if (!clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 })

  const runbook = await prisma.runbook.findUnique({
    where: { id },
    include: { steps: { orderBy: { order: "asc" } } },
  })
  if (!runbook) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const run = await prisma.runbookRun.create({
    data: {
      runbookId: id,
      clientId,
      startedBy: session?.user?.name ?? "unknown",
      steps: {
        create: runbook.steps.map(s => ({ stepId: s.id })),
      },
    },
    include: {
      client: { select: { id: true, name: true } },
      steps: {
        include: { step: true },
        orderBy: { step: { order: "asc" } },
      },
    },
  })
  return NextResponse.json(run, { status: 201 })
}
