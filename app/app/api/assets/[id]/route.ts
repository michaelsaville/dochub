import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const asset = await prisma.asset.findUnique({
      where: { id },
      include: {
        location: {
          include: { client: { select: { id: true, name: true } } },
        },
        assetType: {
          select: { id: true, name: true, template: true },
        },
        person: { select: { id: true, name: true, email: true } },
        credentials: {
          where: { isRetired: false },
          select: { id: true, label: true, username: true, url: true, encryptedPassword: true },
          orderBy: { label: "asc" },
        },
      },
    })
    if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 })

    // Reverse-lookup: which phone/camera systems is this asset linked to?
    // Also fetch NetworkDevice data (switch ports) and full camera data if applicable
    const [linkedPhoneSystems, linkedCameraSystems, networkDevice, cameraSystemsFull] = await Promise.all([
      prisma.phoneSystem.findMany({
        where: { assetId: id },
        select: { id: true, name: true, type: true, clientId: true },
      }),
      prisma.cameraSystem.findMany({
        where: { assetId: id },
        select: { id: true, name: true, type: true, clientId: true },
      }),
      // Switch/router: fetch the NetworkDevice record with ports
      prisma.networkDevice.findUnique({
        where: { assetId: id },
        select: {
          id: true, name: true, type: true, ipAddress: true, portCount: true,
          ports: {
            orderBy: { portNumber: "asc" },
            select: {
              id: true, portNumber: true, label: true, speed: true, poeEnabled: true,
              status: true, notes: true,
              vlan: { select: { id: true, vlanNumber: true, name: true, color: true } },
              connectedAsset: { select: { id: true, name: true, friendlyName: true } },
            },
          },
        },
      }),
      // NVR/DVR: fetch camera systems with full camera details
      prisma.cameraSystem.findMany({
        where: { assetId: id },
        include: {
          cameras: {
            orderBy: { name: "asc" },
            select: {
              id: true, name: true, location: true, model: true, ipAddress: true,
              stream1Url: true, stream2Url: true, protocol: true, status: true,
              asset: { select: { id: true, name: true } },
            },
          },
        },
      }),
    ])

    const { credentials, ...rest } = asset
    return NextResponse.json({
      ...rest,
      credentials: credentials.map(c => ({
        id: c.id, label: c.label, username: c.username, url: c.url,
        hasPassword: !!c.encryptedPassword,
      })),
      linkedPhoneSystems,
      linkedCameraSystems,
      networkDevice,        // switch ports, VLANs — null if not a network device
      cameraSystemsFull,    // cameras with streams — empty array if not an NVR
    })
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch asset" }, { status: 500 })
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const body = await req.json()
    const {
      assetTypeId, name, friendlyName, make, model, serial, assetTag,
      ipAddress, macAddress, vlan, switchPort, managementUrl,
      splashtopUrl, driverUrl, isFavorite,
      rdpEnabled, rdpHost, rdpPort, vncEnabled, vncHost, vncPort,
      purchaseDate, warrantyExpiry, room, notes,
      status, personId,
      firmwareVersion, portCount, os, ram, cpu, storageCapacity, customFields,
    } = body

    // Fetch current values for audit trail
    const current = await prisma.asset.findUnique({
      where: { id },
      select: { ipAddress: true, macAddress: true, status: true, personId: true, vlan: true, switchPort: true, firmwareVersion: true },
    })

    const changedBy = session?.user?.name ?? "unknown"
    const historyEntries: { entityType: string; entityId: string; field: string; oldValue: string | null; newValue: string | null; changedBy: string }[] = []

    if (current) {
      const tracked: { field: string; oldVal: string | null | undefined; newVal: string | null | undefined }[] = [
        { field: "ipAddress",    oldVal: current.ipAddress,    newVal: ipAddress    !== undefined ? (ipAddress?.trim() || null)    : undefined },
        { field: "macAddress",   oldVal: current.macAddress,   newVal: macAddress   !== undefined ? (macAddress?.trim() || null)   : undefined },
        { field: "status",       oldVal: current.status,       newVal: status       !== undefined ? status                         : undefined },
        { field: "personId",     oldVal: current.personId,     newVal: personId     !== undefined ? (personId || null)             : undefined },
        { field: "vlan",         oldVal: current.vlan,         newVal: vlan         !== undefined ? (vlan?.trim() || null)         : undefined },
        { field: "switchPort",      oldVal: current.switchPort,      newVal: switchPort      !== undefined ? (switchPort?.trim() || null)      : undefined },
        { field: "firmwareVersion", oldVal: current.firmwareVersion, newVal: firmwareVersion !== undefined ? (firmwareVersion?.trim() || null) : undefined },
      ]
      for (const t of tracked) {
        if (t.newVal !== undefined && t.newVal !== t.oldVal) {
          historyEntries.push({
            entityType: "asset",
            entityId: id,
            field: t.field,
            oldValue: t.oldVal ?? null,
            newValue: t.newVal ?? null,
            changedBy,
          })
        }
      }
    }

    const asset = await prisma.asset.update({
      where: { id },
      data: {
        ...(assetTypeId !== undefined && { assetTypeId: assetTypeId || null }),
        ...(personId !== undefined && { personId: personId || null }),
        ...(name?.trim() && { name: name.trim() }),
        ...(friendlyName !== undefined && { friendlyName: friendlyName?.trim() || null }),
        ...(make !== undefined && { make: make?.trim() || null }),
        ...(model !== undefined && { model: model?.trim() || null }),
        ...(serial !== undefined && { serial: serial?.trim() || null }),
        ...(assetTag !== undefined && { assetTag: assetTag?.trim() || null }),
        ...(ipAddress !== undefined && { ipAddress: ipAddress?.trim() || null }),
        ...(macAddress !== undefined && { macAddress: macAddress?.trim() || null }),
        ...(vlan !== undefined && { vlan: vlan?.trim() || null }),
        ...(switchPort !== undefined && { switchPort: switchPort?.trim() || null }),
        ...(managementUrl !== undefined && { managementUrl: managementUrl?.trim() || null }),
        ...(splashtopUrl !== undefined && { splashtopUrl: splashtopUrl?.trim() || null }),
        ...(driverUrl !== undefined && { driverUrl: driverUrl?.trim() || null }),
        ...(isFavorite !== undefined && { isFavorite }),
        ...(rdpEnabled !== undefined && { rdpEnabled }),
        ...(rdpHost !== undefined && { rdpHost: rdpHost?.trim() || null }),
        ...(rdpPort !== undefined && { rdpPort: rdpPort ? Number(rdpPort) : null }),
        ...(vncEnabled !== undefined && { vncEnabled }),
        ...(vncHost !== undefined && { vncHost: vncHost?.trim() || null }),
        ...(vncPort !== undefined && { vncPort: vncPort ? Number(vncPort) : null }),
        ...(purchaseDate !== undefined && { purchaseDate: purchaseDate ? new Date(purchaseDate) : null }),
        ...(warrantyExpiry !== undefined && { warrantyExpiry: warrantyExpiry ? new Date(warrantyExpiry) : null }),
        ...(room !== undefined && { room: room?.trim() || null }),
        ...(notes !== undefined && { notes: notes?.trim() || null }),
        ...(status && { status }),
        ...(firmwareVersion !== undefined && { firmwareVersion: firmwareVersion?.trim() || null }),
        ...(portCount !== undefined && { portCount: portCount !== null ? Number(portCount) : null }),
        ...(os !== undefined && { os: os?.trim() || null }),
        ...(ram !== undefined && { ram: ram?.trim() || null }),
        ...(cpu !== undefined && { cpu: cpu?.trim() || null }),
        ...(storageCapacity !== undefined && { storageCapacity: storageCapacity?.trim() || null }),
        ...(customFields !== undefined && { customFields }),
      },
      include: {
        assetType: { select: { id: true, name: true, template: true } },
        person: { select: { id: true, name: true, email: true } },
      },
    })

    if (historyEntries.length > 0) {
      await prisma.fieldHistory.createMany({ data: historyEntries })
    }

    return NextResponse.json(asset)
  } catch (e) {
    return NextResponse.json({ error: "Failed to update asset" }, { status: 500 })
  }
}
