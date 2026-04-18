import { NextResponse } from "next/server"
import { copyFile } from "fs/promises"
import path from "path"
import crypto from "crypto"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

const UPLOAD_DIR = "/uploads"

const ASSET_CATEGORIES = [
  "NETWORK_GEAR",
  "WIRELESS",
  "SERVER",
  "NAS",
  "COMPUTER",
  "LAPTOP",
  "TABLET",
  "PRINTER",
  "PHONE_SYSTEM",
  "PHONE_ENDPOINT",
  "WEBSITE",
  "VPN",
  "OTHER",
] as const
type AssetCategory = (typeof ASSET_CATEGORIES)[number]
const CAMERA_TYPES = ["IP_POE", "ANALOG", "WIRELESS", "FISHEYE", "PTZ"] as const
type CameraType = (typeof CAMERA_TYPES)[number]

interface NewAssetInput {
  name: string
  category: AssetCategory
  locationId?: string | null // if omitted, we pick the client's first active location
  make?: string | null
  model?: string | null
  serial?: string | null
  ipAddress?: string | null
  macAddress?: string | null
  room?: string | null
}

type CameraAction =
  | { type: "setPhoto"; cameraId: string }
  | {
      type: "updateCamera"
      cameraId: string
      fields: Partial<Record<"name" | "location" | "coverageNotes" | "resolution" | "make" | "model" | "ipAddress" | "macAddress", string | null>>
    }
  | {
      type: "createCamera"
      systemId: string
      fields: {
        name: string
        cameraType: CameraType
        location?: string | null
        coverageNotes?: string | null
        resolution?: string | null
        make?: string | null
        model?: string | null
        ipAddress?: string | null
        macAddress?: string | null
      }
    }

type BulkOperation =
  | {
      kind: "createAssets"
      rows: Array<
        Pick<NewAssetInput, "category" | "name" | "make" | "model" | "serial" | "ipAddress" | "macAddress" | "room"> & {
          locationId?: string | null
        }
      >
    }
  | {
      kind: "updateAssets"
      rows: Array<{
        assetId: string
        fields: Record<string, string | null>
      }>
    }
  | {
      kind: "createCameras"
      systemId: string
      rows: Array<{
        name: string
        cameraType: CameraType
        location?: string | null
        coverageNotes?: string | null
        resolution?: string | null
        make?: string | null
        model?: string | null
        ipAddress?: string | null
        macAddress?: string | null
      }>
    }
  | {
      kind: "createPhoneExtensions"
      systemId: string
      rows: Array<{
        extension: string
        displayName: string
        extensionType: string
        did?: string | null
        voicemailEnabled?: boolean
      }>
    }
  | {
      kind: "createSwitchPorts"
      assetId: string
      rows: Array<{
        portNumber: number
        label?: string | null
        isUplink?: boolean
        isPoe?: boolean
        vlanNumber?: number | null
        notes?: string | null
      }>
    }

interface CommitBody {
  assetId?: string | null
  title?: string
  category?: string | null
  folderId?: string | null
  notes?: string | null
  content?: string | null
  newAsset?: NewAssetInput | null
  cameraAction?: CameraAction | null
  bulkOperation?: BulkOperation | null
}

const MAX_BULK_ROWS = 50

const PHONE_EXTENSION_TYPES = ["USER", "RING_GROUP", "IVR", "VOICEMAIL_ONLY", "FAX", "PAGING", "CONFERENCE"] as const
type PhoneExtensionType = (typeof PHONE_EXTENSION_TYPES)[number]

function bulkWritesEnabled(): boolean {
  const v = process.env.AI_INTAKE_BULK_WRITES
  return v === undefined || v === "" || v === "true" || v === "1"
}

