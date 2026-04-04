import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const { clientId } = await req.json()
    if (!clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 })
    await prisma.vendor.update({
      where: { id },
      data: { clients: { connect: { id: clientId } } },
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: "Failed to link client" }, { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const { clientId } = await req.json()
    if (!clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 })
    await prisma.vendor.update({
      where: { id },
      data: { clients: { disconnect: { id: clientId } } },
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: "Failed to unlink client" }, { status: 500 })
  }
}
