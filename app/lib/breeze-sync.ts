import "server-only"
import { prisma } from "@/lib/prisma"
import { normalizeMac, normalizeSerial } from "@/lib/asset-identity"
import {
  fetchOrgs, fetchDevices, fetchStatuses, fetchInventory, normalizeOrgName, categoryFor, assetFieldsFor,
  type BreezeOrg, type BreezeDeviceRaw, type BreezeDeviceInventory,
} from "@/lib/breeze"

/**
 * Breeze → DocHub device sync (replaces the Syncro asset sync + FleetHub).
 *
 * 1. Map Breeze orgs → DocHub clients: saved Client.breezeOrgId wins, else a
 *    unique normalized-name match (saved back so it sticks). Never creates
 *    clients — unmatched orgs are reported for Settings → Breeze.
 * 2. For every non-decommissioned device of a mapped org:
 *      linked by breezeDeviceId → update
 *      else CLAIM an existing asset in that client (serial, then MAC, then
 *        exact hostname) — including Syncro/ITFlow rows, so switching sources
 *        doesn't duplicate the fleet; ambiguous (2+) matches are never guessed
 *      else create.
 *    Updates only write values Breeze actually has (never blanks a field a
 *    tech filled in) and record FieldHistory for changed identity fields.
 * 3. Devices Breeze marks decommissioned → linked asset RETIRED (+history).
 */

const SYNC_ACTOR = "Breeze sync"
const TRACKED = ["name", "friendlyName", "make", "model", "serial", "os", "cpu", "ram", "storageCapacity", "ipAddress", "macAddress", "warrantyExpiry"] as const

export type BreezeSyncResult = {
  success: boolean
  dryRun: boolean
  orgs: number
  mappedOrgs: number
  newlyMapped: { org: string; client: string }[]
  unmappedOrgs: { id: string; name: string; devices: number }[]
  devices: number
  created: number
  updated: number
  claimed: number
  unchanged: number
  retired: number
  skippedNoLocation: string[]
  errors: string[]
  /** Per-device plan, filled on dry runs so a human can eyeball the linking. */
  plan?: { client: string; device: string; action: "create" | "link" | "update" | "retire" | "skip"; asset?: string; assetSource?: string }[]
}

type AssetRow = {
  id: string; name: string; friendlyName: string | null; serial: string | null; macAddress: string | null
  breezeDeviceId: string | null; syncroAssetId: string | null; status: string
}

/**
 * Which existing asset is this Breeze device? Serial first; when several rows
 * share it (the ITFlow + Syncro twins) narrow by MAC, then hostname, then
 * prefer the Syncro-linked row. Then MAC, then exact hostname (only when the
 * row has no conflicting serial). Anything still ambiguous → null (create).
 */
function claimFor(candidates: AssetRow[], f: { serial: string | null; macAddress: string | null; name: string }): AssetRow | null {
  const free = candidates.filter((c) => !c.breezeDeviceId && c.status !== "RETIRED" && c.status !== "DISPOSED")
  const s = normalizeSerial(f.serial)
  const m = normalizeMac(f.macAddress)
  const host = f.name.trim().toLowerCase()
  const one = (xs: AssetRow[]) => (xs.length === 1 ? xs[0] : null)
  if (s) {
    let hits = free.filter((c) => normalizeSerial(c.serial) === s)
    if (hits.length === 1) return hits[0]
    if (hits.length > 1) {
      for (const narrow of [
        (c: AssetRow) => !!m && normalizeMac(c.macAddress) === m,
        (c: AssetRow) => c.name.trim().toLowerCase() === host,
        (c: AssetRow) => !!c.syncroAssetId,
      ]) {
        const n = hits.filter(narrow)
        if (n.length === 1) return n[0]
        if (n.length > 1) hits = n
      }
      return null
    }
  }
  if (m) {
    const hit = one(free.filter((c) => normalizeMac(c.macAddress) === m))
    if (hit) return hit
  }
  if (host.length >= 3) {
    return one(free.filter((c) => c.name.trim().toLowerCase() === host && (!s || !normalizeSerial(c.serial))))
  }
  return null
}

const same = (a: unknown, b: unknown) =>
  a instanceof Date || b instanceof Date
    ? (a ? new Date(a as Date).toISOString().slice(0, 10) : null) === (b ? new Date(b as Date).toISOString().slice(0, 10) : null)
    : (a ?? null) === (b ?? null)