function cameraWritesEnabled(): boolean {
  // Default ON when the flag is unset or "true"; explicitly disable with "false" / "0".
  const v = process.env.AI_INTAKE_CAMERA_WRITES
  return v === undefined || v === "" || v === "true" || v === "1"
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireAuth()
  if (error) return error

  const { id } = await params
  const suggestion = await prisma.intakeSuggestion.findUnique({ where: { id } })
  if (!suggestion) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (suggestion.status === "COMMITTED") {
    return NextResponse.json({ error: "Already committed" }, { status: 409 })
  }

  const body = (await req.json().catch(() => ({}))) as CommitBody
  const clientId = suggestion.clientId

  // Validate assetId belongs to client (if provided and NOT creating a new one).
  if (body.assetId && !body.newAsset) {
    const owns = await prisma.asset.findFirst({
      where: { id: body.assetId, location: { clientId } },
      select: { id: true },
    })
    if (!owns) return NextResponse.json({ error: "assetId does not belong to this client" }, { status: 400 })
  }

  // ---- Step 1: optionally create a new asset and use its id as assetId ----
  let resolvedAssetId: string | null = body.assetId ?? null
  let createdAsset: { id: string; name: string } | null = null

  if (body.newAsset) {
    const { newAsset } = body
    if (!newAsset.name?.trim()) {
      return NextResponse.json({ error: "newAsset.name required" }, { status: 400 })
    }
    if (!ASSET_CATEGORIES.includes(newAsset.category)) {
      return NextResponse.json({ error: "newAsset.category invalid" }, { status: 400 })
    }

    let locationId = newAsset.locationId ?? null
    if (locationId) {
      const loc = await prisma.location.findFirst({
        where: { id: locationId, clientId },
        select: { id: true },
      })
      if (!loc) return NextResponse.json({ error: "locationId does not belong to this client" }, { status: 400 })
    } else {
      const defaultLoc = await prisma.location.findFirst({
        where: { clientId, isActive: true },
        select: { id: true },
        orderBy: { createdAt: "asc" },
      })
      if (!defaultLoc) {
        return NextResponse.json(
          { error: "Client has no active Location to attach the new asset to — pick or create one first." },
          { status: 400 },
        )
      }
      locationId = defaultLoc.id
    }

    const asset = await prisma.asset.create({
      data: {
        locationId,
        name: newAsset.name.trim().slice(0, 200),
        category: newAsset.category,
        make: newAsset.make?.trim() || null,
        model: newAsset.model?.trim() || null,
        serial: newAsset.serial?.trim() || null,
        ipAddress: newAsset.ipAddress?.trim() || null,
        macAddress: newAsset.macAddress?.trim() || null,
        room: newAsset.room?.trim() || null,
        dataSource: "AI_INTAKE",
      },
      select: { id: true, name: true },
    })
    resolvedAssetId = asset.id
    createdAsset = asset
  }

  // ---- Step 2: create the ClientDocument + ClientAttachment ----
  const title = (body.title?.trim() || suggestion.originalName).slice(0, 200)
  const category = body.category?.trim() || null

  const document = await prisma.clientDocument.create({
    data: {
      clientId,
      folderId: body.folderId || null,
      title,
      category,
      content: body.content ?? null,
      assetId: resolvedAssetId,
      needsReview: false,
    },
  })

  const attachment = await prisma.clientAttachment.create({
    data: {
      clientId,
      documentId: document.id,
      originalName: suggestion.originalName,
      storageName: suggestion.storageName,
      mimeType: suggestion.mimeType,
      size: suggestion.size,
      notes: body.notes?.trim() || null,
    },
  })

  // ---- Step 3: camera action (optional, feature-flagged) ----
  let cameraActionResult: { type: string; ok: boolean; error?: string; affectedId?: string } | null = null
  if (body.cameraAction) {
    if (!cameraWritesEnabled()) {
      cameraActionResult = {
        type: body.cameraAction.type,
        ok: false,
        error: "Camera writes disabled (AI_INTAKE_CAMERA_WRITES=false)",
      }
    } else {
      try {
        const action = body.cameraAction
        if (action.type === "setPhoto") {
          const cam = await prisma.camera.findFirst({
            where: { id: action.cameraId, system: { clientId } },
            select: { id: true, photoStorageName: true },
          })
          if (!cam) throw new Error("Camera not found for this client")
          // Duplicate the file so deleting the attachment won't orphan the camera's thumbnail.
          const ext = path.extname(suggestion.storageName) || ""
          const photoStorageName = `${crypto.randomUUID()}${ext}`
          await copyFile(
            path.join(UPLOAD_DIR, suggestion.storageName),
            path.join(UPLOAD_DIR, photoStorageName),
          )
          await prisma.camera.update({
            where: { id: cam.id },
            data: { photoStorageName, photoRefreshedAt: new Date() },
          })
          cameraActionResult = { type: "setPhoto", ok: true, affectedId: cam.id }
        } else if (action.type === "updateCamera") {
          const cam = await prisma.camera.findFirst({
            where: { id: action.cameraId, system: { clientId } },
            select: { id: true },
          })
          if (!cam) throw new Error("Camera not found for this client")
          const data: Record<string, string> = {}
          for (const [k, v] of Object.entries(action.fields)) {
            if (typeof v === "string" && v.trim()) data[k] = v.trim()
          }
          if (Object.keys(data).length === 0) {
            cameraActionResult = { type: "updateCamera", ok: true, affectedId: cam.id }
          } else {
            await prisma.camera.update({ where: { id: cam.id }, data })
            cameraActionResult = { type: "updateCamera", ok: true, affectedId: cam.id }
          }
        } else if (action.type === "createCamera") {
          const sys = await prisma.cameraSystem.findFirst({
            where: { id: action.systemId, clientId },
            select: { id: true },
          })
          if (!sys) throw new Error("CameraSystem not found for this client")
          if (!CAMERA_TYPES.includes(action.fields.cameraType)) {
            throw new Error("cameraType invalid")
          }
          const cam = await prisma.camera.create({
            data: {
              systemId: sys.id,
              name: action.fields.name.trim().slice(0, 120) || "Camera",
              type: action.fields.cameraType,
              location: action.fields.location?.trim() || null,
              coverageNotes: action.fields.coverageNotes?.trim() || null,
              resolution: action.fields.resolution?.trim() || null,
              make: action.fields.make?.trim() || null,
              model: action.fields.model?.trim() || null,
              ipAddress: action.fields.ipAddress?.trim() || null,
              macAddress: action.fields.macAddress?.trim() || null,
            },
            select: { id: true },
          })
          cameraActionResult = { type: "createCamera", ok: true, affectedId: cam.id }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error("Camera action failed:", err)
        cameraActionResult = {
          type: body.cameraAction.type,
          ok: false,
          error: msg,
        }
      }
    }
  }

  // ---- Step 4: bulk operation (optional, feature-flagged) ----
  let bulkResult: { kind: string; ok: number; failed: number; errors: Array<{ rowIndex: number; error: string }> } | null = null
  if (body.bulkOperation) {
    if (!bulkWritesEnabled()) {
      bulkResult = {
        kind: body.bulkOperation.kind,
        ok: 0,
        failed: 0,
        errors: [{ rowIndex: -1, error: "Bulk writes disabled (AI_INTAKE_BULK_WRITES=false)" }],
      }
    } else {
      bulkResult = await executeBulkOperation(body.bulkOperation, clientId)
    }
  }

  const updated = await prisma.intakeSuggestion.update({
    where: { id },
    data: {
      status: "COMMITTED",
      committedDocumentId: document.id,
      committedAttachmentId: attachment.id,
      committedAssetId: resolvedAssetId,
      committedBy: session?.user?.email ?? null,
      committedAt: new Date(),
    },
  })

  return NextResponse.json({
    suggestion: updated,
    document,
    attachment,
    createdAsset,
    cameraActionResult,
    bulkResult,
  })
}

async function executeBulkOperation(
  op: BulkOperation,
  clientId: string,
): Promise<{ kind: string; ok: number; failed: number; errors: Array<{ rowIndex: number; error: string }> }> {
  const result = { kind: op.kind, ok: 0, failed: 0, errors: [] as Array<{ rowIndex: number; error: string }> }
  if (op.rows.length > MAX_BULK_ROWS) {
    return {
      kind: op.kind,
      ok: 0,
      failed: op.rows.length,
      errors: [{ rowIndex: -1, error: `Too many rows (${op.rows.length}); max is ${MAX_BULK_ROWS}.` }],
    }
  }

  if (op.kind === "createAssets") {
    // Resolve a default location once.
    let defaultLocationId: string | null = null
    const defaultLoc = await prisma.location.findFirst({
      where: { clientId, isActive: true },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    })
    defaultLocationId = defaultLoc?.id ?? null
    if (!defaultLocationId) {
      return {
        kind: op.kind,
        ok: 0,
        failed: op.rows.length,
        errors: [{ rowIndex: -1, error: "Client has no active Location." }],
      }
    }
    for (let i = 0; i < op.rows.length; i++) {
      const r = op.rows[i]
      try {
        if (!r.name?.trim()) throw new Error("name required")
        if (!ASSET_CATEGORIES.includes(r.category)) throw new Error("invalid category")
        let locId = r.locationId ?? defaultLocationId
        if (r.locationId) {
          const loc = await prisma.location.findFirst({
            where: { id: r.locationId, clientId },
            select: { id: true },
          })
          if (!loc) throw new Error("locationId not in this client")
          locId = loc.id
        }
        await prisma.asset.create({
          data: {
            locationId: locId,
            name: r.name.trim().slice(0, 200),
            category: r.category,
            make: r.make?.trim() || null,
            model: r.model?.trim() || null,
            serial: r.serial?.trim() || null,
            ipAddress: r.ipAddress?.trim() || null,
            macAddress: r.macAddress?.trim() || null,
            room: r.room?.trim() || null,
            dataSource: "AI_INTAKE_BULK",
          },
        })
        result.ok++
      } catch (err) {
        result.failed++
        result.errors.push({ rowIndex: i, error: err instanceof Error ? err.message : String(err) })
      }
    }
  } else if (op.kind === "updateAssets") {
    for (let i = 0; i < op.rows.length; i++) {
      const r = op.rows[i]
      try {
        const owns = await prisma.asset.findFirst({
          where: { id: r.assetId, location: { clientId } },
          select: { id: true },
        })
        if (!owns) throw new Error("assetId not in this client")
        const data: Record<string, string> = {}
        for (const [k, v] of Object.entries(r.fields)) {
          if (typeof v === "string" && v.trim()) data[k] = v.trim()
        }
        if (Object.keys(data).length === 0) {
          // Nothing to update; count as ok (no-op).
        } else {
          await prisma.asset.update({ where: { id: owns.id }, data })
        }
        result.ok++
      } catch (err) {
        result.failed++
        result.errors.push({ rowIndex: i, error: err instanceof Error ? err.message : String(err) })
      }
    }
  } else if (op.kind === "createCameras") {
    const sys = await prisma.cameraSystem.findFirst({
      where: { id: op.systemId, clientId },
      select: { id: true },
    })
    if (!sys) {
      return {
        kind: op.kind,
        ok: 0,
        failed: op.rows.length,
        errors: [{ rowIndex: -1, error: "systemId not in this client" }],
      }
    }
    for (let i = 0; i < op.rows.length; i++) {
      const r = op.rows[i]
      try {
        if (!r.name?.trim()) throw new Error("name required")
        if (!CAMERA_TYPES.includes(r.cameraType)) throw new Error("invalid cameraType")
        await prisma.camera.create({
          data: {
            systemId: sys.id,
            name: r.name.trim().slice(0, 120),
            type: r.cameraType,
            location: r.location?.trim() || null,
            coverageNotes: r.coverageNotes?.trim() || null,
            resolution: r.resolution?.trim() || null,
            make: r.make?.trim() || null,
            model: r.model?.trim() || null,
            ipAddress: r.ipAddress?.trim() || null,
            macAddress: r.macAddress?.trim() || null,
          },
        })
        result.ok++
      } catch (err) {
        result.failed++
        result.errors.push({ rowIndex: i, error: err instanceof Error ? err.message : String(err) })
      }
    }
  } else if (op.kind === "createPhoneExtensions") {
    const sys = await prisma.phoneSystem.findFirst({
      where: { id: op.systemId, clientId },
      select: { id: true },
    })
    if (!sys) {
      return {
        kind: op.kind,
        ok: 0,
        failed: op.rows.length,
        errors: [{ rowIndex: -1, error: "systemId not in this client" }],
      }
    }
    for (let i = 0; i < op.rows.length; i++) {
      const r = op.rows[i]
      try {
        if (!r.extension?.trim()) throw new Error("extension required")
        if (!r.displayName?.trim()) throw new Error("displayName required")
        const extType = r.extensionType
        if (!PHONE_EXTENSION_TYPES.includes(extType as PhoneExtensionType)) throw new Error("invalid extensionType")
        await prisma.phoneExtension.create({
          data: {
            systemId: sys.id,
            extension: r.extension.trim(),
            displayName: r.displayName.trim().slice(0, 200),
            type: extType as PhoneExtensionType,
            did: r.did?.trim() || null,
            voicemailEnabled: r.voicemailEnabled ?? false,
          },
        })
        result.ok++
      } catch (err) {
        result.failed++
        result.errors.push({ rowIndex: i, error: err instanceof Error ? err.message : String(err) })
      }
    }
  } else if (op.kind === "createSwitchPorts") {
    const asset = await prisma.asset.findFirst({
      where: { id: op.assetId, location: { clientId } },
      select: { id: true },
    })
    if (!asset) {
      return {
        kind: op.kind,
        ok: 0,
        failed: op.rows.length,
        errors: [{ rowIndex: -1, error: "assetId not in this client" }],
      }
    }
    for (let i = 0; i < op.rows.length; i++) {
      const r = op.rows[i]
      try {
        if (!Number.isInteger(r.portNumber) || r.portNumber < 1) throw new Error("invalid portNumber")
        let vlanId: string | null = null
        if (r.vlanNumber != null) {
          const vlan = await prisma.vlan.findFirst({
            where: { clientId, vlanNumber: r.vlanNumber },
            select: { id: true },
          })
          vlanId = vlan?.id ?? null
        }
        await prisma.switchPort.create({
          data: {
            assetId: asset.id,
            portNumber: r.portNumber,
            label: r.label?.trim() || null,
            isUplink: r.isUplink ?? false,
            isPoe: r.isPoe ?? false,
            vlanId,
            notes: r.notes?.trim() || null,
          },
        })
        result.ok++
      } catch (err) {
        result.failed++
        result.errors.push({ rowIndex: i, error: err instanceof Error ? err.message : String(err) })
      }
    }
  }

  return result
}
