import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

/**
 * Per-tab counts for the client detail page tab bar. Fetched once on
 * page load so a tech can see which tabs have data without clicking.
 * Assets go through Location (no direct relation), so computed separately.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  const { id } = await params

  const [client, assetCount] = await Promise.all([
    prisma.client.findUnique({
      where: { id },
      select: {
        _count: {
          select: {
            locations: true,
            people: true,
            credentials: true,
            licenses: true,
            applications: true,
            vendors: true,
            websites: true,
            networkDevices: { where: { assetId: null } },
            vpnGateways: true,
            phoneSystems: true,
            cameraSystems: true,
            documents: true,
            runbooks: true,
            portalUsers: true,
            portalCredentials: true,
          },
        },
      },
    }),
    prisma.asset.count({ where: { location: { clientId: id } } }),
  ])

  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const c = client._count
  return NextResponse.json({
    Locations: c.locations,
    People: c.people,
    Assets: assetCount,
    Credentials: c.credentials,
    Licenses: c.licenses,
    Applications: c.applications,
    Vendors: c.vendors,
    Domains: c.websites,
    Network: c.networkDevices,
    "Remote Access": c.vpnGateways,
    "Phone System": c.phoneSystems,
    Cameras: c.cameraSystems,
    Documents: c.documents,
    SOPs: c.runbooks,
    Portal: c.portalUsers,
    "Portal Vault": c.portalCredentials,
  } as Record<string, number>)
}
