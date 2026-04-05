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
    const doc = await prisma.clientDocument.findUnique({ where: { id }, include })
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(doc)
  } catch (e) {
    return NextResponse.json({ error: "Failed" }, { status: 500 })
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
    const { title, content, category, isPinned } = await req.json()
    const doc = await prisma.clientDocument.update({
      where: { id },
      data: {
        title: title?.trim(),
        content: content?.trim() ?? null,
        category: category?.trim() ?? null,
        isPinned: isPinned ?? undefined,
      },
      include,
    })
    return NextResponse.json(doc)
  } catch (e) {
    return NextResponse.json({ error: "Failed" }, { status: 500 })
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
    // Delete physical files first
    const doc = await prisma.clientDocument.findUnique({
      where: { id },
      include: { attachments: true },
    })
    if (doc) {
      const { unlink } = await import("fs/promises")
      for (const att of doc.attachments) {
        await unlink(`/uploads/${att.storageName}`).catch(() => {})
      }
    }
    await prisma.clientDocument.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
