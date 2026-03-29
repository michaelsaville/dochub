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
    const asset = await prisma.asset.findUnique({
      where: { id },
      include: {
        location: {
          include: { client: true }
        },
      },
    })
    if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(asset)
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch asset" }, { status: 500 })
  }
}
