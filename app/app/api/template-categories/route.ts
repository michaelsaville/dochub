import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function GET() {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const cats = await prisma.templateCategory.findMany({ orderBy: [{ order: "asc" }, { name: "asc" }] })
    return NextResponse.json(cats)
  } catch (e) {
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const { error } = await requireAuth("ADMIN")
  if (error) return error
  try {
    const { name, color, order } = await req.json()
    if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 })
    const cat = await prisma.templateCategory.create({
      data: { name: name.trim(), color: color || "#3d6fff", order: typeof order === "number" ? order : 0 },
    })
    return NextResponse.json(cat, { status: 201 })
  } catch (e: any) {
    if (e?.code === "P2002") return NextResponse.json({ error: "Category already exists" }, { status: 409 })
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
