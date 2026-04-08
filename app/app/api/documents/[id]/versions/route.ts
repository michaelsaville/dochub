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
    const versions = await prisma.documentVersion.findMany({
      where: { documentId: id },
      orderBy: { savedAt: "desc" },
      take: 50,
      select: { id: true, title: true, savedAt: true, savedBy: true },
    })
    return NextResponse.json(versions)
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
