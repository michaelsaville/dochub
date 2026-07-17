import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    if (!scopeAllows(await getClientScope(), id)) return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })
    const vlans = await prisma.vlan.findMany({
      where: { clientId: id },
      orderBy: { vlanNumber: "asc" },
    })
    return NextResponse.json(vlans)
  } catch {
    return NextResponse.json({ error: "Failed to fetch VLANs" }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    if (!scopeAllows(await getClientScope(), id)) return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })
    const body = await req.json()
    const { vlanNumber, name, color, description } = body
    if (!vlanNumber || !name?.trim()) {
      return NextResponse.json({ error: "VLAN number and name are required" }, { status: 400 })
    }
    const vlan = await prisma.vlan.create({
      data: {
        clientId: id,
        vlanNumber: Number(vlanNumber),
        name: name.trim(),
        color: color || "#6366f1",
        description: description?.trim() || null,
      },
    })
    return NextResponse.json(vlan, { status: 201 })
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "VLAN number already exists for this client" }, { status: 409 })
    }
    return NextResponse.json({ error: "Failed to create VLAN" }, { status: 500 })
  }
}
