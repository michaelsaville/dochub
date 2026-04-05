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
    const { extension, displayName, type, clientUserId, assetId, credentialId, voicemailCredId, did, voicemailEnabled, notes } = body
    if (!extension?.trim()) return NextResponse.json({ error: "Extension number is required" }, { status: 400 })
    if (!displayName?.trim()) return NextResponse.json({ error: "Display name is required" }, { status: 400 })
    const ext = await prisma.phoneExtension.create({
      data: {
        systemId: id,
        extension: extension.trim(),
        displayName: displayName.trim(),
        type: type || "USER",
        clientUserId: clientUserId || null,
        assetId: assetId || null,
        credentialId: credentialId || null,
        voicemailCredId: voicemailCredId || null,
        did: did?.trim() || null,
        voicemailEnabled: voicemailEnabled ?? false,
        notes: notes?.trim() || null,
      },
      include: {
        clientUser: { select: { id: true, name: true, email: true } },
        asset: { select: { id: true, name: true, friendlyName: true } },
        credential: { select: { id: true, label: true } },
        voicemailCred: { select: { id: true, label: true } },
      },
    })
    return NextResponse.json(ext, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Failed to create extension" }, { status: 500 })
  }
}
