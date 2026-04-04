import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  const { id } = await params
  const websites = await prisma.website.findMany({
    where: { clientId: id },
    orderBy: { createdAt: "asc" },
  })
  return NextResponse.json(websites)
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  const { id } = await params
  const body = await req.json()
  const rawDomain: string = body.domain ?? ""
  if (!rawDomain.trim()) return NextResponse.json({ error: "Domain required" }, { status: 400 })
  const domain = rawDomain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim().toLowerCase()
  const website = await prisma.website.create({
    data: {
      clientId: id,
      domain,
      label: body.label?.trim() || null,
      registrar: body.registrar?.trim() || null,
      registrarUrl: body.registrarUrl?.trim() || null,
      accountNumber: body.accountNumber?.trim() || null,
      autoRenew: body.autoRenew === true,
      notes: body.notes?.trim() || null,
    },
  })
  return NextResponse.json(website)
}