export async function runBreezeSync({ dryRun = false }: { dryRun?: boolean } = {}): Promise<BreezeSyncResult> {
  const r: BreezeSyncResult = {
    success: true, dryRun, orgs: 0, mappedOrgs: 0, newlyMapped: [], unmappedOrgs: [], devices: 0,
    created: 0, updated: 0, claimed: 0, unchanged: 0, retired: 0, skippedNoLocation: [], errors: [],
    ...(dryRun ? { plan: [] } : {}),
  }
  const note = (p: NonNullable<BreezeSyncResult["plan"]>[number]) => { if (r.plan && r.plan.length < 1000) r.plan.push(p) }

  const [orgs, devices, statuses, inventory] = await Promise.all([fetchOrgs(), fetchDevices(), fetchStatuses(), fetchInventory()])
  const status = new Map(statuses.map((s) => [s.deviceId, s]))
  const inv = new Map(inventory.devices.map((i) => [i.deviceId, i]))
  r.orgs = orgs.length

  // ── 1. org → client mapping ──────────────────────────────────────────────
  const clients = await prisma.client.findMany({
    where: { isActive: true },
    select: { id: true, name: true, breezeOrgId: true, locations: { select: { id: true }, orderBy: { name: "asc" }, take: 1 } },
  })
  const byOrg = new Map<string, (typeof clients)[number]>()
  for (const c of clients) if (c.breezeOrgId) byOrg.set(c.breezeOrgId, c)
  const devicesPerOrg = new Map<string, number>()
  for (const d of devices) devicesPerOrg.set(d.orgId, (devicesPerOrg.get(d.orgId) ?? 0) + 1)

  for (const o of orgs as BreezeOrg[]) {
    if (byOrg.has(o.id)) continue
    const key = normalizeOrgName(o.name)
    const hits = clients.filter((c) => !c.breezeOrgId && normalizeOrgName(c.name) === key)
    if (hits.length === 1) {
      byOrg.set(o.id, hits[0])
      hits[0].breezeOrgId = o.id
      r.newlyMapped.push({ org: o.name, client: hits[0].name })
      if (!dryRun) await prisma.client.update({ where: { id: hits[0].id }, data: { breezeOrgId: o.id } })
    } else if (o.type !== "internal") {
      r.unmappedOrgs.push({ id: o.id, name: o.name, devices: devicesPerOrg.get(o.id) ?? 0 })
    }
  }
  r.mappedOrgs = byOrg.size

  // ── 2. devices ───────────────────────────────────────────────────────────
  const devicesByClient = new Map<string, BreezeDeviceRaw[]>()
  for (const d of devices) {
    const c = byOrg.get(d.orgId)
    if (!c) continue
    const list = devicesByClient.get(c.id) ?? []
    list.push(d)
    devicesByClient.set(c.id, list)
  }

  for (const [clientId, list] of devicesByClient) {
    const client = clients.find((c) => c.id === clientId)!
    const locationId = client.locations[0]?.id
    if (!locationId) { r.skippedNoLocation.push(client.name); continue }

    const existing = await prisma.asset.findMany({
      where: { location: { clientId } },
      select: {
        id: true, name: true, friendlyName: true, make: true, model: true, serial: true, os: true, cpu: true, ram: true,
        storageCapacity: true, ipAddress: true, macAddress: true, warrantyExpiry: true, assetTag: true, managementUrl: true,
        breezeDeviceId: true, syncroAssetId: true, status: true, dataSource: true, lastSeenAt: true,
      },
    })
    const byBreeze = new Map(existing.filter((a) => a.breezeDeviceId).map((a) => [a.breezeDeviceId!, a]))

    for (const d of list) {
      r.devices++
      try {
        const st = status.get(d.id)
        const decommissioned = st?.status === "decommissioned"
        const f = assetFieldsFor(d, inv.get(d.id) as BreezeDeviceInventory | undefined)
        const lastSeenAt = st?.lastSeenAt ? new Date(st.lastSeenAt) : null
        let target = byBreeze.get(d.id) ?? null
        let claimed = false
        if (!target && !decommissioned) {
          const c = claimFor(existing as AssetRow[], f)
          if (c) { target = existing.find((e) => e.id === c.id)!; claimed = true }
        }

        if (decommissioned) {
          if (!target || target.status === "RETIRED" || target.status === "DISPOSED") note({ client: client.name, device: d.hostname, action: "skip" })
          if (target && target.status !== "RETIRED" && target.status !== "DISPOSED") {
            note({ client: client.name, device: d.hostname, action: "retire", asset: target.name, assetSource: target.dataSource })
            r.retired++
            if (!dryRun) {
              await prisma.$transaction([
                prisma.asset.update({ where: { id: target.id }, data: { status: "RETIRED" } }),
                prisma.fieldHistory.create({ data: { entityType: "Asset", entityId: target.id, field: "status", oldValue: target.status, newValue: "RETIRED (decommissioned in Breeze)", changedBy: SYNC_ACTOR } }),
              ])
            }
          }
          continue
        }

        if (!target) {
          note({ client: client.name, device: d.hostname, action: "create" })
          r.created++
          if (!dryRun) {
            const a = await prisma.asset.create({
              data: {
                locationId, category: categoryFor(d) as never, status: "ACTIVE", dataSource: "BREEZE",
                breezeDeviceId: d.id, lastSeenAt, ...f,
              },
              select: { id: true },
            })
            existing.push({ ...f, id: a.id, breezeDeviceId: d.id, syncroAssetId: null, status: "ACTIVE", dataSource: "BREEZE", lastSeenAt } as (typeof existing)[number])
          }
          continue
        }

        // Update: only non-null Breeze values; history for tracked changes.
        const data: Record<string, unknown> = {}
        const history: { field: string; oldValue: string | null; newValue: string | null }[] = []
        for (const [k, v] of Object.entries(f)) {
          if (v === null || v === undefined || v === "") continue
          const cur = (target as Record<string, unknown>)[k]
          if (same(cur, v)) continue
          // A tech-set friendly name beats Breeze's when Breeze has none to offer.
          data[k] = v
          if ((TRACKED as readonly string[]).includes(k)) {
            const fmt = (x: unknown) => (x instanceof Date ? x.toISOString().slice(0, 10) : x == null ? null : String(x))
            history.push({ field: k, oldValue: fmt(cur), newValue: fmt(v) })
          }
        }
        if (target.breezeDeviceId !== d.id) data.breezeDeviceId = d.id
        if (target.dataSource !== "BREEZE") data.dataSource = "BREEZE"
        if (lastSeenAt && !same(target.lastSeenAt, lastSeenAt)) data.lastSeenAt = lastSeenAt
        const meaningful = Object.keys(data).filter((k) => k !== "lastSeenAt")
        if (claimed || meaningful.length) {
          const sid = (target as { syncroAssetId?: string | null }).syncroAssetId
          note({ client: client.name, device: d.hostname, action: claimed ? "link" : "update", asset: target.name, assetSource: `${target.dataSource}${sid ? ` · Syncro #${sid}` : ""}` })
        }
        if (claimed) r.claimed++
        else if (meaningful.length) r.updated++
        else r.unchanged++
        if (!dryRun && Object.keys(data).length) {
          await prisma.asset.update({ where: { id: target.id }, data })
          if (claimed) history.unshift({ field: "source", oldValue: target.dataSource, newValue: "BREEZE (linked by sync)" })
          if (history.length) {
            await prisma.fieldHistory.createMany({
              data: history.map((h) => ({ entityType: "Asset", entityId: target!.id, ...h, changedBy: SYNC_ACTOR })),
            })
          }
        }
        // Keep the in-memory view current (also in dry runs) so a second device
        // can't claim the same row.
        Object.assign(target, data)
        byBreeze.set(d.id, target)
      } catch (e) {
        r.errors.push(`${d.hostname}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }

  r.unmappedOrgs.sort((a, b) => b.devices - a.devices)
  r.success = r.errors.length === 0
  if (!dryRun) {
    await prisma.appSetting.upsert({
      where: { key: "integration:breeze:lastSync" },
      update: { value: JSON.stringify({ at: new Date().toISOString(), ...r, errors: r.errors.slice(0, 20) }) },
      create: { key: "integration:breeze:lastSync", value: JSON.stringify({ at: new Date().toISOString(), ...r, errors: r.errors.slice(0, 20) }) },
    })
  }
  return r
}

/** Breeze-discovered network gear (printers, switches, APs…) for one client's org, not yet documented. */
export async function undocumentedNetworkEquipment(clientId: string, orgId: string) {
  const { sites } = await fetchInventory(orgId)
  const equipment = sites.flatMap((s) => s.networkEquipment.map((e) => ({ ...e, siteId: s.siteId })))
  const assets = await prisma.asset.findMany({
    where: { location: { clientId } },
    select: { name: true, friendlyName: true, ipAddress: true, macAddress: true, serial: true },
  })
  const macs = new Set(assets.map((a) => normalizeMac(a.macAddress)).filter(Boolean))
  const ips = new Set(assets.map((a) => a.ipAddress?.trim()).filter(Boolean))
  const names = new Set(assets.flatMap((a) => [a.name, a.friendlyName]).filter(Boolean).map((n) => n!.trim().toLowerCase()))
  return equipment.filter((e) => {
    if (e.type === "website" || e.type === "service") return false
    if (e.macAddress && macs.has(normalizeMac(e.macAddress))) return false
    if (e.address && ips.has(e.address.trim())) return false
    if (e.name && names.has(e.name.trim().toLowerCase())) return false
    return true
  })
}
