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

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const body = await req.json()
    const { name, type, notes } = body

    const client = await prisma.client.update({
      where: { id },
      data: {
        ...(name?.trim() && { name: name.trim() }),
        ...(type && { type }),
        ...(notes !== undefined && { notes: notes || null }),
      },
    })
    return NextResponse.json(client)
  } catch (e) {
    return NextResponse.json({ error: "Failed to update client" }, { status: 500 })
  }
}