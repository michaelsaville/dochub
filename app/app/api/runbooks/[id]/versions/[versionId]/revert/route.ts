import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

// Revert a runbook to an earlier version. Snapshots the current state first so
// the revert itself is undoable.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const { session, error } = await requireAuth()
  if (error) return error
  try {
    const { id, versionId } = await params
    const version = await prisma.runbookVersion.findUnique({ where: { id: versionId } })
    if (!version || version.runbookId !== id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const current = await prisma.runbook.findUnique({ where: { id } })
    if (!current) return NextResponse.json({ error: "Runbook not found" }, { status: 404 })

    // Snapshot current state before reverting
    await prisma.runbookVersion.create({
      data: {
        runbookId: id,
        title: current.title,
        summary: current.summary,
        content: current.content,
        savedBy: session?.user?.name ?? "unknown",
      },
    })

    const updated = await prisma.runbook.update({
      where: { id },
      data: { title: version.title, summary: version.summary, content: version.content },
    })

    return NextResponse.json(updated)
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
