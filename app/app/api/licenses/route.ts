import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function GET() {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const licenses = await prisma.license.findMany({
      where: { isActive: true },
      include: {
        client: { select: { id: true, name: true } },
        vendorRef: { select: { id: true, name: true } },
        person: { select: { id: true, name: true } },
      },
      orderBy: { renewalDate: "asc" },
    })
    return NextResponse.json(licenses)
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch licenses" }, { status: 500 })
  }
}
