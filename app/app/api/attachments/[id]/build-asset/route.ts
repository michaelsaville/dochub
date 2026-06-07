import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import type { AssetCategory } from "@prisma/client"

const ASSET_CATEGORIES: AssetCategory[] = [
  "NETWORK_GEAR", "WIRELESS", "SERVER", "NAS", "COMPUTER", "LAPTOP", "TABLET",
  "PRINTER", "PHONE_SYSTEM", "PHONE_ENDPOINT", "WEBSITE", "VPN", "OTHER",
]

type Fields = {
  name?: string
  category?: AssetCategory
  make?: string | null
  model?: string | null
  serial?: string | null
  ipAddress?: string | null
  macAddress?: string | null
  room?: string | null
  assetTag?: string | null
  managementUrl?: string | null
  firmwareVersion?: string | null
  portCount?: number | null
  os?: string | null
  ram?: string | null
  cpu?: string | null
  storageCapacity?: string | null
  notes?: string | null
}

const clean = (v: unknown): string | null => (typeof v === "string" ? (v.trim() || null) : null)

function assetData(f: Fields) {
  return {
    make: clean(f.make), model: clean(f.model), serial: clean(f.serial),
    ipAddress: clean(f.ipAddress), macAddress: clean(f.macAddress), room: clean(f.room),
    assetTag: clean(f.assetTag), managementUrl: clean(f.managementUrl),
    firmwareVersion: clean(f.firmwareVersion),
    portCount: typeof f.portCount === "number" ? f.portCount : null,
    os: clean(f.os), ram: clean(f.ram), cpu: clean(f.cpu),
    storageCapacity: clean(f.storageCapacity), notes: clean(f.notes),
  }
}

/**
 * POST /api/attachments/[id]/build-asset
 *   { fields: {...} }              -> create a NEW asset from the reviewed fields
 *   { assetId, fields?: {...} }    -> link to an EXISTING asset (optionally updating its fields)
 *
 * Files the source attachment UNDER the resulting asset (sets assetId) so a
 * config/spec file lives with the device it documents. Pre-fill comes from
 * /api/intake/analyze-existing; this is the human-confirmed write.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const att = await prisma.clientAttachment.findUnique({ where: { id } })
    if (!att) return NextResponse.json({ error: "Attachment not found" }, { status: 404 })

    const body = await req.json()
    const fields: Fields = body.fields ?? {}
    let assetId: string | null = body.assetId ?? null
    let asset: { id: string; name: string } | null = null

    if (assetId) {
      // Link to an existing asset (must belong to this client) + optional update.
      const existing = await prisma.asset.findFirst({
        where: { id: assetId, location: { clientId: att.clientId } },
        select: { id: true, name: true },
      })
      if (!existing) return NextResponse.json({ error: "Asset not found for this client" }, { status: 400 })
      if (body.fields) {
        await prisma.asset.update({ where: { id: assetId }, data: assetData(fields) })
      }
      asset = existing
    } else {
      // Create a new asset under the client's first active location.
      if (!fields.name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 })
      const category = fields.category && ASSET_CATEGORIES.includes(fields.category) ? fields.category : "OTHER"
      const loc = await prisma.location.findFirst({
        where: { clientId: att.clientId, isActive: true },
        select: { id: true },
        orderBy: { createdAt: "asc" },
      })
      if (!loc) {
        return NextResponse.json(
          { error: "Client has no active Location to attach the asset to — create one first." },
          { status: 400 },
        )
      }
      const created = await prisma.asset.create({
        data: {
          locationId: loc.id,
          name: fields.name.trim().slice(0, 200),
          category,
          ...assetData(fields),
          dataSource: "AI_INTAKE",
        },
        select: { id: true, name: true },
      })
      asset = created
      assetId = created.id
    }

    // File the source attachment under the asset (leaves the loose library view;
    // appears on the asset's page). Keep folderId so it can return if unlinked.
    const updated = await prisma.clientAttachment.update({
      where: { id },
      data: { assetId },
      select: { id: true, assetId: true, originalName: true },
    })

    return NextResponse.json({ asset, attachment: updated }, { status: 201 })
  } catch (e) {
    console.error("[build-asset] failed", e)
    return NextResponse.json({ error: "Failed to build asset" }, { status: 500 })
  }
}
