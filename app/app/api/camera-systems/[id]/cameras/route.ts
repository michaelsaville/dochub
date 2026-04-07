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
    const body = await req.json()
    const { name, type, assetId, make, model, ipAddress, macAddress, resolution, location, recordingSchedule, coverageNotes, unifiCameraId, notes } = body
    if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 })
    const camera = await prisma.camera.create({
      data: {
        systemId: id,
        name: name.trim(),
        type: type || "IP_POE",
        assetId: assetId || null,
        make: make?.trim() || null,
        model: model?.trim() || null,
        ipAddress: ipAddress?.trim() || null,
        macAddress: macAddress?.trim() || null,
        resolution: resolution?.trim() || null,
        location: location?.trim() || null,
        recordingSchedule: recordingSchedule || null,
        coverageNotes: coverageNotes?.trim() || null,
        unifiCameraId: unifiCameraId?.trim() || null,
        notes: notes?.trim() || null,
      },
      include: {
        asset: { select: { id: true, name: true, friendlyName: true } },
      },
    })
    return NextResponse.json(camera, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Failed to create camera" }, { status: 500 })
  }
}
