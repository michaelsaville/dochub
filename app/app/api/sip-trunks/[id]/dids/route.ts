import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const { number, designation, extensionId, notes } = await req.json()
    if (!number?.trim()) return NextResponse.json({ error: "Number is required" }, { status: 400 })
    const did = await prisma.sipDid.create({
      data: {
        trunkId: id,
        number: number.trim(),
        designation: designation?.trim() || null,
        extensionId: extensionId || null,
        notes: notes?.trim() || null,
      },
      include: { extension: { select: { id: true, extension: true, displayName: true } } },
    })
    return NextResponse.json(did, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Failed to create DID" }, { status: 500 })
  }
}
