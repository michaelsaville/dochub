import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function GET() {
  const { error } = await requireAuth()
  if (error) return error

  const docs = await prisma.clientDocument.findMany({
    where: { needsReview: true },
    orderBy: [{ flaggedAt: "asc" }],
    select: {
      id: true,
      title: true,
      category: true,
      reviewNote: true,
      flaggedAt: true,
      flaggedBy: true,
      updatedAt: true,
      client: { select: { id: true, name: true } },
      folder: { select: { id: true, name: true } },
    },
  })

  return NextResponse.json(docs)
}
