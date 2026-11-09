import { prisma } from "@/lib/prisma"

// Map a network-device type name → AssetType name. Shared by every network
// integration (UniFi, Meraki, SonicWall) and the manual network POST so they
// all classify gear the same way.
export const NETWORK_TYPE_MAP: Record<string, string> = {
  SWITCH: "Switch",
  FIREWALL: "Firewall",
  ROUTER: "Router",
  ACCESS_POINT: "Access Point",
  NAS: "NAS",
  UPS: "UPS",
  MODEM: "Router",
  OTHER: "Other",
}

export type NetworkAssetData = {
  name: string
  assetTypeId: string | null
  make: string | null
  model: string | null
  ipAddress: string | null
  macAddress?: string | null
  serial: string | null
  firmwareVersion: string | null
  managementUrl: string | null
  portCount?: number | null
  notes?: string | null
}

/** Load an AssetType name → id map once per request. */
export async function loadAssetTypeMap(): Promise<Record<string, string>> {
  const types = await prisma.assetType.findMany({ select: { id: true, name: true } })
  return Object.fromEntries(types.map((t) => [t.name, t.id]))
}

/**
 * Upsert a piece of network gear as an Asset — the SINGLE Asset upsert path that
 * UniFi, Meraki, SonicWall, and the manual network POST all share (extracted
 * from the original UniFi sync closure).
 *
 * Finds an existing Asset within the client's locations by MAC, then serial,
 * then managementUrl. Updates it in place (refreshing dataSource) or creates a
 * new ACTIVE Asset under the given/first client location. Returns the asset id.
 * Throws if the client has no location.
 */
export async function upsertNetworkAsset(
  clientId: string,
  locationId: string | null,
  match: { mac?: string | null; serial?: string | null; managementUrl?: string | null },
  assetData: NetworkAssetData,
  dataSource: string,
): Promise<string> {
  const clientLocations = await prisma.location.findMany({
    where: { clientId },
    select: { id: true },
  })
  const locationIds = clientLocations.map((l) => l.id)
  const resolvedLocationId = locationId ?? clientLocations[0]?.id
  if (!resolvedLocationId) throw new Error("No location found for client")

  const mac = match.mac?.toLowerCase() || null

  let existing = mac
    ? await prisma.asset.findFirst({
        where: { macAddress: mac, locationId: { in: locationIds } },
      })
    : null
  if (!existing && match.serial) {
    existing = await prisma.asset.findFirst({
      where: { serial: match.serial, locationId: { in: locationIds } },
    })
  }
  if (!existing && match.managementUrl) {
    existing = await prisma.asset.findFirst({
      where: { managementUrl: match.managementUrl, locationId: { in: locationIds } },
    })
  }

  if (existing) {
    await prisma.asset.update({
      where: { id: existing.id },
      data: { ...assetData, dataSource },
    })
    // Integration syncs record what they changed so the client "What changed"
    // feed can say "FW01: firmware 7.0.1 → 7.0.4 (UniFi sync)". Manual edits
    // already write FieldHistory in their own routes.
    if (dataSource !== "MANUAL") {
      const entries = diffTracked(existing, assetData, dataSource)
      if (entries.length) {
        await prisma.fieldHistory.createMany({ data: entries }).catch(() => {})
      }
    }
    return existing.id
  }
  const created = await prisma.asset.create({
    data: {
      locationId: resolvedLocationId,
      ...assetData,
      dataSource,
      status: "ACTIVE",
    },
  })
  return created.id
}

const TRACKED_FIELDS = ["name", "model", "serial", "ipAddress", "macAddress", "firmwareVersion"] as const
const SYNC_LABEL: Record<string, string> = {
  UNIFI: "UniFi sync", MERAKI: "Meraki sync", SONICWALL: "SonicWall sync",
}

function diffTracked(
  before: Record<string, unknown>,
  after: NetworkAssetData,
  dataSource: string,
) {
  const norm = (f: string, v: unknown) => {
    if (v === null || v === undefined) return null
    const s = String(v).trim()
    if (!s) return null
    return f === "macAddress" ? s.toLowerCase() : s
  }
  const out: { entityType: string; entityId: string; field: string; oldValue: string | null; newValue: string | null; changedBy: string }[] = []
  for (const f of TRACKED_FIELDS) {
    if (!(f in after)) continue
    const nv = norm(f, after[f])
    // A sync that simply doesn't report a value isn't a change.
    if (nv === null) continue
    const ov = norm(f, before[f])
    if (ov === nv) continue
    out.push({
      entityType: "asset",
      entityId: String(before.id),
      field: f,
      oldValue: ov,
      newValue: nv,
      changedBy: SYNC_LABEL[dataSource] ?? `${dataSource} sync`,
    })
  }
  return out
}
