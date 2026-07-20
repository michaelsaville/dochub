/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma } from "@/lib/prisma"

// Context enrichment for Notes Intake. Three deterministic passes that need no
// AI credits:
//   1. completeIp        — turn a partial IP (".14") into a full one using the
//                          client's own sibling assets / subnets.
//   2. inferRelations    — pair a credential with the asset it logs into within
//                          one note, so commit sets Credential.assetId.
//   3. client subnet hints — a note's IP that lands in a *distinctive* subnet
//                          owned by one client boosts / redirects the match.

function octets(s: string | null | undefined): number[] | null {
  const m = (s || "").trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return null
  const o = m.slice(1, 5).map(Number)
  if (o.some((n) => n > 255)) return null
  return o
}
const prefixOf = (o: number[]) => `${o[0]}.${o[1]}.${o[2]}`
// RFC1918 /24s like 192.168.1.x are shared across many clients — never treat
// them as "distinctive" for a cross-client redirect.
const COMMON_PREFIX = /^(192\.168\.(0|1)|10\.0\.0|172\.16\.0)$/

// ── network profile (subnet fingerprint) for one client ──────────────────
export type NetProfile = { prefixes: { prefix: string; count: number }[] }

export async function clientNetworkProfile(clientId: string): Promise<NetProfile> {
  const [assets, subnets, locs] = await Promise.all([
    prisma.asset.findMany({ where: { location: { clientId }, ipAddress: { not: null } }, select: { ipAddress: true } }),
    prisma.subnet.findMany({ where: { clientId }, select: { cidr: true, gateway: true } }),
    prisma.location.findMany({ where: { clientId }, select: { wanIp: true } }),
  ])
  const counts = new Map<string, number>()
  const bump = (o: number[] | null, w: number) => { if (o) counts.set(prefixOf(o), (counts.get(prefixOf(o)) || 0) + w) }
  for (const a of assets) bump(octets(a.ipAddress), 1)
  for (const s of subnets) { bump(octets((s.cidr || "").split("/")[0]), 2); bump(octets(s.gateway), 1) }
  // wanIp is public — it's a weak signal for LAN completion, so don't count it
  void locs
  const prefixes = [...counts.entries()].map(([prefix, count]) => ({ prefix, count })).sort((a, b) => b.count - a.count)
  return { prefixes }
}

// Complete a host-only partial ("14" / ".14") using the client's dominant /24.
export function completeIp(raw: string | null | undefined, profile: NetProfile): { full: string; basis: string } | null {
  const s = (raw || "").trim()
  if (!s || octets(s)) return null // blank or already a full IP
  const hostM = s.match(/^\.?(\d{1,3})$/) // ".14" or "14"
  if (!hostM) return null
  const host = Number(hostM[1])
  if (host > 255 || !profile.prefixes.length) return null
  const top = profile.prefixes[0]
  const full = `${top.prefix}.${host}`
  if (full === s) return null
  return { full, basis: `${top.count} sibling record(s) on ${top.prefix}.x` }
}

// Which entity fields hold a LAN IP we can complete from the profile.
const IP_FIELDS: Record<string, string[]> = { asset: ["ipAddress"], location_network: ["lanIp", "gateway"] }

export type IpCompletion = { entityIndex: number; eid?: string; field: string; current: string; full: string; basis: string }

export async function suggestIpCompletions(clientId: string, entities: any[]): Promise<IpCompletion[]> {
  if (!clientId || !Array.isArray(entities) || !entities.length) return []
  const profile = await clientNetworkProfile(clientId)
  if (!profile.prefixes.length) return []
  const out: IpCompletion[] = []
  entities.forEach((e, idx) => {
    if (!e || e.include === false) return
    for (const field of IP_FIELDS[e.kind] || []) {
      const cur = (e.fields?.[field] || "").toString()
      const c = completeIp(cur, profile)
      if (c) out.push({ entityIndex: idx, eid: e.eid, field, current: cur, full: c.full, basis: c.basis })
    }
  })
  return out
}

// Is the note's IP data consistent with the matched client's subnet? Positive
// affirmation for the match (the user's "increases confidence" case).
export async function ipConsistency(clientId: string, entities: any[]): Promise<{ prefix: string; count: number; fitting: number } | null> {
  if (!clientId) return null
  const profile = await clientNetworkProfile(clientId)
  if (!profile.prefixes.length) return null
  const known = new Set(profile.prefixes.map((p) => p.prefix))
  let fitting = 0; let prefix = ""
  for (const e of entities || []) {
    if (e?.include === false) continue
    for (const field of IP_FIELDS[e.kind] || []) {
      const o = octets(e.fields?.[field]); if (o && known.has(prefixOf(o))) { fitting++; prefix = prefixOf(o) }
    }
  }
  if (!fitting) return null
  const top = profile.prefixes.find((p) => p.prefix === prefix) || profile.prefixes[0]
  return { prefix: top.prefix, count: top.count, fitting }
}

