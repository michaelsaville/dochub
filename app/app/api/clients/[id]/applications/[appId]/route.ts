import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; appId: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id, appId } = await params
    if (!scopeAllows(await getClientScope(), id)) return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })
    const body = await req.json()
    const { name, vendor, version, supportUrl, notes, personId, vendorId,
            isLob, accessType, rdpHost, rdpPort, rdpGateway, appUrl, totalSeats } = body
    const application = await prisma.application.update({
      where: { id: appId },
      data: {
        ...(name?.trim() && { name: name.trim() }),
        ...(vendor !== undefined && { vendor: vendor?.trim() || null }),
        ...(version !== undefined && { version: version?.trim() || null }),
        ...(supportUrl !== undefined && { supportUrl: supportUrl?.trim() || null }),
        ...(notes !== undefined && { notes: notes?.trim() || null }),
        ...(personId !== undefined && { personId: personId || null }),
        ...(vendorId !== undefined && { vendorId: vendorId || null }),
        ...(isLob !== undefined && { isLob }),
        ...(accessType !== undefined && { accessType: accessType || null }),
        ...(rdpHost !== undefined && { rdpHost: rdpHost?.trim() || null }),
        ...(rdpPort !== undefined && { rdpPort: rdpPort ? parseInt(rdpPort) : null }),
        ...(rdpGateway !== undefined && { rdpGateway: rdpGateway?.trim() || null }),
        ...(appUrl !== undefined && { appUrl: appUrl?.trim() || null }),
        ...(totalSeats !== undefined && { totalSeats: totalSeats ? parseInt(totalSeats) : null }),
      },
      include: {
        person: { select: { id: true, name: true, email: true } },
        vendorRef: { select: { id: true, name: true } },
        _count: { select: { seatAssignments: true } },
      },
    })
    return NextResponse.json(application)
  } catch (e) {
    return NextResponse.json({ error: "Failed to update application" }, { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; appId: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id, appId } = await params
    if (!scopeAllows(await getClientScope(), id)) return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })
    await prisma.application.update({ where: { id: appId }, data: { isActive: false } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: "Failed to delete application" }, { status: 500 })
  }
}
