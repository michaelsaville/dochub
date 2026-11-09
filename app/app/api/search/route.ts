import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getClientScope, scopeAllows, type ClientScope } from "@/lib/client-scope"
import { matchScore } from "@/lib/search-rank"

const EMPTY = { clients: [], assets: [], credentials: [], runbooks: [], documents: [], files: [], people: [], vendors: [], licenses: [], locations: [], netdevices: [], circuits: [], flexAssets: [], subnets: [], ipAssignments: [], racks: [], websites: [], applications: [], vlans: [], phoneExtensions: [], dids: [], wifiNetworks: [] }

/** Best active client for a typed fragment: exact > prefix > word > substring. */
async function resolveClient(fragment: string, scope: ClientScope, prefer: string[] = []) {
  const rows = await prisma.client.findMany({
    where: { isActive: true, name: { contains: fragment, mode: "insensitive" } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 15,
  })
  const rank = (id: string) => { const i = prefer.indexOf(id); return i === -1 ? 999 : i }
  const ranked = rows
    .filter((c) => scopeAllows(scope, c.id))
    .map((c) => ({ c, s: matchScore(c.name, fragment) }))
    .filter((x) => x.s > 0)
    // Ties ("queen" prefixes two clients): the tech's recently-opened clients win,
    // then the shorter name (closer to what was typed).
    .sort((a, b) => b.s - a.s || rank(a.c.id) - rank(b.c.id) || a.c.name.length - b.c.name.length)
  return ranked[0]?.c ?? null
}

/**
 * Query params:
 *   q          search text (>= 2 chars)
 *   clientId   scope every group to this client
 *   clientQ    scope to the best client matching this fragment (the `queen > printer`
 *              syntax); the resolved client comes back as `scopedClient`
 *   prefer     comma-separated recent client ids — tie-break for clientQ
 *   ctx        resolve just {id,name} of a client (palette opened on /clients/<id>)
 *
 * Never returns secrets: credentials carry only `hasTotp` / `canReveal` booleans —
 * the palette copies through /api/credentials/<id>/reveal (RBAC + audit there).
 */
export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth()
  if (error) return error
  const sp = req.nextUrl.searchParams
  const scope = await getClientScope()

  const ctx = sp.get("ctx")?.trim()
  if (ctx) {
    const c = scopeAllows(scope, ctx)
      ? await prisma.client.findUnique({ where: { id: ctx }, select: { id: true, name: true } })
      : null
    return NextResponse.json({ client: c })
  }

  const q = sp.get("q")?.trim() ?? ""
  let scopeClientId = sp.get("clientId")?.trim() || null
  let scopedClient: { id: string; name: string } | null = null
  const prefer = (sp.get("prefer") ?? "").split(",").filter(Boolean).slice(0, 20)
  const preferRank = (id: string) => { const i = prefer.indexOf(id); return i === -1 ? 999 : i }
  const clientQ = sp.get("clientQ")?.trim()
  if (!scopeClientId && clientQ && clientQ.length >= 2) {
    scopedClient = await resolveClient(clientQ, scope, prefer)
    if (!scopedClient) return NextResponse.json({ ...EMPTY, scopedClient: null, scopeMiss: clientQ })
    scopeClientId = scopedClient.id
  }
  if (!q || q.length < 2) return NextResponse.json({ ...EMPTY, scopedClient })

  const mode = "insensitive" as const
  const contains = (_field: string) => ({ contains: q, mode })
  const digits = q.replace(/\D/g, "")
  const vlanNum = /^\d{1,4}$/.test(q) ? Number(q) : null
  const role = session?.user?.role

  // "queen printer" (no `>`): if the leading word(s) prefix a client name, offer a
  // one-tap "printer in Queen City Motors" suggestion. Longest lead wins.
  const words = q.split(/\s+/).filter(Boolean)
  const suggestionP = scopeClientId || words.length < 2 ? Promise.resolve(null) : (async () => {
    // The whole query is (the start of) a client name — "queen city motors" — so the
    // client row itself is the answer; don't offer "motors in Queen City …".
    const whole = await prisma.client.findFirst({ where: { isActive: true, name: { startsWith: q, mode } }, select: { id: true } })
    if (whole) return null
    for (let k = Math.min(words.length - 1, 3); k >= 1; k--) {
      const lead = words.slice(0, k).join(" ")
      const rest = words.slice(k).join(" ")
      if (lead.length < 2 || rest.length < 2) continue
      const rows = await prisma.client.findMany({
        where: { isActive: true, name: { startsWith: lead, mode } },
        select: { id: true, name: true }, orderBy: { name: "asc" }, take: 6,
      })
      const hit = rows
        .filter((c) => scopeAllows(scope, c.id))
        .sort((a, b) => preferRank(a.id) - preferRank(b.id) || a.name.length - b.name.length)[0]
      if (hit) return { client: hit, rest }
    }
    return null
  })()

  const [clients, assets, credentials, runbooks, documents, files, people, vendors, licenses, locations, netdevices, circuits, flexAssets, subnets, ipAssignments, racks, websites, applications, vlans, phoneExtensions, dids, wifiNetworks, clientSuggestion] = await Promise.all([
    // When scoped to a client, never return other Client rows — the tech is
    // already on that client's page.
    scopeClientId ? Promise.resolve([] as any[]) : prisma.client.findMany({
      where: { isActive: true, name: { contains: q, mode } },
      select: { id: true, name: true, type: true },
      orderBy: { name: "asc" },
      take: 8,
    }),
    prisma.asset.findMany({
      where: {
        status: { not: "RETIRED" },
        OR: [
          { name: contains("name") },
          { friendlyName: contains("friendlyName") },
          { serial: contains("serial") },
          { ipAddress: contains("ipAddress") },
          { make: contains("make") },
          { model: contains("model") },
        ],
        ...(scopeClientId ? { location: { clientId: scopeClientId } } : {}),
      },
      select: {
        id: true,
        name: true,
        friendlyName: true,
        category: true,
        make: true,
        model: true,
        location: { select: { client: { select: { id: true, name: true } } } },
      },
      take: 6,
    }),
    prisma.credential.findMany({
      where: {
        OR: [
          { label: contains("label") },
          { username: contains("username") },
          { url: contains("url") },
        ],
        ...(scopeClientId ? { clientId: scopeClientId } : {}),
      },
      select: {
        id: true,
        label: true,
        username: true,
        url: true,
        isRetired: true,
        allowTechReveal: true,
        // Selected ONLY to derive the hasTotp boolean below — stripped before
        // the response is built. Never send ciphertext to the browser.
        encryptedTotp: true,
        client: { select: { id: true, name: true } },
      },
      orderBy: [{ isRetired: "asc" }, { isFavorite: "desc" }],
      take: 6,
    }),
    prisma.runbook.findMany({
      where: {
        OR: [
          { title: contains("title") },
          { summary: contains("summary") },
        ],
        ...(scopeClientId ? { clientId: scopeClientId } : {}),
      },
      select: {
        id: true,
        title: true,
        summary: true,
        clientId: true,
        client: { select: { id: true, name: true } },
      },
      take: 5,
    }),
    prisma.clientDocument.findMany({
      where: {
        OR: [
          { title: contains("title") },
          { content: contains("content") },
        ],
        ...(scopeClientId ? { clientId: scopeClientId } : {}),
      },
      select: {
        id: true,
        title: true,
        clientId: true,
        client: { select: { id: true, name: true } },
      },
      take: 5,
    }),
    // Files: match the human name, the caption, OR the extracted/OCR'd text.
    prisma.clientAttachment.findMany({
      where: {
        supersededBy: null,
        OR: [
          { originalName: contains("originalName") },
          { notes: contains("notes") },
          { searchableText: contains("searchableText") },
        ],
        ...(scopeClientId ? { clientId: scopeClientId } : {}),
      },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        clientId: true,
        documentId: true,
        client: { select: { id: true, name: true } },
      },
      take: 6,
    }),
    // People / contacts
    prisma.person.findMany({
      where: {
        isActive: true,
        OR: [
          { name: contains("name") },
          { email: contains("email") },
          { phone: contains("phone") },
          { mobile: contains("mobile") },
          { jobTitle: contains("jobTitle") },
        ],
        ...(scopeClientId ? { clientId: scopeClientId } : {}),
      },
      select: { id: true, name: true, email: true, jobTitle: true, clientId: true, client: { select: { id: true, name: true } } },
      take: 5,
    }),
    // Vendors are global — skip when scoped to a single client.
    scopeClientId ? Promise.resolve([] as any[]) : prisma.vendor.findMany({
      where: {
        isActive: true,
        OR: [
          { name: contains("name") },
          { website: contains("website") },
          { supportEmail: contains("supportEmail") },
          { accountNumber: contains("accountNumber") },
        ],
      },
      select: { id: true, name: true, website: true, category: true },
      take: 5,
    }),
    prisma.license.findMany({
      where: {
        isActive: true,
        OR: [
          { name: contains("name") },
          { vendor: contains("vendor") },
          { licenseKey: contains("licenseKey") },
        ],
        ...(scopeClientId ? { clientId: scopeClientId } : {}),
      },
      select: { id: true, name: true, vendor: true, clientId: true, client: { select: { id: true, name: true } } },
      take: 5,
    }),
    prisma.location.findMany({
      where: {
        isActive: true,
        OR: [
          { name: contains("name") },
          { address: contains("address") },
          { city: contains("city") },
        ],
        ...(scopeClientId ? { clientId: scopeClientId } : {}),
      },
      select: { id: true, name: true, city: true, clientId: true, client: { select: { id: true, name: true } } },
      take: 5,
    }),
    prisma.networkDevice.findMany({
      where: {
        isActive: true,
        OR: [
          { name: contains("name") },
          { ipAddress: contains("ipAddress") },
          { macAddress: contains("macAddress") },
          { serial: contains("serial") },
          { model: contains("model") },
        ],
        ...(scopeClientId ? { clientId: scopeClientId } : {}),
      },
      select: { id: true, name: true, ipAddress: true, type: true, clientId: true, client: { select: { id: true, name: true } } },
      take: 5,
    }),
    prisma.internetCircuit.findMany({
      where: {
        OR: [
          { label: contains("label") },
          { circuitId: contains("circuitId") },
          { accountNumber: contains("accountNumber") },
          { wanIp: contains("wanIp") },
        ],
        ...(scopeClientId ? { clientId: scopeClientId } : {}),
      },
      select: { id: true, label: true, wanIp: true, clientId: true, client: { select: { id: true, name: true } } },
      take: 5,
    }),
    // Flexible Assets: match derived title or the denormalised searchText.
    prisma.flexAsset.findMany({
      where: {
        archivedAt: null,
        OR: [
          { title: contains("title") },
          { searchText: contains("searchText") },
        ],
        ...(scopeClientId ? { clientId: scopeClientId } : {}),
      },
      select: {
        id: true,
        title: true,
        clientId: true,
        layout: { select: { id: true, name: true, slug: true, icon: true } },
        client: { select: { id: true, name: true } },
      },
      take: 6,
    }),
    // IPAM subnets: match the CIDR, description, or VLAN tag.
    prisma.subnet.findMany({
      where: {
        OR: [
          { cidr: contains("cidr") },
          { description: contains("description") },
          { vlan: contains("vlan") },
        ],
        ...(scopeClientId ? { clientId: scopeClientId } : {}),
      },
      select: { id: true, cidr: true, description: true, vlan: true, clientId: true, client: { select: { id: true, name: true } } },
      take: 5,
    }),
    // IP assignments: match the address or hostname; client is via the subnet.
    prisma.ipAssignment.findMany({
      where: {
        OR: [
          { ipAddress: contains("ipAddress") },
          { hostname: contains("hostname") },
        ],
        ...(scopeClientId ? { subnet: { clientId: scopeClientId } } : {}),
      },
      select: { id: true, ipAddress: true, hostname: true, subnet: { select: { clientId: true, cidr: true, client: { select: { id: true, name: true } } } } },
      take: 5,
    }),
    // Racks are owned by a location; scope/RBAC resolve the client via location.
    prisma.rack.findMany({
      where: {
        name: contains("name"),
        ...(scopeClientId ? { location: { clientId: scopeClientId } } : {}),
      },
      select: { id: true, name: true, location: { select: { client: { select: { id: true, name: true } } } } },
      take: 5,
    }),
    // Websites / domains (Domains tab).
    prisma.website.findMany({
      where: {
        OR: [
          { domain: contains("domain") },
          { label: contains("label") },
          { registrar: contains("registrar") },
        ],
        ...(scopeClientId ? { clientId: scopeClientId } : {}),
      },
      select: { id: true, domain: true, label: true, registrar: true, expiresAt: true, clientId: true, client: { select: { id: true, name: true } } },
      take: 5,
    }),
    // Applications (LOB apps etc.).
    prisma.application.findMany({
      where: {
        isActive: true,
        OR: [
          { name: contains("name") },
          { vendor: contains("vendor") },
          { appUrl: contains("appUrl") },
          { rdpHost: contains("rdpHost") },
        ],
        ...(scopeClientId ? { clientId: scopeClientId } : {}),
      },
      select: { id: true, name: true, vendor: true, version: true, clientId: true, client: { select: { id: true, name: true } } },
      take: 5,
    }),
    // VLANs: name/description, or the VLAN number when the query is numeric.
    prisma.vlan.findMany({
      where: {
        OR: [
          { name: contains("name") },
          { description: contains("description") },
          ...(vlanNum != null ? [{ vlanNumber: vlanNum }] : []),
        ],
        ...(scopeClientId ? { clientId: scopeClientId } : {}),
      },
      select: { id: true, name: true, vlanNumber: true, description: true, clientId: true, client: { select: { id: true, name: true } } },
      orderBy: { vlanNumber: "asc" },
      take: 5,
    }),
    // Phone extensions: number, display name, DID. Client via the phone system.
    prisma.phoneExtension.findMany({
      where: {
        isActive: true,
        OR: [
          { extension: contains("extension") },
          { displayName: contains("displayName") },
          { did: contains("did") },
          ...(digits.length >= 3 && digits !== q ? [{ did: { contains: digits } }] : []),
        ],
        system: { isActive: true, ...(scopeClientId ? { clientId: scopeClientId } : {}) },
      },
      select: { id: true, extension: true, displayName: true, did: true, system: { select: { name: true, clientId: true, client: { select: { id: true, name: true } } } } },
      take: 5,
    }),
    // SIP DIDs: stored as +1XXXXXXXXXX — also match on bare digits ("304-555").
    prisma.sipDid.findMany({
      where: {
        OR: [
          { number: contains("number") },
          { designation: contains("designation") },
          ...(digits.length >= 3 && digits !== q ? [{ number: { contains: digits } }] : []),
        ],
        trunk: { system: scopeClientId ? { clientId: scopeClientId } : {} },
      },
      select: {
        id: true, number: true, designation: true,
        extension: { select: { extension: true, displayName: true } },
        trunk: { select: { carrier: true, system: { select: { clientId: true, client: { select: { id: true, name: true } } } } } },
      },
      take: 5,
    }),
    // Wi-Fi networks: SSID only. The PSK lives in a linked Credential and is NEVER
    // selected here — do not add `credential` to this select.
    prisma.wifiNetwork.findMany({
      where: {
        isActive: true,
        OR: [
          { ssid: contains("ssid") },
          { vlanName: contains("vlanName") },
        ],
        controller: scopeClientId ? { clientId: scopeClientId } : {},
      },
      select: { id: true, ssid: true, purpose: true, vlanId: true, controller: { select: { name: true, clientId: true, client: { select: { id: true, name: true } } } } },
      take: 5,
    }),
    suggestionP,
  ])

  // RBAC: a scoped tech (assigned to specific clients) must not see other
  // clients' records in global search. Filter results to the allowed set.
  // Global SOPs (runbook with no clientId) and vendors (not client-owned) stay.
  const ok = (cid?: string | null) => scopeAllows(scope, cid)
  return NextResponse.json({
    scopedClient,
    clientSuggestion,
    clients:     clients.filter((c: any) => ok(c.id)),
    assets:      assets.filter((a: any) => ok(a.location?.client?.id)),
    credentials: credentials.filter((c) => ok(c.client?.id)).map(({ encryptedTotp, allowTechReveal, ...c }) => ({
      ...c,
      hasTotp: !!encryptedTotp,
      // Mirrors the reveal route's rule so the UI can grey out copy buttons; the
      // reveal route remains the enforcement point.
      canReveal: role === "ADMIN" || (role === "TECH" && allowTechReveal),
    })),
    runbooks:    runbooks.filter((r: any) => !r.clientId || ok(r.clientId)),
    documents:   documents.filter((d: any) => ok(d.clientId)),
    files:       files.filter((f: any) => ok(f.clientId)),
    people:      people.filter((p: any) => ok(p.clientId)),
    vendors,
    licenses:    licenses.filter((l: any) => ok(l.clientId)),
    locations:   locations.filter((l: any) => ok(l.clientId)),
    netdevices:  netdevices.filter((n: any) => ok(n.clientId)),
    circuits:    circuits.filter((c: any) => ok(c.clientId)),
    flexAssets:  flexAssets.filter((f: any) => ok(f.clientId)),
    subnets:       subnets.filter((s: any) => ok(s.clientId)),
    ipAssignments: ipAssignments.filter((a: any) => ok(a.subnet?.clientId)),
    racks:         racks.filter((r: any) => ok(r.location?.client?.id)),
    websites:        websites.filter((w) => ok(w.clientId)),
    applications:    applications.filter((a) => ok(a.clientId)),
    vlans:           vlans.filter((v) => ok(v.clientId)),
    phoneExtensions: phoneExtensions.filter((e) => ok(e.system?.clientId)),
    dids:            dids.filter((d) => ok(d.trunk?.system?.clientId)),
    wifiNetworks:    wifiNetworks.filter((w) => ok(w.controller?.clientId)),
  })
}
