import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

const include = {
  attachments: { orderBy: { createdAt: "asc" as const } },
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
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
    const { title, content, category, isPinned, folderId } = await req.json()
    if (!title?.trim()) return NextResponse.json({ error: "Title required" }, { status: 400 })
    const doc = await prisma.clientDocument.create({
      data: {
        clientId: id,
        title: title.trim(),
        content: content?.trim() || null,
        category: category?.trim() || null,
        isPinned: isPinned ?? false,
        folderId: folderId ?? null,
      },
      include,
    })
    return NextResponse.json(doc, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: "Failed to create document" }, { status: 500 })
  }
}
