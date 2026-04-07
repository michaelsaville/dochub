import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const links = await prisma.ptpLink.findMany({
      where: { clientId: id },
      include: {
        credential: { select: { id: true, label: true } },
        sideALocation: { select: { id: true, name: true } },
        sideBLocation: { select: { id: true, name: true } },
      },
      orderBy: { name: "asc" },
    })
    return NextResponse.json(links)
  } catch {
    return NextResponse.json({ error: "Failed to fetch PTP links" }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const body = await req.json()
    const {
      name, make, model, frequencyBand, channelWidth, distanceFt,
      managementUrl, credentialId, notes,
      sideAName, sideALocationId, sideAIp, sideAMac, sideASerial, sideASignalDbm, sideATxPower,
      sideBName, sideBLocationId, sideBIp, sideBMac, sideBSerial, sideBSignalDbm, sideBTxPower,
    } = body

    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }

    const link = await prisma.ptpLink.create({
      data: {
        clientId: id,
        name: name.trim(),
        make: make?.trim() || null,
        model: model?.trim() || null,
        frequencyBand: frequencyBand?.trim() || null,
        channelWidth: channelWidth?.trim() || null,
        distanceFt: distanceFt ? Number(distanceFt) : null,
        managementUrl: managementUrl?.trim() || null,
        credentialId: credentialId || null,
        notes: notes?.trim() || null,
        sideAName: sideAName?.trim() || null,
        sideALocationId: sideALocationId || null,
        sideAIp: sideAIp?.trim() || null,
        sideAMac: sideAMac?.trim() || null,
        sideASerial: sideASerial?.trim() || null,
        sideASignalDbm: sideASignalDbm ? Number(sideASignalDbm) : null,
        sideATxPower: sideATxPower?.trim() || null,
        sideBName: sideBName?.trim() || null,
        sideBLocationId: sideBLocationId || null,
        sideBIp: sideBIp?.trim() || null,
        sideBMac: sideBMac?.trim() || null,
        sideBSerial: sideBSerial?.trim() || null,
        sideBSignalDbm: sideBSignalDbm ? Number(sideBSignalDbm) : null,
        sideBTxPower: sideBTxPower?.trim() || null,
      },
      include: {
        credential: { select: { id: true, label: true } },
        sideALocation: { select: { id: true, name: true } },
        sideBLocation: { select: { id: true, name: true } },
      },
    })
    return NextResponse.json(link, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Failed to create PTP link" }, { status: 500 })
  }
}
