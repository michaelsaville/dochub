import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

const include = {
  category: true,
  client: { select: { id: true, name: true } },
  tags: { include: { tag: true } },
  steps: { orderBy: { order: "asc" as const } },
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const runbook = await prisma.runbook.findUnique({ where: { id }, include })
    if (!runbook) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(runbook)
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch runbook" }, { status: 500 })
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const body = await req.json()
    const { title, summary, content, categoryId, clientId, tagIds, steps } = body

    // Replace tags
    await prisma.runbookTagMap.deleteMany({ where: { runbookId: id } })

    // Replace steps
    await prisma.runbookStep.deleteMany({ where: { runbookId: id } })

    const runbook = await prisma.runbook.update({
      where: { id },
      data: {
        title: title?.trim(),
        summary: summary?.trim() ?? null,
        content: content?.trim() ?? null,
        categoryId: categoryId ?? null,
        clientId: clientId ?? null,
        tags: tagIds?.length ? { create: tagIds.map((tid: string) => ({ tagId: tid })) } : undefined,
        steps: steps?.length ? {
          create: steps.map((s: any, i: number) => ({
            order: i + 1,
            title: s.title.trim(),
            notes: s.notes?.trim() || null,
          })),
        } : undefined,
      },
      include,
    })
    return NextResponse.json(runbook)
  } catch (e) {
    return NextResponse.json({ error: "Failed to update runbook" }, { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    await prisma.runbook.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: "Failed to delete runbook" }, { status: 500 })
  }
}
