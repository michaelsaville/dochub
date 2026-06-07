import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { storeUploadedFile, isStoreError } from "@/lib/files/store"

/**
 * POST /api/attachments/[id]/replace  (multipart: file)
 *
 * Upload a new version of an existing file. The old row + blob are kept for
 * history; the new attachment inherits the same links, gets version+1, and
 * the old row is marked superseded (so lists show only the current version).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const old = await prisma.clientAttachment.findUnique({ where: { id } })
    if (!old) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (old.supersededById) {
      return NextResponse.json({ error: "This version was already replaced" }, { status: 409 })
    }

    const formData = await req.formData()
    const file = formData.get("file") as File | null
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })

    const result = await storeUploadedFile(
      file,
      {
        clientId: old.clientId,
        documentId: old.documentId,
        assetId: old.assetId,
        vendorId: old.vendorId,
        locationId: old.locationId,
        vendorContractId: old.vendorContractId,
      },
      old.notes,
    )
    if (isStoreError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    // Bump version + link the chain (old.supersededById -> new).
    const updated = await prisma.clientAttachment.update({
      where: { id: result.attachment.id },
      data: { version: old.version + 1, portalVisible: old.portalVisible },
    })
    await prisma.clientAttachment.update({
      where: { id: old.id },
      data: { supersededById: updated.id },
    })

    return NextResponse.json(updated, { status: 201 })
  } catch (e) {
    console.error("[attachments] replace failed", e)
    return NextResponse.json({ error: "Replace failed" }, { status: 500 })
  }
}
