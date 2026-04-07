import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const body = await req.json()
    const { standardFields, showSwitchPanel, showCameraPhoto, customFieldDefs } = body

    const template = await prisma.assetTypeTemplate.upsert({
      where: { assetTypeId: id },
      create: {
        assetTypeId: id,
        standardFields: standardFields ?? [],
        showSwitchPanel: showSwitchPanel ?? false,
        showCameraPhoto: showCameraPhoto ?? false,
        customFieldDefs: customFieldDefs ?? [],
      },
      update: {
        standardFields: standardFields ?? [],
        showSwitchPanel: showSwitchPanel ?? false,
        showCameraPhoto: showCameraPhoto ?? false,
        customFieldDefs: customFieldDefs ?? [],
      },
    })
    return NextResponse.json(template)
  } catch {
    return NextResponse.json({ error: "Failed to save template" }, { status: 500 })
  }
}
