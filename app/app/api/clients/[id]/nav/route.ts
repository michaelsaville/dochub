import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"

/**
 * Everything the context sidebar needs to render a client's section list:
 * name/type + a count per section (undefined = "not counted, always show").
 * Kept deliberately cheap — one findUnique with _count + one asset count.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAuth()
  if (error) return error
  const { id } = await params
  if (!scopeAllows(await getClientScope(), id)) return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })

  const [client, assetCount, rackCount] = await Promise.all([
    prisma.client.findUnique({
      where: { id },
      select: {
        id: true, name: true, type: true, isActive: true,
        _count: {
          select: {
            locations: true, people: true, credentials: true, licenses: true,
            applications: true, vendors: true, websites: true,
            networkDevices: { where: { assetId: null } },
            subnets: true, vlans: true, internetCircuits: true, wifiControllers: true,
            ptpLinks: true, networkShares: true,
            vpnGateways: true, phoneSystems: true, cameraSystems: true,
            documents: true, runbooks: true, portalUsers: true, portalCredentials: true,
            vendorGrants: true,
          },
        },
      },
    }),
    prisma.asset.count({ where: { location: { clientId: id } } }),
    prisma.rack.count({ where: { location: { clientId: id } } }).catch(() => 0),
  ])
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const c = client._count
  const network = c.networkDevices + c.subnets + c.vlans + c.internetCircuits + c.wifiControllers + c.ptpLinks + c.networkShares + rackCount
  return NextResponse.json({
    id: client.id,
    name: client.name,
    type: client.type,
    isActive: client.isActive,
    counts: {
      Locations: c.locations,
      People: c.people,
      Assets: assetCount,
      Credentials: c.credentials,
      Licenses: c.licenses,
      Applications: c.applications,
      Vendors: c.vendors,
      Domains: c.websites,
      Network: network,
      "Remote Access": c.vpnGateways,
      "Phone System": c.phoneSystems,
      Cameras: c.cameraSystems,
      Documents: c.documents,
      SOPs: c.runbooks,
      Portal: c.portalUsers,
      "Portal Vault": c.portalCredentials,
      "Vendor Portal": c.vendorGrants,
    } as Record<string, number>,
  })
}
