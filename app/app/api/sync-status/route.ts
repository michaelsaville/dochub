import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function GET() {
  const { error } = await requireAuth()
  if (error) return error
  const rows = await prisma.integrationSyncStatus.findMany({
    orderBy: { key: "asc" },
  })
  return NextResponse.json(rows)
}
