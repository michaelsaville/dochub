import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { writeActivity } from "@/lib/activity"
import { isIpv4, ipInCidr } from "@/lib/cidr"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const locations = await prisma.location.findMany({
      where: { clientId: id },
      include: {
        assets: {
          orderBy: { name: "asc" },
          include: {
            assetType: { select: { id: true, name: true, template: true } },
            person: { select: { id: true, name: true, email: true } },
            interfaces: { select: { id: true, assetId: true, name: true, macAddress: true, ipAddress: true, switchPortId: true } },
          },
        },
      },
    })
    const assets = locations.flatMap(l => l.assets)
    return NextResponse.json(assets)
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch assets" }, { status: 500 })
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const body = await req.json()
    const {
      locationId, assetTypeId, name, friendlyName, make, model, serial, assetTag,
      ipAddress, macAddress, managementUrl, splashtopUrl, driverUrl,
      rdpEnabled, rdpHost, rdpPort, vncEnabled, vncHost, vncPort,
      purchaseDate, warrantyExpiry, room,
      personId, notes, purchaseVendorId,
      firmwareVersion, portCount, os, ram, cpu, storageCapacity, customFields,
    } = body

    if (!locationId?.trim() || !name?.trim()) {
      return NextResponse.json({ error: "locationId and name are required" }, { status: 400 })
    }

    // Verify location belongs to this client
    const location = await prisma.location.findFirst({ where: { id: locationId, clientId: id } })
    if (!location) return NextResponse.json({ error: "Location not found" }, { status: 404 })

    const asset = await prisma.asset.create({
      data: {
        locationId,
        assetTypeId: assetTypeId || null,
        name: name.trim(),
        friendlyName: friendlyName?.trim() || null,
        make: make?.trim() || null,
        model: model?.trim() || null,
        serial: serial?.trim() || null,
        assetTag: assetTag?.trim() || null,
        ipAddress: ipAddress?.trim() || null,
        macAddress: macAddress?.trim() || null,
        managementUrl: managementUrl?.trim() || null,
        splashtopUrl: splashtopUrl?.trim() || null,
        driverUrl: driverUrl?.trim() || null,
        rdpEnabled: rdpEnabled ?? false,
        rdpHost: rdpHost?.trim() || null,
        rdpPort: rdpPort ? Number(rdpPort) : null,
        vncEnabled: vncEnabled ?? false,
        vncHost: vncHost?.trim() || null,
        vncPort: vncPort ? Number(vncPort) : null,
        purchaseDate: purchaseDate ? new Date(purchaseDate) : null,
        warrantyExpiry: warrantyExpiry ? new Date(warrantyExpiry) : null,
        room: room?.trim() || null,
        personId: personId || null,
        purchaseVendorId: purchaseVendorId || null,
        notes: notes?.trim() || null,
        firmwareVersion: firmwareVersion?.trim() || null,
        portCount: portCount ? Number(portCount) : null,
        os: os?.trim() || null,
        ram: ram?.trim() || null,
        cpu: cpu?.trim() || null,
        storageCapacity: storageCapacity?.trim() || null,
        customFields: customFields ?? undefined,
      },
      include: {
        assetType: { select: { id: true, name: true, template: true } },
        person: { select: { id: true, name: true, email: true } },
      },
    })

    await writeActivity({
      clientId: id,
      staffUserId: session!.user.id,
      eventType: "ASSET_ADDED",
      title: `Asset added: ${name.trim()}`,
      body: [make?.trim(), model?.trim()].filter(Boolean).join(" ") || null,
    })

    // "Enter once": spawn a primary interface from the IP/MAC just entered so
    // the operator doesn't retype it in the Interfaces panel, and (best-effort)
    // file the IP into the matching documented subnet (IPAM). Enrichment only —
    // failures here must never fail the asset create.
    const ip = ipAddress?.trim() || null
    const mac = macAddress?.trim() || null
    if (ip || mac) {
      try {
        await prisma.assetInterface.create({
          data: { assetId: asset.id, name: "Primary", type: "ETHERNET", ipAddress: ip, macAddress: mac, isPrimary: true },
        })
      } catch { /* non-fatal */ }
    }
    if (ip && isIpv4(ip)) {
      try {
        const subnets = await prisma.subnet.findMany({ where: { clientId: id } })
        const match = subnets.find(s => s.locationId === locationId && ipInCidr(ip, s.cidr))
          ?? subnets.find(s => ipInCidr(ip, s.cidr))
        if (match) {
          const hostname = friendlyName?.trim() || name.trim()
          const existing = await prisma.ipAssignment.findUnique({
            where: { subnetId_ipAddress: { subnetId: match.id, ipAddress: ip } },
          })
          if (!existing) {
            await prisma.ipAssignment.create({ data: { subnetId: match.id, ipAddress: ip, assetId: asset.id, hostname } })
          } else if (!existing.assetId) {
            // Adopt an unassigned IPAM row; never clobber an IP already documented to another asset.
            await prisma.ipAssignment.update({ where: { id: existing.id }, data: { assetId: asset.id, hostname: existing.hostname ?? hostname } })
          }
        }
      } catch { /* non-fatal */ }
    }

    return NextResponse.json(asset, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: "Failed to create asset" }, { status: 500 })
  }
}
