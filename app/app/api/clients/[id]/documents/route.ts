import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"
import { nextReviewDue, parseInterval } from "@/lib/ticketlink-text"

const include = {
  attachments: { orderBy: { createdAt: "asc" as const } },
  owner: { select: { id: true, name: true, email: true } },
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    if (!scopeAllows(await getClientScope(), id)) return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })
    const docs = await prisma.clientDocument.findMany({
      where: { clientId: id },
      include,
      orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
    })
    return NextResponse.json(docs)
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch documents" }, { status: 500 })
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    if (!scopeAllows(await getClientScope(), id)) return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })
    const body = await req.json()
    const { title, content, category, isPinned, folderId } = body
    if (!title?.trim()) return NextResponse.json({ error: "Title required" }, { status: 400 })
    const reviewIntervalDays = parseInterval(body.reviewIntervalDays) ?? null
    const ownerId = typeof body.ownerId === "string" && body.ownerId ? body.ownerId : null
    const doc = await prisma.clientDocument.create({
      data: {
        clientId: id,
        title: title.trim(),
        content: content?.trim() || null,
        category: category?.trim() || null,
        isPinned: isPinned ?? false,
        folderId: folderId ?? null,
        reviewIntervalDays,
        reviewDueAt: nextReviewDue(reviewIntervalDays),
        ownerId,
      },
      include,
    })
    return NextResponse.json(doc, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: "Failed to create document" }, { status: 500 })
  }
}
