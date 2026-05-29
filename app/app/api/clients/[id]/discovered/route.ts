import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

/**
 * GET /api/clients/:id/discovered
 *
 * FleetHub agents already see this client's machines. This surfaces the
 * FleetHub-discovered devices (fleethub.fl_devices, matched by clientName)
 * that are NOT yet documented as a DocHub asset — so a tech CONFIRMS them
 * into real assets (prefilled) instead of typing from scratch.
 *
 * "Already documented" = an existing asset for this client whose name or
 * friendlyName matches the device hostname/friendlyName, or whose IP matches.
 */
type FlDevice = {
  id: string
  hostname: string | null
  friendlyName: string | null
  os: string | null
  osVersion: string | null
  role: string | null
  ipAddress: string | null
  assetTag: string | null
  warrantyExpiresAt: Date | null
  purchasedAt: Date | null
  isOnline: boolean
  lastSeenAt: Date | null
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  const { id } = await params

  const client = await prisma.client.findUnique({ where: { id }, select: { name: true } })
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 })

  // Cross-schema read of FleetHub's device inventory for this client.
  let devices: FlDevice[] = []
  try {
    devices = await prisma.$queryRaw<FlDevice[]>`
      SELECT id, hostname, "friendlyName", os, "osVersion", role, "ipAddress",
             "assetTag", "warrantyExpiresAt", "purchasedAt", "isOnline", "lastSeenAt"
      FROM fleethub.fl_devices
      WHERE "clientName" = ${client.name} AND "isActive" = true
      ORDER BY "isOnline" DESC, hostname ASC
    `
  } catch {
    // FleetHub schema unreachable (e.g. fresh DB) — degrade to empty, not 500.
    return NextResponse.json([])
  }

  // What's already documented for this client.
  const assets = await prisma.asset.findMany({
    where: { location: { clientId: id } },
    select: { name: true, friendlyName: true, ipAddress: true, interfaces: { select: { ipAddress: true } } },
  })
  const names = new Set<string>()
  const ips = new Set<string>()
  for (const a of assets) {
    if (a.name) names.add(a.name.trim().toLowerCase())
    if (a.friendlyName) names.add(a.friendlyName.trim().toLowerCase())
    if (a.ipAddress) ips.add(a.ipAddress.trim())
    for (const iface of a.interfaces) if (iface.ipAddress) ips.add(iface.ipAddress.trim())
  }

  const undocumented = devices.filter(d => {
    const host = d.hostname?.trim().toLowerCase()
    const friendly = d.friendlyName?.trim().toLowerCase()
    if (host && names.has(host)) return false
    if (friendly && names.has(friendly)) return false
    if (d.ipAddress && ips.has(d.ipAddress.trim())) return false
    return true
  })

  return NextResponse.json(undocumented)
}
