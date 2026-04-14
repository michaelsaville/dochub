import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function GET() {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const [clients, assetCounts] = await Promise.all([
      prisma.client.findMany({
        orderBy: { name: "asc" },
        include: {
          _count: {
            select: {
              locations: true,
              people: true,
              alarms: { where: { status: "ACTIVE" } },
            },
          },
        },
      }),
      prisma.$queryRaw<{ clientId: string; count: bigint }[]>`
        SELECT l."clientId", COUNT(a.id) as count
        FROM "Asset" a
        JOIN "Location" l ON a."locationId" = l.id
        WHERE a.status = 'ACTIVE'
        GROUP BY l."clientId"
      `,
    ])

    const assetMap = Object.fromEntries(
      assetCounts.map(r => [r.clientId, Number(r.count)])
    )

    const enriched = clients.map(c => ({
      ...c,
      assetCount: assetMap[c.id] ?? 0,
    }))

    return NextResponse.json(enriched)
  } catch (e) {
    console.error("GET /api/clients error:", e)
    return NextResponse.json({ error: "Failed to fetch clients" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const body = await req.json()
    const { name, type, notes } = body

    if (!name?.trim()) {
      return NextResponse.json({ error: "Client name is required" }, { status: 400 })
    }

    const client = await prisma.client.create({
      data: {
        name: name.trim(),
        type: type ?? "BUSINESS",
        notes: notes ?? null,
        locations: {
          create: {
            name: "Primary location",
          },
        },
      },
    })

    return NextResponse.json(client, { status: 201 })
  } catch (e) {
    console.error("POST /api/clients error:", e)
    return NextResponse.json({ error: "Failed to create client" }, { status: 500 })
  }
}
