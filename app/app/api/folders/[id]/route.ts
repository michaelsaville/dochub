import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const { name, parentId } = await req.json()
    const folder = await prisma.documentFolder.update({
      where: { id },
      data: {
        ...(name?.trim() ? { name: name.trim() } : {}),
        ...(parentId !== undefined ? { parentId: parentId ?? null } : {}),
      },
    })
    return NextResponse.json(folder)
  } catch {
    return NextResponse.json({ error: "Failed to update folder" }, { status: 500 })
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
    const folder = await prisma.documentFolder.findUnique({ where: { id } })
    if (!folder) return NextResponse.json({ error: "Not found" }, { status: 404 })

    // Move child documents and folders up to this folder's parent
    await prisma.clientDocument.updateMany({
      where: { folderId: id },
      data: { folderId: folder.parentId ?? null },
    })
    // Loose library files in this folder reparent too, so they aren't orphaned.
    await prisma.clientAttachment.updateMany({
      where: { folderId: id },
      data: { folderId: folder.parentId ?? null },
    })
    await prisma.documentFolder.updateMany({
      where: { parentId: id },
      data: { parentId: folder.parentId ?? null },
    })
    await prisma.documentFolder.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Failed to delete folder" }, { status: 500 })
  }
}