// ── intra-note relationship inference (credential ↔ asset) ───────────────
export type Relation = { credentialIndex: number; credentialEid?: string; assetIndex: number; assetEid?: string; reason: string; strong: boolean }

const low = (s: any) => (s || "").toString().toLowerCase()

export function inferRelations(entities: any[]): Relation[] {
  const rels: Relation[] = []
  if (!Array.isArray(entities)) return rels
  const assets = entities.map((e, i) => ({ e, i })).filter((x) => x.e?.kind === "asset" && x.e.include !== false)
  const creds = entities.map((e, i) => ({ e, i })).filter((x) => x.e?.kind === "credential" && x.e.include !== false)
  if (!assets.length || !creds.length) return rels
  for (const c of creds) {
    const cf = c.e.fields || {}
    const curl = low(cf.url) + " " + low(cf.notes)
    const clabel = low(cf.label) + " " + low(c.e.summary) + " " + low(cf.username)
    let best: { e: any; i: number } | null = null; let reason = ""; let strong = false
    for (const a of assets) {
      const af = a.e.fields || {}
      const aip = low(af.ipAddress), aname = low(af.name || a.e.summary), amgmt = low(af.managementUrl)
      if (aip && curl.includes(aip)) { best = a; reason = `login URL points at ${af.ipAddress}`; strong = true; break }
      if (amgmt && (curl.includes(amgmt) || (curl.trim() && amgmt.includes(curl.trim())))) { best = a; reason = "same management URL"; strong = true; break }
      if (aname && aname.length >= 4 && clabel.includes(aname)) { best = a; reason = `login is named for "${af.name || a.e.summary}"`; strong = true; break }
    }
    if (!best && assets.length === 1) { best = assets[0]; reason = creds.length === 1 ? "the only device + only login in this note" : "the only device in this note"; strong = creds.length === 1 }
    if (best) rels.push({ credentialIndex: c.i, credentialEid: c.e.eid, assetIndex: best.i, assetEid: best.e.eid, reason, strong })
  }
  return rels
}

// ── cross-client subnet ownership (distinctive subnets only) ─────────────
export type ClientHint = { clientId: string; clientName: string; ip: string; reason: string }

export async function clientHintsFromIps(entities: any[], currentClientId: string | null | undefined): Promise<ClientHint[]> {
  // gather the note's full IPs
  const noteIps: string[] = []
  for (const e of entities || []) {
    if (e?.include === false) continue
    for (const field of IP_FIELDS[e.kind] || []) { const o = octets(e.fields?.[field]); if (o) noteIps.push(e.fields[field]) }
  }
  const notePrefixes = new Set(noteIps.map((ip) => prefixOf(octets(ip)!)).filter((p) => !COMMON_PREFIX.test(p)))
  if (!notePrefixes.size) return []

  // owners of those distinctive /24s
  const [assets, subnets] = await Promise.all([
    prisma.asset.findMany({ where: { ipAddress: { not: null } }, select: { ipAddress: true, location: { select: { clientId: true, client: { select: { name: true, isActive: true } } } } } }),
    prisma.subnet.findMany({ select: { cidr: true, clientId: true, client: { select: { name: true, isActive: true } } } }),
  ])
  const owners = new Map<string, Map<string, { name: string; count: number }>>() // prefix -> clientId -> {name,count}
  const add = (o: number[] | null, clientId: string | undefined, name: string | undefined, active: boolean | undefined, w: number) => {
    if (!o || !clientId || active === false) return
    const p = prefixOf(o); if (!notePrefixes.has(p)) return
    if (!owners.has(p)) owners.set(p, new Map())
    const m = owners.get(p)!; const cur = m.get(clientId) || { name: name || "", count: 0 }; cur.count += w; m.set(clientId, cur)
  }
  for (const a of assets) add(octets(a.ipAddress), a.location?.clientId, a.location?.client?.name, a.location?.client?.isActive, 1)
  for (const s of subnets) add(octets((s.cidr || "").split("/")[0]), s.clientId, s.client?.name, s.client?.isActive, 2)

  const hints: ClientHint[] = []; const seen = new Set<string>()
  for (const [p, m] of owners) {
    if (m.size !== 1) continue // distinctive = owned by exactly one client
    const [clientId, info] = [...m.entries()][0]
    if (clientId === currentClientId || seen.has(clientId)) continue
    seen.add(clientId)
    const ip = noteIps.find((x) => prefixOf(octets(x)!) === p) || p
    hints.push({ clientId, clientName: info.name, ip, reason: `${info.count} record(s) on ${p}.x` })
  }
  return hints.slice(0, 4)
}
