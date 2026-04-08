import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error: authError } = await requireAuth()
  if (authError) return authError

  const { id } = await params
  const report = await prisma.customReport.findUnique({ where: { id } })
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(report)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error: authError } = await requireAuth()
  if (authError) return authError

  const { id } = await params
  const { name, description, entity, config } = await req.json()

  const report = await prisma.customReport.update({
    where: { id },
    data: { name, description, entity, config },
  })
  return NextResponse.json(report)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error: authError } = await requireAuth()
  if (authError) return authError

  const { id } = await params
  await prisma.customReport.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
