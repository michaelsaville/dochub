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
    const domains = await prisma.adDomain.findMany({
      where: { clientId: id },
      include: {
        groups: { orderBy: { name: "asc" } },
        shares: {
          include: {
            asset: { select: { id: true, name: true, friendlyName: true } },
            permissions: {
              include: { domainGroup: { select: { id: true, name: true } } },
              orderBy: { principal: "asc" },
            },
          },
          orderBy: { name: "asc" },
        },
      },
      orderBy: { name: "asc" },
    })
    return NextResponse.json(domains)
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch domains" }, { status: 500 })
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const body = await req.json()
    const { name, netbiosName, functionalLevel, notes } = body
    if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 })
    const domain = await prisma.adDomain.create({
      data: {
        clientId: id,
        name: name.trim(),
        netbiosName: netbiosName?.trim() || null,
        functionalLevel: functionalLevel?.trim() || null,
        notes: notes?.trim() || null,
      },
      include: { groups: true, shares: { include: { permissions: true } } },
    })
    return NextResponse.json(domain, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: "Failed to create domain" }, { status: 500 })
  }
}
