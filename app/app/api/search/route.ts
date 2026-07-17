import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getClientScope } from "@/lib/client-scope"

export async function GET(req: NextRequest) {
  const { error } = await requireAuth()
  if (error) return error

  const q = req.nextUrl.searchParams.get("q")?.trim()
  const scopeClientId = req.nextUrl.searchParams.get("clientId")?.trim() || null
  if (!q || q.length < 2) return NextResponse.json({ clients: [], assets: [], credentials: [], runbooks: [], documents: [], files: [], people: [], vendors: [], licenses: [], locations: [], netdevices: [], circuits: [], flexAssets: [], subnets: [], ipAssignments: [], racks: [] })

  const mode = "insensitive" as const
  const contains = (field: string) => ({ contains: q, mode })

  const [clients, assets, credentials, runbooks, documents, files, people, vendors, licenses, locations, netdevices, circuits, flexAssets, subnets, ipAssignments, racks] = await Promise.all([
    // When scoped to a client, never return other Client rows — the tech is
    // already on that client's page.
    scopeClientId ? Promise.resolve([] as any[]) : prisma.client.findMany({
      where: { isActive: true, name: { contains: q, mode } },
      select: { id: true, name: true, type: true },
      take: 5,
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
        client: { select: { id: true, name: true } },
      },
      take: 5,
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
  ])

  // RBAC: a scoped tech (assigned to specific clients) must not see other
  // clients' records in global search. Filter results to the allowed set.
  // Global SOPs (runbook with no clientId) and vendors (not client-owned) stay.
  const scope = await getClientScope()
  const ok = (cid?: string | null) => scope.all || (!!cid && scope.clientIds.includes(cid))
  return NextResponse.json({
    clients:     clients.filter((c: any) => ok(c.id)),
    assets:      assets.filter((a: any) => ok(a.location?.client?.id)),
    credentials: credentials.filter((c: any) => ok(c.client?.id)),
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
  })
}
