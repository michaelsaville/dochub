import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-options"
import { prisma } from "@/lib/prisma"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const websites = await prisma.website.findMany({
    where: { clientId: id },
    orderBy: { createdAt: "asc" },
  })
  return NextResponse.json(websites)
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const rawDomain: string = body.domain ?? ""
  if (!rawDomain.trim()) return NextResponse.json({ error: "Domain required" }, { status: 400 })
  const domain = rawDomain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim().toLowerCase()
  const website = await prisma.website.create({
    data: { clientId: id, domain, label: body.label?.trim() || null },
  })
  return NextResponse.json(website)
}
