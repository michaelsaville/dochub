import "server-only"
import { prisma } from "@/lib/prisma"

// ─── Client documentation completeness ──────────────────────────────────────
// Type-aware: a RESIDENTIAL client is never asked for a firewall, ISP circuit,
// domain, network diagram or runbooks, so a well-documented home user can
// reach 100%. Every check carries an imperative `action`; `nextAction` is the
// highest-weight unmet check (ties → list order), so the UI can show ONE
// concrete next step instead of a red percentage.

export type ClientKind = "BUSINESS" | "RESIDENTIAL"

export interface CompletenessSignals {
  locations: number
  contacts: number
  hasPrimaryContact: boolean
  assets: number
  credentials: number
  documents: number
  /** Asset in NETWORK_GEAR/WIRELESS, or a NetworkDevice FIREWALL/ROUTER/MODEM. */
  hasGateway: boolean
  /** Non-retired credential attached to a NETWORK_GEAR/WIRELESS asset. */
  hasGatewayCredential: boolean
  websites: number
  circuits: number
  diagrams: number
  runbooks: number
}

export interface CompletenessCheck {
  key: string
  label: string
  /** Instruction phrased for the tech: "Add the firewall's admin credential". */
  action: string
  met: boolean
  weight: number
}

export interface CompletenessResult {
  score: number
  checks: CompletenessCheck[]
  gaps: string[]
  nextAction: string | null
  nextActionKey: string | null
}

type CheckDef = {
  key: string
  label: string
  action: (s: CompletenessSignals, kind: ClientKind) => string
  weight: number
  appliesTo: ClientKind[]
  met: (s: CompletenessSignals) => boolean
}

const BOTH: ClientKind[] = ["BUSINESS", "RESIDENTIAL"]
const BIZ: ClientKind[] = ["BUSINESS"]

// Order matters for tie-breaks: earlier = more foundational.
const CHECKS: CheckDef[] = [
  { key: "primaryContact", label: "Has a primary contact", weight: 15, appliesTo: BOTH,
    met: s => s.hasPrimaryContact,
    action: s => s.contacts > 0 ? "Mark one contact as the primary contact" : "Add a contact and mark them primary" },
  { key: "assets", label: "Has documented assets", weight: 15, appliesTo: BOTH,
    met: s => s.assets > 0,
    action: (_s, k) => k === "RESIDENTIAL" ? "Add their computers and devices as assets" : "Document their workstations, servers and devices as assets" },
  { key: "gateway", label: "Firewall / router documented", weight: 10, appliesTo: BOTH,
    met: s => s.hasGateway,
    action: (_s, k) => k === "RESIDENTIAL" ? "Add their router / Wi-Fi as an asset" : "Document the firewall / router as an asset" },
  { key: "gatewayCredential", label: "Firewall / router admin credential stored", weight: 10, appliesTo: BOTH,
    met: s => s.hasGatewayCredential,
    action: (s, k) => !s.hasGateway
      ? (k === "RESIDENTIAL" ? "Add their router, then attach its admin credential" : "Document the firewall, then attach its admin credential")
      : (k === "RESIDENTIAL" ? "Add the router's admin credential (linked to the router asset)" : "Add the firewall's admin credential (linked to the firewall asset)") },
  { key: "location", label: "Has at least one location", weight: 10, appliesTo: BOTH,
    met: s => s.locations > 0,
    action: (_s, k) => k === "RESIDENTIAL" ? "Add the home address as a location" : "Add the office address as a location" },
  { key: "credentials", label: "Has stored credentials", weight: 10, appliesTo: BOTH,
    met: s => s.credentials > 0,
    action: (_s, k) => k === "RESIDENTIAL" ? "Store their key logins (email, Wi-Fi, Apple/Microsoft account)" : "Store the key credentials (M365 admin, domain registrar, line-of-business apps)" },
  { key: "documents", label: "Has documentation pages", weight: 5, appliesTo: BOTH,
    met: s => s.documents > 0,
    action: () => "Write a documentation page (setup notes, quirks, how they work)" },
  { key: "websites", label: "Has domains/websites tracked", weight: 5, appliesTo: BIZ,
    met: s => s.websites > 0,
    action: () => "Track their domain / website (registrar + SSL expiry)" },
  { key: "circuit", label: "Internet circuit recorded", weight: 5, appliesTo: BIZ,
    met: s => s.circuits > 0,
    action: () => "Record their internet circuit (ISP, account #, support phone)" },
  { key: "diagram", label: "Has network diagram", weight: 5, appliesTo: BIZ,
    met: s => s.diagrams > 0,
    action: () => "Draw the network diagram" },
  { key: "runbooks", label: "Has runbooks/SOPs", weight: 5, appliesTo: BIZ,
    met: s => s.runbooks > 0,
    action: () => "Write a runbook for their most common request" },
]

/** Pure scoring. */
export function scoreCompleteness(s: CompletenessSignals, kind: ClientKind): CompletenessResult {
  const checks: CompletenessCheck[] = CHECKS
    .filter(c => c.appliesTo.includes(kind))
    .map(c => ({ key: c.key, label: c.label, action: c.action(s, kind), met: c.met(s), weight: c.weight }))
  const total = checks.reduce((n, c) => n + c.weight, 0)
  const earned = checks.reduce((n, c) => n + (c.met ? c.weight : 0), 0)
  let next: CompletenessCheck | null = null
  for (const c of checks) if (!c.met && (!next || c.weight > next.weight)) next = c
  return {
    score: total ? Math.round((earned / total) * 100) : 100,
    checks,
    gaps: checks.filter(c => !c.met).map(c => c.label),
    nextAction: next?.action ?? null,
    nextActionKey: next?.key ?? null,
  }
}

