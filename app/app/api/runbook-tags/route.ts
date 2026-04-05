import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function GET() {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const tags = await prisma.runbookTag.findMany({ orderBy: { name: "asc" } })
    return NextResponse.json(tags)
  } catch (e) {
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { name } = await req.json()
    if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 })
    const tag = await prisma.runbookTag.upsert({
      where: { name: name.trim().toLowerCase() },
      update: {},
      create: { name: name.trim().toLowerCase() },
    })
    return NextResponse.json(tag, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
