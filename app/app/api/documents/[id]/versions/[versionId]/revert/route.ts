import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const { session, error } = await requireAuth()
  if (error) return error
  try {
    const { id, versionId } = await params
    const version = await prisma.documentVersion.findUnique({ where: { id: versionId } })
    if (!version || version.documentId !== id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const current = await prisma.clientDocument.findUnique({ where: { id } })
    if (!current) return NextResponse.json({ error: "Document not found" }, { status: 404 })

    // Snapshot current state before reverting
    await prisma.documentVersion.create({
      data: {
        documentId: id,
        title: current.title,
        content: current.content,
        savedBy: session?.user?.name ?? "unknown",
      },
    })

    const updated = await prisma.clientDocument.update({
      where: { id },
      data: { title: version.title, content: version.content },
      include: { attachments: { orderBy: { createdAt: "asc" } } },
    })

    return NextResponse.json(updated)
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
