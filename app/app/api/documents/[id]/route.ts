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
  const { session, error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const { title, content, category, isPinned, folderId, portalVisible } = await req.json()

    // Snapshot current content before overwriting (only if title or content changed)
    const current = await prisma.clientDocument.findUnique({ where: { id }, select: { title: true, content: true } })
    if (current) {
      const titleChanged = title?.trim() !== undefined && title.trim() !== current.title
      const contentChanged = content !== undefined && (content?.trim() ?? null) !== current.content
      if (titleChanged || contentChanged) {
        await prisma.documentVersion.create({
          data: {
            documentId: id,
            title: current.title,
            content: current.content,
            savedBy: session?.user?.name ?? "unknown",
          },
        })
      }
    }

    const doc = await prisma.clientDocument.update({
      where: { id },
      data: {
        title: title?.trim(),
        // Only touch content when the caller actually sent it — a metadata-only
        // PATCH (e.g. a pin/portal toggle) must not wipe the body.
        ...(content !== undefined ? { content: content?.trim() ?? null } : {}),
        category: category?.trim() ?? undefined,
        isPinned: isPinned ?? undefined,
        portalVisible: portalVisible ?? undefined,
        ...(folderId !== undefined ? { folderId: folderId ?? null } : {}),
      },
      include,
    })
    return NextResponse.json(doc)
  } catch (e) {
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const body = await req.json()

    const data: any = {}
    if (body.needsReview === true) {
      data.needsReview = true
      data.reviewNote = body.reviewNote || null
      data.flaggedAt = new Date()
      data.flaggedBy = session?.user?.name ?? "unknown"
      data.reviewedAt = null
    } else if (body.needsReview === false) {
      data.needsReview = false
      data.reviewedAt = new Date()
    }

    const doc = await prisma.clientDocument.update({ where: { id }, data, include })
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
