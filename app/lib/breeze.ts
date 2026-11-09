import "server-only"

/**
 * Breeze RMM (breeze.pcc2k.com) — read-only partner-API client for DocHub.
 * Breeze replaced Syncro (asset inventory) and FleetHub (agent discovery).
 *
 * Auth: a Partner Service Principal key (`brz_sp_…`) in BREEZE_API_KEY, sent as
 * X-API-Key. Org-level keys (`brz_…`) cannot read devices. Scopes DocHub needs:
 *   organizations:read, devices:read, device-status:read, inventory:read
 * Created at breeze.pcc2k.com/settings/partner-service-principals.
 *
 * Rate limit is per key per hour (Breeze default 600): the nightly sync pulls
 * the whole fleet in a handful of 500-row pages; live status is cached 2 min.
 * Ported from TicketHub's app/lib/breeze.ts — keep the two in step.
 */

export const BREEZE_URL = (process.env.NEXT_PUBLIC_BREEZE_URL || "https://breeze.pcc2k.com").replace(/\/$/, "")
const API_URL = (process.env.BREEZE_API_URL || BREEZE_URL).replace(/\/$/, "")
const STATUS_CACHE_MS = 2 * 60 * 1000

export const breezeConfigured = () => !!process.env.BREEZE_API_KEY
export const breezeDeviceUrl = (id: string) => `${BREEZE_URL}/devices/${encodeURIComponent(id)}`
export const breezeTerminalUrl = (id: string) => `${BREEZE_URL}/remote/terminal/${encodeURIComponent(id)}`

export class BreezeError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
  }
}

type Page<T> = { data?: T[]; hasMore?: boolean; nextCursor?: string | null }

