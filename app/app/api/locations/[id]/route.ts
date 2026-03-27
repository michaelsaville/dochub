import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const { name, address, city, state, zip, ispName, wanIp, notes } = body

    const location = await prisma.location.update({
      where: { id },
      data: {
        ...(name?.trim() && { name: name.trim() }),
        ...(address !== undefined && { address: address || null }),
        ...(city !== undefined && { city: city || null }),
        ...(state !== undefined && { state: state || null }),
        ...(zip !== undefined && { zip: zip || null }),
        ...(ispName !== undefined && { ispName: ispName || null }),
        ...(wanIp !== undefined && { wanIp: wanIp || null }),
        ...(notes !== undefined && { notes: notes || null }),
      },
    })
    return NextResponse.json(location)
  } catch (e) {
    return NextResponse.json({ error: "Failed to update location" }, { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await prisma.location.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: "Failed to delete location" }, { status: 500 })
  }
}
