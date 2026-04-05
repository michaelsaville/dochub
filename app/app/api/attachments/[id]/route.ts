import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { readFile, unlink } from "fs/promises"
import path from "path"

const UPLOAD_DIR = "/uploads"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const att = await prisma.clientAttachment.findUnique({ where: { id } })
    if (!att) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const filePath = path.join(UPLOAD_DIR, att.storageName)
    const buffer = await readFile(filePath)

    return new Response(buffer, {
      headers: {
        "Content-Type": att.mimeType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(att.originalName)}"`,
        "Content-Length": String(att.size),
      },
    })
  } catch (e) {
    return NextResponse.json({ error: "File not found" }, { status: 404 })
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
    const att = await prisma.clientAttachment.findUnique({ where: { id } })
    if (!att) return NextResponse.json({ error: "Not found" }, { status: 404 })

    await unlink(path.join(UPLOAD_DIR, att.storageName)).catch(() => {})
    await prisma.clientAttachment.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
