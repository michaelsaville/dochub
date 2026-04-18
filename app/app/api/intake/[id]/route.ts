import { NextResponse } from "next/server"
import { unlink } from "fs/promises"
import path from "path"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

const UPLOAD_DIR = "/uploads"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAuth()
  if (error) return error
  const { id } = await params
  const item = await prisma.intakeSuggestion.findUnique({
    where: { id },
    include: { client: { select: { id: true, name: true } } },
  })
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(item)
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAuth()
  if (error) return error
  const { id } = await params
  const item = await prisma.intakeSuggestion.findUnique({ where: { id } })
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Only delete the on-disk file if it hasn't been committed (committed files
  // are referenced by a ClientAttachment that owns the lifecycle now).
  if (item.status !== "COMMITTED") {
    await unlink(path.join(UPLOAD_DIR, item.storageName)).catch(() => {})
  }

  await prisma.intakeSuggestion.update({
    where: { id },
    data: { status: "REJECTED" },
  })
  return NextResponse.json({ success: true })
}
