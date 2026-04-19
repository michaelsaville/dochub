import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import type { AssetCategory } from "@prisma/client"

// POST /api/scout/ingest — PCC Scout hands off discovered assets here.
//
// Body: { locationId: string, assets: ScoutAsset[] }
// Auth: Bearer SCOUT_INGEST_TOKEN (same token as /api/scout/clients).
//
// Dedupe: within the target location, upsert by (macAddress, dataSource='SCOUT').
// NEVER touches a row with dataSource != 'SCOUT' — manually-created and
// Syncro-synced assets are canonical. Re-pushing the same scan is
// idempotent — previously-scout-ingested rows get updated, others get
// created, canonical rows are reported as "skipped" in the response.

interface ScoutAsset {
  scoutId: string // external ref; we record it in notes for traceability
  ip?: string | null
  hostname?: string | null
  mac?: string | null
  vendor?: string | null
  osName?: string | null
  osFamily?: string | null
  deviceType?: string | null
  outlierScore?: number | null
  evidenceJson?: unknown
}

interface IngestBody {
  locationId?: string
  assets?: ScoutAsset[]
}

// Scout's deviceType → DocHub's AssetCategory enum.
// Unknown / unmapped types fall through to OTHER with a note.
const CATEGORY_MAP: Record<string, AssetCategory> = {
  workstation: "COMPUTER",
  server: "SERVER",
  network: "NETWORK_GEAR",
  firewall: "NETWORK_GEAR",
  printer: "PRINTER",
  camera: "OTHER",
  phone: "PHONE_ENDPOINT",
  nas: "NAS",
  ups: "OTHER",
  iot: "OTHER",
}

function deriveName(asset: ScoutAsset): string {
  return (
    asset.hostname?.trim() ||
    asset.ip?.trim() ||
    asset.mac?.trim() ||
    `scout-${asset.scoutId.slice(0, 8)}`
  )
}

function buildNotes(asset: ScoutAsset): string {
  const lines: string[] = [
    `Imported from PCC Scout (scoutId: ${asset.scoutId})`,
  ]
  if (asset.osFamily || asset.osName) {
    lines.push(`OS family: ${asset.osFamily ?? "—"} · OS: ${asset.osName ?? "—"}`)
  }
  if (asset.outlierScore != null) {
    lines.push(`Scout outlier score: ${asset.outlierScore}/5`)
    if (asset.outlierScore >= 3) {
      lines.push("⚠️ Flagged as an outlier — investigate")
    }
  }
  if (asset.deviceType && !(asset.deviceType in CATEGORY_MAP)) {
    lines.push(`Original deviceType: ${asset.deviceType} (mapped to OTHER)`)
  }
  return lines.join("\n")
}

export async function POST(req: NextRequest) {
  const expected = process.env.SCOUT_INGEST_TOKEN
  if (!expected) {
    return NextResponse.json(
      { error: "Scout integration disabled — SCOUT_INGEST_TOKEN not configured" },
      { status: 503 },
    )
  }
  const auth = req.headers.get("authorization")
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: IngestBody
  try {
    body = (await req.json()) as IngestBody
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 })
  }

  const locationId = body.locationId?.trim()
  const assets = body.assets
  if (!locationId || !Array.isArray(assets)) {
    return NextResponse.json(
      { error: "locationId and assets[] required" },
      { status: 400 },
    )
  }

  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: { id: true, clientId: true },
  })
  if (!location) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 })
  }

  let created = 0
  let updated = 0
  let skippedCanonical = 0
  const errors: Array<{ scoutId: string; error: string }> = []

  for (const a of assets) {
    try {
      const category = a.deviceType ? CATEGORY_MAP[a.deviceType] ?? "OTHER" : "OTHER"
      const data = {
        locationId,
        name: deriveName(a),
        category,
        make: a.vendor ?? null,
        os: a.osName ?? null,
        ipAddress: a.ip ?? null,
        macAddress: a.mac ?? null,
        notes: buildNotes(a),
        dataSource: "SCOUT",
      }

      if (a.mac) {
        // Match against any asset at this location with this MAC, regardless
        // of source, so we can detect and skip canonical rows.
        const existing = await prisma.asset.findFirst({
          where: { locationId, macAddress: a.mac },
          select: { id: true, dataSource: true },
        })
        if (existing) {
          if (existing.dataSource !== "SCOUT") {
            skippedCanonical++
            continue
          }
          await prisma.asset.update({ where: { id: existing.id }, data })
          updated++
          continue
        }
      }

      await prisma.asset.create({ data })
      created++
    } catch (err) {
      errors.push({
        scoutId: a.scoutId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return NextResponse.json({
    locationId,
    clientId: location.clientId,
    created,
    updated,
    skippedCanonical,
    errors,
  })
}
