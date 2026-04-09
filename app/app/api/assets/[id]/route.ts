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
        primaryUser: { select: { id: true, name: true, email: true, phone: true, m365Upn: true, jobTitle: true } },
        contact: { select: { id: true, name: true, role: true, email: true, phone: true } },
        credentials: {
          where: { isRetired: false },
          select: { id: true, label: true, username: true, url: true, encryptedPassword: true },
          orderBy: { label: "asc" },
        },
      },
    })
    if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 })

    // Reverse-lookup: which phone/camera systems is this asset linked to?
    const [linkedPhoneSystems, linkedCameraSystems] = await Promise.all([
      prisma.phoneSystem.findMany({
        where: { assetId: id },
        select: { id: true, name: true, type: true, clientId: true },
      }),
      prisma.cameraSystem.findMany({
        where: { assetId: id },
        select: { id: true, name: true, type: true, clientId: true },
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
      status, primaryUserId, contactId,
      firmwareVersion, portCount, os, ram, cpu, storageCapacity, customFields,
    } = body

    // Fetch current values for audit trail
    const current = await prisma.asset.findUnique({
      where: { id },
      select: { ipAddress: true, macAddress: true, status: true, primaryUserId: true, vlan: true, switchPort: true, firmwareVersion: true },
    })

    const changedBy = session?.user?.name ?? "unknown"
    const historyEntries: { entityType: string; entityId: string; field: string; oldValue: string | null; newValue: string | null; changedBy: string }[] = []

    if (current) {
      const tracked: { field: string; oldVal: string | null | undefined; newVal: string | null | undefined }[] = [
        { field: "ipAddress",    oldVal: current.ipAddress,    newVal: ipAddress    !== undefined ? (ipAddress?.trim() || null)    : undefined },
        { field: "macAddress",   oldVal: current.macAddress,   newVal: macAddress   !== undefined ? (macAddress?.trim() || null)   : undefined },
        { field: "status",       oldVal: current.status,       newVal: status       !== undefined ? status                         : undefined },
        { field: "primaryUserId",oldVal: current.primaryUserId,newVal: primaryUserId!== undefined ? (primaryUserId || null)        : undefined },
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
        ...(contactId !== undefined && { contactId: contactId || null }),
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
        ...(primaryUserId !== undefined && { primaryUserId: primaryUserId || null }),
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
        primaryUser: { select: { id: true, name: true } },
        contact: { select: { id: true, name: true } },
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
