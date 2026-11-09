import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"
import { writeActivity } from "@/lib/activity"
import { isIpv4, ipInCidr } from "@/lib/cidr"
import { undocumentedNetworkEquipment } from "@/lib/breeze-sync"

/**
 * POST /api/clients/:id/discovered/promote   { deviceId, locationId? }
 *
 * The "confirm" step of Breeze network discovery: turn a printer / switch /
 * AP / firewall / NAS Breeze found at the client's site into a real DocHub
 * asset (name, IP, MAC, make/model, mgmt URL). Reuses the "enter once" spawn
 * so the primary interface + IPAM row are created too. dataSource = BREEZE.
 */
const CATEGORY: Record<string, string> = {
  printer: "PRINTER", router: "NETWORK_GEAR", switch: "NETWORK_GEAR", firewall: "NETWORK_GEAR",
  access_point: "WIRELESS", nas: "NAS",
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth()
  if (error) return error
  const { id } = await params
  if (!scopeAllows(await getClientScope(), id)) return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  if (!body.deviceId) return NextResponse.json({ error: "deviceId required" }, { status: 400 })

  const client = await prisma.client.findUnique({
    where: { id },
    select: { name: true, locations: { select: { id: true }, orderBy: { name: "asc" }, take: 1 } },
  })
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 })

  const locationId: string | undefined = body.locationId || client.locations[0]?.id
  if (!locationId) return NextResponse.json({ error: "Client has no location — create one first" }, { status: 400 })

  // Pull the item from Breeze, scoped to this client's org (no cross-client promote).
  const org = await prisma.client.findUnique({ where: { id }, select: { breezeOrgId: true } })
  if (!org?.breezeOrgId) return NextResponse.json({ error: "Client isn't linked to a Breeze organization" }, { status: 400 })
  let dev: Awaited<ReturnType<typeof undocumentedNetworkEquipment>>[number] | undefined
  try {
    dev = (await undocumentedNetworkEquipment(id, org.breezeOrgId)).find((e) => e.id === body.deviceId)
  } catch {
    return NextResponse.json({ error: "Breeze unreachable" }, { status: 502 })
  }
  if (!dev) return NextResponse.json({ error: "Device not found for this client (or already documented)" }, { status: 404 })

  const ip = dev.address?.trim() || null
  const makeModel = [dev.manufacturer, dev.model].filter(Boolean).join(" ") || null
  const name = (dev.name || makeModel || ip || "Discovered device").trim()
  const os = null

  const asset = await prisma.asset.create({
    data: {
      locationId,
      name,
      category: (CATEGORY[dev.type] ?? "OTHER") as never,
      ipAddress: ip,
      macAddress: dev.macAddress || null,
      make: dev.manufacturer || null,
      model: dev.model || null,
      managementUrl: dev.url || null,
      dataSource: "BREEZE",
      notes: `Confirmed from Breeze network discovery (${dev.type.replace("_", " ")}, ${dev.source})`,
    },
  })

  await writeActivity({
    clientId: id,
    staffUserId: session!.user.id,
    eventType: "ASSET_ADDED",
    title: `Asset confirmed from Breeze discovery: ${name}`,
    body: makeModel,
  })

  // "Enter once" spawn — primary interface + IPAM match (best-effort, never fatal).
  if (ip) {
    try {
      await prisma.assetInterface.create({
        data: { assetId: asset.id, name: "Primary", type: "ETHERNET", ipAddress: ip, isPrimary: true },
      })
    } catch { /* non-fatal */ }
    if (isIpv4(ip)) {
      try {
        const subnets = await prisma.subnet.findMany({ where: { clientId: id } })
        const match = subnets.find(s => s.locationId === locationId && ipInCidr(ip, s.cidr))
          ?? subnets.find(s => ipInCidr(ip, s.cidr))
        if (match) {
          const existing = await prisma.ipAssignment.findUnique({
            where: { subnetId_ipAddress: { subnetId: match.id, ipAddress: ip } },
          })
          if (!existing) {
            await prisma.ipAssignment.create({ data: { subnetId: match.id, ipAddress: ip, assetId: asset.id, hostname: name } })
          } else if (!existing.assetId) {
            await prisma.ipAssignment.update({ where: { id: existing.id }, data: { assetId: asset.id, hostname: existing.hostname ?? name } })
          }
        }
      } catch { /* non-fatal */ }
    }
  }

  return NextResponse.json(asset, { status: 201 })
}