const GATEWAY_ASSET_CATEGORIES = ["NETWORK_GEAR", "WIRELESS"] as const
const GATEWAY_DEVICE_TYPES = ["FIREWALL", "ROUTER", "MODEM"] as const

/** Completeness for every active client (batched — a handful of queries). */
export async function getAllClientCompleteness(clientIds?: string[]): Promise<Record<string, CompletenessResult & { type: ClientKind }>> {
  const idFilter = clientIds ? { id: { in: clientIds } } : {}
  const cidFilter = clientIds ? { clientId: { in: clientIds } } : {}

  const [clients, primaries, assetsByLoc, gatewayAssets, gatewayDevices, gatewayCreds] = await Promise.all([
    prisma.client.findMany({
      where: { isActive: true, ...idFilter },
      select: {
        id: true, type: true,
        networkDiagram: { select: { id: true } },
        _count: {
          select: {
            people: true,
            credentials: { where: { isRetired: false } },
            locations: true,
            documents: true,
            websites: true,
            runbooks: true,
            internetCircuits: true,
          },
        },
      },
    }),
    prisma.person.findMany({ where: { isPrimary: true, ...cidFilter }, select: { clientId: true }, distinct: ["clientId"] }),
    prisma.asset.groupBy({ by: ["locationId"], _count: true }),
    prisma.asset.findMany({
      where: { category: { in: [...GATEWAY_ASSET_CATEGORIES] } },
      select: { location: { select: { clientId: true } } },
    }),
    prisma.networkDevice.findMany({
      where: { type: { in: [...GATEWAY_DEVICE_TYPES] }, ...cidFilter },
      select: { clientId: true }, distinct: ["clientId"],
    }),
    prisma.credential.findMany({
      where: { isRetired: false, asset: { category: { in: [...GATEWAY_ASSET_CATEGORIES] } }, ...cidFilter },
      select: { clientId: true }, distinct: ["clientId"],
    }),
  ])

  const locs = await prisma.location.findMany({ select: { id: true, clientId: true } })
  const locClient = new Map(locs.map(l => [l.id, l.clientId]))
  const assetCount = new Map<string, number>()
  for (const a of assetsByLoc) {
    const cid = locClient.get(a.locationId)
    if (cid) assetCount.set(cid, (assetCount.get(cid) ?? 0) + a._count)
  }
  const primarySet = new Set(primaries.map(p => p.clientId))
  const gatewaySet = new Set<string>([
    ...gatewayAssets.map(a => a.location.clientId),
    ...gatewayDevices.map(d => d.clientId),
  ])
  const gatewayCredSet = new Set(gatewayCreds.map(c => c.clientId))

  const out: Record<string, CompletenessResult & { type: ClientKind }> = {}
  for (const c of clients) {
    const kind = c.type as ClientKind
    out[c.id] = {
      type: kind,
      ...scoreCompleteness({
        locations: c._count.locations,
        contacts: c._count.people,
        hasPrimaryContact: primarySet.has(c.id),
        assets: assetCount.get(c.id) ?? 0,
        credentials: c._count.credentials,
        documents: c._count.documents,
        hasGateway: gatewaySet.has(c.id),
        hasGatewayCredential: gatewayCredSet.has(c.id),
        websites: c._count.websites,
        circuits: c._count.internetCircuits,
        diagrams: c.networkDiagram ? 1 : 0,
        runbooks: c._count.runbooks,
      }, kind),
    }
  }
  return out
}

/** Completeness for one client (works for inactive clients too). */
export async function getClientCompleteness(clientId: string): Promise<(CompletenessResult & { type: ClientKind }) | null> {
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { type: true } })
  if (!client) return null
  const [locations, contacts, primary, assets, credentials, documents, gwAsset, gwDevice, gwCred, websites, circuits, diagrams, runbooks] = await Promise.all([
    prisma.location.count({ where: { clientId } }),
    prisma.person.count({ where: { clientId } }),
    prisma.person.count({ where: { clientId, isPrimary: true } }),
    prisma.asset.count({ where: { location: { clientId } } }),
    prisma.credential.count({ where: { clientId, isRetired: false } }),
    prisma.clientDocument.count({ where: { clientId } }),
    prisma.asset.count({ where: { location: { clientId }, category: { in: [...GATEWAY_ASSET_CATEGORIES] } } }),
    prisma.networkDevice.count({ where: { clientId, type: { in: [...GATEWAY_DEVICE_TYPES] } } }),
    prisma.credential.count({ where: { clientId, isRetired: false, asset: { category: { in: [...GATEWAY_ASSET_CATEGORIES] } } } }),
    prisma.website.count({ where: { clientId } }),
    prisma.internetCircuit.count({ where: { clientId } }),
    prisma.networkDiagram.count({ where: { clientId } }),
    prisma.runbook.count({ where: { clientId } }),
  ])
  const kind = client.type as ClientKind
  return {
    type: kind,
    ...scoreCompleteness({
      locations, contacts, hasPrimaryContact: primary > 0, assets, credentials, documents,
      hasGateway: gwAsset + gwDevice > 0, hasGatewayCredential: gwCred > 0,
      websites, circuits, diagrams, runbooks,
    }, kind),
  }
}
