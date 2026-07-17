import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; vlanId: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id, vlanId } = await params
    if (!scopeAllows(await getClientScope(), id)) return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })
    const body = await req.json()
    const { vlanNumber, name, color, description } = body
    const vlan = await prisma.vlan.update({
      where: { id: vlanId },
      data: {
        ...(vlanNumber !== undefined && { vlanNumber: Number(vlanNumber) }),
        ...(name !== undefined && { name: name.trim() }),
        ...(color !== undefined && { color }),
        ...(description !== undefined && { description: description?.trim() || null }),
      },
    })
    return NextResponse.json(vlan)
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "VLAN number already exists for this client" }, { status: 409 })
    }
    return NextResponse.json({ error: "Failed to update VLAN" }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; vlanId: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id, vlanId } = await params
    if (!scopeAllows(await getClientScope(), id)) return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })
    await prisma.vlan.delete({ where: { id: vlanId } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Failed to delete VLAN" }, { status: 500 })
  }
}
