import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

/**
 * GET /api/attachments/[id]/versions — the full version chain for a file,
 * newest first. Walks `supersedes` backwards from the current row.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params

    // Find the current (head) row: follow supersededBy forward to the tip.
    const start = await prisma.clientAttachment.findUnique({ where: { id } })
    if (!start) return NextResponse.json({ error: "Not found" }, { status: 404 })
    let head: NonNullable<typeof start> = start
    while (head.supersededById) {
      const next = await prisma.clientAttachment.findUnique({ where: { id: head.supersededById } })
      if (!next) break
      head = next
    }

    // Walk backwards collecting every version.
    const chain: any[] = []
    let cursor: typeof start | null = head
    while (cursor) {
      chain.push({
        id: cursor.id,
        version: cursor.version,
        originalName: cursor.originalName,
        size: cursor.size,
        mimeType: cursor.mimeType,
        createdAt: cursor.createdAt,
        isCurrent: !cursor.supersededById,
      })
      const prev: any = await prisma.clientAttachment.findFirst({
        where: { supersededById: cursor.id },
      })
      cursor = prev
    }

    return NextResponse.json(chain)
  } catch (e) {
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
