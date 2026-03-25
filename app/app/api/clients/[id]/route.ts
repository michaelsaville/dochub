import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const client = await prisma.client.findUnique({
      where: { id },
      include: {
        locations: { orderBy: { name: "asc" } },
        users: { orderBy: { name: "asc" } },
        contacts: { orderBy: { name: "asc" } },
      },
    })
    if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(client)
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch client" }, { status: 500 })
  }
}
