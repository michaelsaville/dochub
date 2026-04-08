import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const { error: authError } = await requireAuth()
  if (authError) return authError

  const reports = await prisma.customReport.findMany({
    orderBy: { updatedAt: "desc" },
  })
  return NextResponse.json(reports)
}

export async function POST(req: NextRequest) {
  const { error: authError } = await requireAuth()
  if (authError) return authError

  const { name, description, entity, config } = await req.json()
  if (!name || !entity) return NextResponse.json({ error: "name and entity required" }, { status: 400 })

  const report = await prisma.customReport.create({
    data: { name, description, entity, config: config ?? {} },
  })
  return NextResponse.json(report)
}
