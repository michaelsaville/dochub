import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { storeUploadedFile, isStoreError } from "@/lib/files/store"

type EntityType = "asset" | "vendor" | "location" | "vendorContract" | "client"

const ENTITY_TO_FK: Record<EntityType, string> = {
  asset: "assetId",
  vendor: "vendorId",
  location: "locationId",
  vendorContract: "vendorContractId",
  client: "clientId",
}

// Fields surfaced to the UI so it can decide preview affordances without a
// second fetch. mimeType stays for display; detectedMime drives previewing.
const LIST_SELECT = {
  id: true, originalName: true, mimeType: true, detectedMime: true,
  size: true, notes: true, createdAt: true, previewable: true,
  width: true, height: true, scanStatus: true, version: true,
  portalVisible: true, downloadCount: true, folderId: true,
} as const

/**
 * GET /api/attachments?entityType=asset&entityId=xxx
 *   &standalone=1   — (client only) only loose files (no parent doc/asset/etc),
 *                     i.e. the files that live in the merged document library.
 *   &folderId=xxx   — (client only, with standalone) scope to one folder;
 *                     omit for ALL standalone files across folders.
 *
 * List CURRENT (non-superseded) attachments for any entity. The route below
 * (POST) handles uploads scoped to the same shape; document-scoped uploads
 * continue through /api/documents/[id]/attachments for backwards compat.
 */
export async function GET(req: Request) {
  const { error } = await requireAuth()
  if (error) return error
  const url = new URL(req.url)
  const entityType = url.searchParams.get("entityType") as EntityType | null
  const entityId = url.searchParams.get("entityId")
  if (!entityType || !entityId || !(entityType in ENTITY_TO_FK)) {
    return NextResponse.json({ error: "entityType + entityId required" }, { status: 400 })
  }
  const fk = ENTITY_TO_FK[entityType]
  const where: any = { [fk]: entityId, supersededBy: null }

  // The merged library shows LOOSE files. A file is a top-level library row iff
  // it is NOT nested under a document AND it is either deliberately filed in a
  // folder OR not attached to any other entity. This (a) never double-lists a
  // note's attachment, (b) keeps a foldered file even after it gains an assetId
  // (the build-asset outcome — it shows a 🔗 chip), (c) leaves entity-only files
  // on their own tabs.
  if (entityType === "client" && url.searchParams.get("standalone")) {
    where.documentId = null
    where.OR = [
      { folderId: { not: null } },
      { assetId: null, vendorId: null, locationId: null, vendorContractId: null },
    ]
    const folderId = url.searchParams.get("folderId")
    if (folderId) where.folderId = folderId
  }

  const rows = await prisma.clientAttachment.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: LIST_SELECT,
  })
  return NextResponse.json(rows)
}

/**
 * POST /api/attachments  (multipart/form-data)
 *   file        — required
 *   entityType  — one of asset|vendor|location|vendorContract|client
 *   entityId    — id of that entity
 *   notes       — optional caption
 *
 * Resolves clientId from the parent entity (single source of truth for the
 * security boundary) and hands off to the shared store pipeline (size limit,
 * antivirus scan, magic-byte MIME, dimensions, async text extraction).
 */
export async function POST(req: Request) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null
    const entityType = formData.get("entityType") as EntityType | null
    const entityId = formData.get("entityId") as string | null
    const notes = ((formData.get("notes") as string) ?? "").trim() || null
    const folderId = ((formData.get("folderId") as string) ?? "").trim() || null

    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })
    if (!entityType || !entityId || !(entityType in ENTITY_TO_FK)) {
      return NextResponse.json({ error: "entityType + entityId required" }, { status: 400 })
    }

    // Resolve clientId from the parent entity so the security boundary
    // is set even if the FK isn't directly client-scoped.
    let clientId: string | null = null
    if (entityType === "client") clientId = entityId
    else if (entityType === "asset") {
      const a = await prisma.asset.findUnique({
        where: { id: entityId },
        select: { location: { select: { clientId: true } } },
      })
      clientId = a?.location?.clientId ?? null
    } else if (entityType === "vendor") {
      // Vendor is shared across clients — pick the first linked client.
      const v = await prisma.vendor.findUnique({
        where: { id: entityId },
        select: { clients: { select: { id: true }, take: 1 } },
      })
      clientId = v?.clients?.[0]?.id ?? null
    } else if (entityType === "location") {
      const l = await prisma.location.findUnique({
        where: { id: entityId },
        select: { clientId: true },
      })
      clientId = l?.clientId ?? null
    } else if (entityType === "vendorContract") {
      const c = await prisma.vendorContract.findUnique({
        where: { id: entityId },
        select: {
          clientId: true,
          vendor: { select: { clients: { select: { id: true }, take: 1 } } },
        },
      })
      clientId = c?.clientId ?? c?.vendor?.clients?.[0]?.id ?? null
    }
    if (!clientId) {
      return NextResponse.json({ error: "Could not resolve client for entity" }, { status: 400 })
    }

    const fk = ENTITY_TO_FK[entityType]
    const link: any = { clientId }
    if (entityType !== "client") link[fk] = entityId
    // Folders only apply to loose client-library files.
    if (entityType === "client" && folderId) link.folderId = folderId

    const result = await storeUploadedFile(file, link, notes)
    if (isStoreError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.attachment, { status: 201 })
  } catch (e: any) {
    console.error("[attachments] upload failed", e)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}
