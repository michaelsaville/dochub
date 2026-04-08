import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const folders = await prisma.documentFolder.findMany({
      where: { clientId: id },
      orderBy: [{ order: "asc" }, { name: "asc" }],
    })
    return NextResponse.json(folders)
  } catch {
    return NextResponse.json({ error: "Failed to fetch folders" }, { status: 500 })
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
    const { name, parentId } = await req.json()
    if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 })
    const folder = await prisma.documentFolder.create({
      data: {
        clientId: id,
        name: name.trim(),
        parentId: parentId ?? null,
      },
    })
    return NextResponse.json(folder, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Failed to create folder" }, { status: 500 })
  }
}
