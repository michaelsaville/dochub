import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

// Map NetworkDeviceType → AssetType name
const TYPE_MAP: Record<string, string> = {
  SWITCH: "Switch",
  FIREWALL: "Firewall",
  ROUTER: "Router",
  ACCESS_POINT: "Access Point",
  NAS: "NAS",
  UPS: "UPS",
  MODEM: "Router",
  OTHER: "Other",
}

// Dry-run preview
export async function GET(req: Request) {
  const { error } = await requireAuth()
  if (error) return error

  const devices = await prisma.networkDevice.findMany({
    where: { assetId: null },
    include: { location: { select: { id: true, name: true, clientId: true } }, switchPorts: { select: { id: true } } },
    orderBy: { name: "asc" },
  })

  return NextResponse.json({
    count: devices.length,
    preview: devices.map(d => ({
      id: d.id,
      name: d.name,
      type: d.type,
      targetAssetType: TYPE_MAP[d.type] ?? "Other",
      location: d.location?.name,
      switchPorts: d.switchPorts.length,
      alreadyMigrated: false,
    })),
  })
}

// Execute migration
export async function POST(req: Request) {
  const { session, error } = await requireAuth()
  if (error) return error
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 })
  }

  // Load all asset types for lookup
  const assetTypes = await prisma.assetType.findMany({ select: { id: true, name: true } })
  const typeByName = Object.fromEntries(assetTypes.map(t => [t.name, t.id]))

  const devices = await prisma.networkDevice.findMany({
    where: { assetId: null },
    include: { switchPorts: true },
  })

  const migrated: string[] = []
  const errors: { name: string; error: string }[] = []

  for (const device of devices) {
    try {
      const assetTypeName = TYPE_MAP[device.type] ?? "Other"
      const assetTypeId = typeByName[assetTypeName]

      if (!device.locationId) {
        // Verify client has at least one location
        const loc = await prisma.location.findFirst({ where: { clientId: device.clientId }, select: { id: true } })
        if (!loc) { errors.push({ name: device.name, error: "No location found for client" }); continue }
      }

      // Resolve locationId — prefer device's own locationId, fall back to first client location
      let locationId = device.locationId
      if (!locationId) {
        const loc = await prisma.location.findFirst({ where: { clientId: device.clientId }, select: { id: true } })
        if (!loc) { errors.push({ name: device.name, error: "No location found" }); continue }
        locationId = loc.id
      }

      const asset = await prisma.asset.create({
        data: {
          locationId,
          name: device.name,
          friendlyName: device.name,
          make: device.make,
          model: device.model,
          serial: device.serial,
          ipAddress: device.ipAddress,
          macAddress: device.macAddress,
          managementUrl: device.managementUrl,
          firmwareVersion: device.firmwareVersion,
          portCount: device.portCount,
          notes: device.notes,
          dataSource: device.dataSource,
          status: device.isActive ? "ACTIVE" : "RETIRED",
          assetTypeId: assetTypeId ?? null,
        },
      })

      // Link NetworkDevice → Asset and update SwitchPorts
      await prisma.networkDevice.update({
        where: { id: device.id },
        data: { assetId: asset.id },
      })

      if (device.switchPorts.length > 0) {
        await prisma.switchPort.updateMany({
          where: { networkDeviceId: device.id },
          data: { assetId: asset.id },
        })
      }

      migrated.push(device.name)
    } catch (e: any) {
      errors.push({ name: device.name, error: e.message ?? "Unknown error" })
    }
  }

  return NextResponse.json({ ok: true, migrated: migrated.length, errors })
}