async function getAll<T>(path: string, params: Record<string, string> = {}): Promise<T[]> {
  const key = process.env.BREEZE_API_KEY
  if (!key) throw new BreezeError("Breeze isn't connected (BREEZE_API_KEY not set)")
  const out: T[] = []
  let cursor: string | null | undefined
  for (let page = 0; page < 40; page++) {
    const qs = new URLSearchParams({ ...params, limit: "500", ...(cursor ? { cursor } : {}) })
    const res = await fetch(`${API_URL}/api/v1/partner-api/${path}?${qs}`, {
      headers: { "X-API-Key": key, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) {
      const hint =
        res.status === 401 ? "key rejected" :
        res.status === 403 ? `key is missing the scope for ${path}` :
        res.status === 429 ? "rate limited, try again shortly" : `HTTP ${res.status}`
      throw new BreezeError(`Breeze ${path}: ${hint}`, res.status)
    }
    const body = (await res.json()) as Page<T>
    out.push(...(body.data ?? []))
    if (!body.hasMore || !body.nextCursor) break
    cursor = body.nextCursor
  }
  return out
}

// ── Raw partner-API records (see breeze apps/api/src/routes/partnerApi/schemas.ts) ──
export type BreezeOrg = { id: string; name: string; type?: string }
export type BreezeSite = { id: string; orgId: string; name: string }
export type BreezeDeviceRaw = {
  id: string
  orgId: string
  siteId: string | null
  hostname: string
  displayName: string | null
  type: { os: "windows" | "macos" | "linux"; role: string; virtual: boolean; virtualizationPlatform: string | null }
  operatingSystem: { edition: string; build: string | null; architecture: string }
  installation: { enrolledAt: string }
  hardwareIdentity: { serialNumber: string | null; manufacturer: string | null; model: string | null }
  stableIdentifiers: { assetTag: string | null; inventoryId: string | null; externalId: string | null }
  tags: string[]
}
export type BreezeStatus = { deviceId: string; status: string; lastSeenAt: string | null }
export type BreezeDeviceInventory = {
  subjectType: "device"
  deviceId: string
  orgId: string
  hardware: {
    processor: { model: string | null; cores: number | null; threads: number | null }
    memory: { totalMb: number | null }
  }
  disks: { mountPoint: string; device: string | null; totalGb: number }[]
  interfaces: { id: string; name: string; macAddress: string | null; primary: boolean }[]
  addresses: { interfaceId: string; address: string; family: "ipv4" | "ipv6"; assignment: string; active: boolean }[]
  warranty: { status: string; startsOn: string | null; endsOn: string | null; subscription: boolean } | null
}
export type BreezeNetworkEquipment = {
  id: string
  type: "printer" | "router" | "switch" | "firewall" | "access_point" | "nas" | "website" | "service"
  name: string | null
  address: string | null
  macAddress: string | null
  manufacturer: string | null
  model: string | null
  url: string | null
  source: string
}
export type BreezeSiteInventory = {
  subjectType: "site"
  siteSubjectId: string
  orgId: string
  siteId: string | null
  networkEquipment: BreezeNetworkEquipment[]
}
type InventoryRecord = BreezeDeviceInventory | BreezeSiteInventory

export const fetchOrgs = () => getAll<BreezeOrg>("organizations")
export const fetchDevices = () => getAll<BreezeDeviceRaw>("devices")
export const fetchStatuses = () => getAll<BreezeStatus>("device-status")
export async function fetchInventory(orgId?: string) {
  const rows = await getAll<InventoryRecord>("device-inventory", orgId ? { orgId } : {})
  return {
    devices: rows.filter((r): r is BreezeDeviceInventory => r.subjectType === "device"),
    sites: rows.filter((r): r is BreezeSiteInventory => r.subjectType === "site"),
  }
}

/** Live status for every device, cached for two minutes (status tiles, asset pages). */
let statusCache: { at: number; byId: Map<string, BreezeStatus> } | null = null
export async function liveStatuses(): Promise<Map<string, BreezeStatus>> {
  if (statusCache && Date.now() - statusCache.at < STATUS_CACHE_MS) return statusCache.byId
  const rows = await fetchStatuses()
  statusCache = { at: Date.now(), byId: new Map(rows.map((s) => [s.deviceId, s])) }
  return statusCache.byId
}

/** "Bedford Road Volunteer Fire Dept." and "Bedford Road Fire Dept" → comparable keys. */
export function normalizeOrgName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(inc|llc|ltd|co|corp|corporation|company|the|pa|p a)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

// ── Mapping helpers (pure) ──────────────────────────────────────────────────

/** Breeze device role → DocHub AssetCategory. Laptops come from the model name. */
export function categoryFor(d: BreezeDeviceRaw): string {
  const role = (d.type?.role || "").toLowerCase()
  const model = `${d.hardwareIdentity?.model ?? ""}`.toLowerCase()
  switch (role) {
    case "server": return "SERVER"
    case "nas": return "NAS"
    case "printer": return "PRINTER"
    case "router": case "switch": case "firewall": return "NETWORK_GEAR"
    case "access_point": return "WIRELESS"
    case "phone": return "PHONE_ENDPOINT"
  }
  if (/server/.test(d.operatingSystem?.edition?.toLowerCase() ?? "")) return "SERVER"
  if (/laptop|notebook|latitude|thinkpad|elitebook|probook|macbook|surface (laptop|pro|go)|inspiron 1[45]|xps 1[3-7]|zenbook|vivobook|ideapad/.test(model)) return "LAPTOP"
  return "COMPUTER"
}

const fmtGb = (gb: number) => (gb >= 1000 ? `${Math.round(gb / 100) / 10} TB` : `${Math.round(gb)} GB`)

/** DocHub asset fields from a Breeze device + its inventory. Nulls mean "Breeze doesn't know". */
export function assetFieldsFor(d: BreezeDeviceRaw, inv: BreezeDeviceInventory | undefined) {
  const os = [d.operatingSystem?.edition, d.operatingSystem?.build].filter(Boolean).join(" ").trim() || null
  const cpu = inv?.hardware?.processor?.model?.trim() || null
  const ramMb = inv?.hardware?.memory?.totalMb ?? null
  const ram = ramMb ? `${Math.round(ramMb / 1024)} GB` : null
  const disks = (inv?.disks ?? []).filter((x) => x.totalGb > 0)
  const storageCapacity = disks.length ? disks.map((x) => `${fmtGb(x.totalGb)}${disks.length > 1 ? ` (${x.mountPoint})` : ""}`).join(", ") : null
  const primaryIf = inv?.interfaces?.find((i) => i.primary && i.macAddress) ?? inv?.interfaces?.find((i) => i.macAddress)
  const v4 = (inv?.addresses ?? []).filter((a) => a.active && a.family === "ipv4" && a.assignment !== "link-local" && a.assignment !== "vpn")
  const ip = (primaryIf ? v4.find((a) => a.interfaceId === primaryIf.id) : undefined)?.address ?? v4[0]?.address ?? null
  const warrantyExpiry = inv?.warranty?.endsOn && !inv.warranty.subscription ? new Date(`${inv.warranty.endsOn}T00:00:00Z`) : null
  return {
    name: d.hostname,
    friendlyName: d.displayName && d.displayName !== d.hostname ? d.displayName : null,
    make: d.hardwareIdentity?.manufacturer?.trim() || null,
    model: d.hardwareIdentity?.model?.trim() || null,
    serial: d.hardwareIdentity?.serialNumber?.trim() || null,
    assetTag: d.stableIdentifiers?.assetTag?.trim() || null,
    os,
    cpu,
    ram,
    storageCapacity,
    macAddress: primaryIf?.macAddress ?? null,
    ipAddress: ip,
    warrantyExpiry,
    managementUrl: breezeDeviceUrl(d.id),
  }
}
