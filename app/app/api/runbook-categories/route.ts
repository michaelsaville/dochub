import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function GET() {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const cats = await prisma.runbookCategory.findMany({ orderBy: { name: "asc" } })
    return NextResponse.json(cats)
  } catch (e) {
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { name, color } = await req.json()
    if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 })
    const cat = await prisma.runbookCategory.create({
      data: { name: name.trim(), color: color || "#6366f1" },
    })
    return NextResponse.json(cat, { status: 201 })
  } catch (e: any) {
    if (e?.code === "P2002") return NextResponse.json({ error: "Category already exists" }, { status: 409 })
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
