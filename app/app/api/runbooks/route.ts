import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

const include = {
  category: true,
  client: { select: { id: true, name: true } },
  tags: { include: { tag: true } },
  steps: { orderBy: { order: "asc" as const } },
}

export async function GET(req: Request) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { searchParams } = new URL(req.url)
    const clientId = searchParams.get("clientId")
    const categoryId = searchParams.get("categoryId")
    const tag = searchParams.get("tag")
    const search = searchParams.get("search")
    const global = searchParams.get("global")

    const where: any = { isPublished: true }
    if (clientId) where.clientId = clientId
    else if (global === "true") where.clientId = null
    if (categoryId) where.categoryId = categoryId
    if (tag) where.tags = { some: { tag: { name: tag } } }
    if (search) where.title = { contains: search, mode: "insensitive" }

    const runbooks = await prisma.runbook.findMany({
      where,
      include,
      orderBy: { updatedAt: "desc" },
    })
    return NextResponse.json(runbooks)
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch runbooks" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const body = await req.json()
    const { title, summary, content, categoryId, clientId, tagIds, steps } = body
    if (!title?.trim()) return NextResponse.json({ error: "Title is required" }, { status: 400 })

    const runbook = await prisma.runbook.create({
      data: {
        title: title.trim(),
        summary: summary?.trim() || null,
        content: content?.trim() || null,
        categoryId: categoryId || null,
        clientId: clientId || null,
        tags: tagIds?.length ? { create: tagIds.map((id: string) => ({ tagId: id })) } : undefined,
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
    return NextResponse.json(runbook, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: "Failed to create runbook" }, { status: 500 })
  }
}
