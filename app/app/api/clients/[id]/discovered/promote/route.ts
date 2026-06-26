import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { writeActivity } from "@/lib/activity"
import { isIpv4, ipInCidr } from "@/lib/cidr"

/**
 * POST /api/clients/:id/discovered/promote   { deviceId, locationId? }
 *
 * The "confirm" step of FleetHub discovery: turn a discovered device into a
 * real DocHub asset, prefilled from the FleetHub inventory (hostname, OS, IP,
 * warranty, asset tag, purchase date). Reuses the Wave-1 "enter once" spawn so
 * the primary interface + IPAM row are created too. dataSource = FLEETHUB.
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
}

function roleToCategory(role: string | null): "SERVER" | "COMPUTER" | "OTHER" {
  const r = (role || "").toLowerCase()
  if (r === "server") return "SERVER"
  if (r === "workstation" || r === "desktop" || r === "laptop") return "COMPUTER"
  return "OTHER"
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth()
  if (error) return error
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  if (!body.deviceId) return NextResponse.json({ error: "deviceId required" }, { status: 400 })

  const client = await prisma.client.findUnique({
    where: { id },
    select: { name: true, locations: { select: { id: true }, orderBy: { name: "asc" }, take: 1 } },
  })
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 })

  const locationId: string | undefined = body.locationId || client.locations[0]?.id
  if (!locationId) return NextResponse.json({ error: "Client has no location — create one first" }, { status: 400 })

  // Pull the device from FleetHub, scoped to this client (no cross-client promote).
  const rows = await prisma.$queryRaw<FlDevice[]>`
    SELECT id, hostname, "friendlyName", os, "osVersion", role, "ipAddress",
           "assetTag", "warrantyExpiresAt", "purchasedAt"
    FROM fleethub.fl_devices
    WHERE id = ${body.deviceId} AND LOWER(TRIM("clientName")) = LOWER(TRIM(${client.name}))
    LIMIT 1
  `
  const dev = rows[0]
  if (!dev) return NextResponse.json({ error: "Device not found for this client" }, { status: 404 })

  const name = (dev.hostname || dev.friendlyName || "Discovered device").trim()
  const ip = dev.ipAddress?.trim() || null
  const os = [dev.os, dev.osVersion].filter(Boolean).join(" ").trim() || null

  const asset = await prisma.asset.create({
    data: {
      locationId,
      name,
      friendlyName: dev.friendlyName?.trim() || null,
      category: roleToCategory(dev.role),
      ipAddress: ip,
      os,
      assetTag: dev.assetTag?.trim() || null,
      warrantyExpiry: dev.warrantyExpiresAt ?? null,
      purchaseDate: dev.purchasedAt ?? null,
      dataSource: "FLEETHUB",
      notes: "Imported from FleetHub discovery",
    },
  })

  await writeActivity({
    clientId: id,
    staffUserId: session!.user.id,
    eventType: "ASSET_ADDED",
    title: `Asset confirmed from FleetHub: ${name}`,
    body: os,
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
