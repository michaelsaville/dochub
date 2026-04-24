import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { writeFile, mkdir } from "fs/promises"
import { existsSync } from "fs"
import path from "path"
import crypto from "crypto"

const UPLOAD_DIR = "/uploads"
const MAX_SIZE = 25 * 1024 * 1024

type EntityType = "asset" | "vendor" | "location" | "vendorContract" | "client"

const ENTITY_TO_FK: Record<EntityType, string> = {
  asset: "assetId",
  vendor: "vendorId",
  location: "locationId",
  vendorContract: "vendorContractId",
  client: "clientId",
}

/**
 * GET /api/attachments?entityType=asset&entityId=xxx
 *
 * List attachments for any entity. The route below (POST) handles
 * uploads scoped to the same shape; document-scoped uploads continue
 * through /api/documents/[id]/attachments for backwards compat.
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
  const rows = await prisma.clientAttachment.findMany({
    where: { [fk]: entityId } as any,
    orderBy: { createdAt: "desc" },
    select: {
      id: true, originalName: true, mimeType: true, size: true,
      notes: true, createdAt: true,
    },
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
 * Resolves clientId from the parent entity (single source of truth for
 * the security boundary) and stores the file under /uploads with a
 * UUID-based name. Original name + mime + size are preserved on the row.
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

    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })
    if (file.size > MAX_SIZE) return NextResponse.json({ error: "File exceeds 25MB limit" }, { status: 400 })
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

    if (!existsSync(UPLOAD_DIR)) await mkdir(UPLOAD_DIR, { recursive: true })
    const ext = path.extname(file.name) || ""
    const storageName = `${crypto.randomUUID()}${ext}`
    const filePath = path.join(UPLOAD_DIR, storageName)
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(filePath, buffer)

    const fk = ENTITY_TO_FK[entityType]
    const data: any = {
      clientId,
      originalName: file.name,
      storageName,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      notes,
    }
    if (entityType !== "client") data[fk] = entityId

    const attachment = await prisma.clientAttachment.create({ data })
    return NextResponse.json(attachment, { status: 201 })
  } catch (e: any) {
    console.error("[attachments] upload failed", e)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}
