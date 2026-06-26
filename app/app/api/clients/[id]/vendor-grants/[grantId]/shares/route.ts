import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export const dynamic = "force-dynamic"

const TYPES = ["CREDENTIAL", "DOCUMENT", "ATTACHMENT"] as const
type ShareType = (typeof TYPES)[number]

/**
 * POST — share one item (credential / document / file) with a vendor grant.
 * Validates the item actually belongs to this client before creating the
 * share, so a share can never point at another client's data. ADMIN only.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; grantId: string }> },
) {
  const { session, error } = await requireAuth("ADMIN")
  if (error) return error
  const { id, grantId } = await params
  const { itemType, itemId, note } = await req.json()

  if (!TYPES.includes(itemType) || !itemId) {
    return NextResponse.json({ error: "valid itemType and itemId required" }, { status: 400 })
  }

  const grant = await prisma.vendorClientGrant.findFirst({ where: { id: grantId, clientId: id } })
  if (!grant) return NextResponse.json({ error: "Grant not found" }, { status: 404 })

  // Ownership check: the item must belong to this same client.
  const owned = await itemBelongsToClient(itemType, itemId, id)
  if (!owned) return NextResponse.json({ error: "Item not found for this client" }, { status: 404 })

  try {
    const share = await prisma.vendorShare.create({
      data: {
        grantId,
        itemType,
        itemId,
        note: note?.trim() || null,
        createdByStaffId: session?.user?.email ?? null,
      },
    })
    return NextResponse.json(share, { status: 201 })
  } catch (e: any) {
    if (e.code === "P2002") return NextResponse.json({ error: "Already shared" }, { status: 409 })
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}

async function itemBelongsToClient(type: ShareType, itemId: string, clientId: string): Promise<boolean> {
  if (type === "CREDENTIAL") {
    return !!(await prisma.credential.findFirst({ where: { id: itemId, clientId }, select: { id: true } }))
  }
  if (type === "DOCUMENT") {
    return !!(await prisma.clientDocument.findFirst({ where: { id: itemId, clientId }, select: { id: true } }))
  }
  return !!(await prisma.clientAttachment.findFirst({ where: { id: itemId, clientId }, select: { id: true } }))
}
