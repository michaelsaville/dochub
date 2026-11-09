import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { nextReviewDue, parseInterval } from "@/lib/ticketlink-text"

const include = {
  attachments: { orderBy: { createdAt: "asc" as const } },
  owner: { select: { id: true, name: true, email: true } },
}

/** reviewDueAt patch for a save: recompute from the (new or existing) interval; clear when the interval was cleared. */
function reviewDueData(sent: number | null | undefined, existing: number | null, restart: boolean): { reviewDueAt?: Date | null } {
  if (sent === null) return { reviewDueAt: null }
  if (!restart) return {}
  const interval = sent ?? existing
  return interval ? { reviewDueAt: nextReviewDue(interval) } : {}
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
    const body = await req.json()
    const { title, content, category, isPinned, folderId, portalVisible } = body
    // Review cycle: undefined = leave as is, null = clear.
    const reviewIntervalDays = parseInterval(body.reviewIntervalDays)
    const ownerId: string | null | undefined =
      body.ownerId === undefined ? undefined : typeof body.ownerId === "string" && body.ownerId ? body.ownerId : null

    // Snapshot current content before overwriting (only if title or content changed)
    const current = await prisma.clientDocument.findUnique({ where: { id }, select: { title: true, content: true, reviewIntervalDays: true } })
    let edited = false
    if (current) {
      const titleChanged = title?.trim() !== undefined && title.trim() !== current.title
      const contentChanged = content !== undefined && (content?.trim() ?? null) !== current.content
      edited = titleChanged || contentChanged
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
        ...(reviewIntervalDays !== undefined ? { reviewIntervalDays } : {}),
        ...(ownerId !== undefined ? { ownerId } : {}),
        // An edit (or a changed interval) restarts the review clock. Metadata
        // toggles (pin / portal) send the whole doc back and must not.
        ...reviewDueData(
          reviewIntervalDays,
          current?.reviewIntervalDays ?? null,
          edited || (reviewIntervalDays !== undefined && reviewIntervalDays !== (current?.reviewIntervalDays ?? null)),
        ),
      },
      include,
    })
    // Keep a note's attachments in the same folder as the note so library
    // folder counts stay correct (they still render nested under the note).
    if (folderId !== undefined) {
      await prisma.clientAttachment.updateMany({
        where: { documentId: id },
        data: { folderId: folderId ?? null },
      })
    }
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
      // "Mark reviewed" — also restarts the review cycle when one is set.
      data.needsReview = false
      data.reviewedAt = new Date()
      const cur = await prisma.clientDocument.findUnique({ where: { id }, select: { reviewIntervalDays: true } })
      if (cur?.reviewIntervalDays) data.reviewDueAt = nextReviewDue(cur.reviewIntervalDays)
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
