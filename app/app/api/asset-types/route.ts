import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function GET() {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const types = await prisma.assetType.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    })
    return NextResponse.json(types)
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch asset types" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const body = await req.json()
    const { name, description, sortOrder } = body
    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }
    const type = await prisma.assetType.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        sortOrder: sortOrder ? Number(sortOrder) : 0,
      },
    })
    return NextResponse.json(type, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: "Failed to create asset type" }, { status: 500 })
  }
}
