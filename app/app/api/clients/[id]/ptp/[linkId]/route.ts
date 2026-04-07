import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; linkId: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { linkId } = await params
    const body = await req.json()
    const {
      name, make, model, frequencyBand, channelWidth, distanceFt,
      managementUrl, credentialId, notes, isActive,
      sideAName, sideALocationId, sideAIp, sideAMac, sideASerial, sideASignalDbm, sideATxPower,
      sideBName, sideBLocationId, sideBIp, sideBMac, sideBSerial, sideBSignalDbm, sideBTxPower,
    } = body

    const link = await prisma.ptpLink.update({
      where: { id: linkId },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(make !== undefined && { make: make?.trim() || null }),
        ...(model !== undefined && { model: model?.trim() || null }),
        ...(frequencyBand !== undefined && { frequencyBand: frequencyBand?.trim() || null }),
        ...(channelWidth !== undefined && { channelWidth: channelWidth?.trim() || null }),
        ...(distanceFt !== undefined && { distanceFt: distanceFt ? Number(distanceFt) : null }),
        ...(managementUrl !== undefined && { managementUrl: managementUrl?.trim() || null }),
        ...(credentialId !== undefined && { credentialId: credentialId || null }),
        ...(notes !== undefined && { notes: notes?.trim() || null }),
        ...(isActive !== undefined && { isActive }),
        ...(sideAName !== undefined && { sideAName: sideAName?.trim() || null }),
        ...(sideALocationId !== undefined && { sideALocationId: sideALocationId || null }),
        ...(sideAIp !== undefined && { sideAIp: sideAIp?.trim() || null }),
        ...(sideAMac !== undefined && { sideAMac: sideAMac?.trim() || null }),
        ...(sideASerial !== undefined && { sideASerial: sideASerial?.trim() || null }),
        ...(sideASignalDbm !== undefined && { sideASignalDbm: sideASignalDbm ? Number(sideASignalDbm) : null }),
        ...(sideATxPower !== undefined && { sideATxPower: sideATxPower?.trim() || null }),
        ...(sideBName !== undefined && { sideBName: sideBName?.trim() || null }),
        ...(sideBLocationId !== undefined && { sideBLocationId: sideBLocationId || null }),
        ...(sideBIp !== undefined && { sideBIp: sideBIp?.trim() || null }),
        ...(sideBMac !== undefined && { sideBMac: sideBMac?.trim() || null }),
        ...(sideBSerial !== undefined && { sideBSerial: sideBSerial?.trim() || null }),
        ...(sideBSignalDbm !== undefined && { sideBSignalDbm: sideBSignalDbm ? Number(sideBSignalDbm) : null }),
        ...(sideBTxPower !== undefined && { sideBTxPower: sideBTxPower?.trim() || null }),
      },
      include: {
        credential: { select: { id: true, label: true } },
        sideALocation: { select: { id: true, name: true } },
        sideBLocation: { select: { id: true, name: true } },
      },
    })
    return NextResponse.json(link)
  } catch {
    return NextResponse.json({ error: "Failed to update PTP link" }, { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; linkId: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { linkId } = await params
    await prisma.ptpLink.delete({ where: { id: linkId } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Failed to delete PTP link" }, { status: 500 })
  }
}
