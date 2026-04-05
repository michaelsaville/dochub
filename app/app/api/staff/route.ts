import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function GET() {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const staff = await prisma.staffUser.findMany({
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
    })
    return NextResponse.json(staff)
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch staff" }, { status: 500 })
  }
}
