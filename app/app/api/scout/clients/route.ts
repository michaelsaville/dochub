import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// Scout → DocHub: lightweight client+location picker source.
//
// Auth: `Authorization: Bearer ${SCOUT_INGEST_TOKEN}`. Same token controls
// /api/scout/ingest — one secret per sister-app integration, rotated
// together.
export async function GET(req: Request) {
  const expected = process.env.SCOUT_INGEST_TOKEN
  if (!expected) {
    return NextResponse.json(
      { error: "Scout integration disabled — SCOUT_INGEST_TOKEN not configured" },
      { status: 503 },
    )
  }
  const auth = req.headers.get("authorization")
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const clients = await prisma.client.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      locations: {
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      },
    },
  })

  return NextResponse.json({ clients })
}
