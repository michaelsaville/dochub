import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"
import { isIpv4, ipInCidr } from "@/lib/cidr"

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
        person: { select: { id: true, name: true, email: true, jobTitle: true, phone: true, m365Upn: true } },
        credentials: {
          where: { isRetired: false },
          select: { id: true, label: true, username: true, url: true, encryptedPassword: true },
          orderBy: { label: "asc" },
        },
      },
    })
    if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 })

    // RBAC: a scoped tech cannot view an asset for a client outside their set.
    if (asset.location?.client?.id && !scopeAllows(await getClientScope(), asset.location.client.id))
      return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })

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
        include: {
          switchPorts: {
            orderBy: { portNumber: "asc" },
            include: {
              vlan: { select: { id: true, vlanNumber: true, name: true, color: true } },
              asset: { select: { id: true, name: true, friendlyName: true } },
            },
          },
        },
      }),
      // NVR/DVR: fetch camera systems with full camera details
      prisma.cameraSystem.findMany({
        where: { assetId: id },
        include: {
          cameras: {
            where: { isActive: true },
            orderBy: { name: "asc" },
            select: {
              id: true, name: true, location: true, make: true, model: true,
              ipAddress: true, resolution: true, type: true,
              recordingSchedule: true, coverageNotes: true, isActive: true,
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
      endOfLife, endOfSupport, leaseEnd, cost,
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
        ...(endOfLife !== undefined && { endOfLife: endOfLife ? new Date(endOfLife) : null }),
        ...(endOfSupport !== undefined && { endOfSupport: endOfSupport ? new Date(endOfSupport) : null }),
        ...(leaseEnd !== undefined && { leaseEnd: leaseEnd ? new Date(leaseEnd) : null }),
        ...(cost !== undefined && { cost: cost === "" || cost === null || !Number.isFinite(Number(cost)) ? null : Math.round(Number(cost) * 100) }),
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
        person: { select: { id: true, name: true, email: true, jobTitle: true, phone: true, m365Upn: true } },
      },
    })

    if (historyEntries.length > 0) {
      await prisma.fieldHistory.createMany({ data: historyEntries })
    }

    // "Enter once" at EDIT time too: when the asset's IP/MAC change, keep the
    // primary interface + its IPAM row in sync so the same datum doesn't drift
    // across the 4 places the create-time spawn unified. Best-effort, non-fatal.
    const ipChanged = ipAddress !== undefined && (ipAddress?.trim() || null) !== (current?.ipAddress ?? null)
    const macChanged = macAddress !== undefined && (macAddress?.trim() || null) !== (current?.macAddress ?? null)
    if (ipChanged || macChanged) {
      try {
        const newIp = ipAddress?.trim() || null
        const newMac = macAddress?.trim() || null
        const primary = await prisma.assetInterface.findFirst({ where: { assetId: id, isPrimary: true } })
        if (primary) {
          await prisma.assetInterface.update({
            where: { id: primary.id },
            data: { ...(ipChanged && { ipAddress: newIp }), ...(macChanged && { macAddress: newMac }) },
          })
        } else if (newIp || newMac) {
          await prisma.assetInterface.create({
            data: { assetId: id, name: "Primary", type: "ETHERNET", ipAddress: newIp, macAddress: newMac, isPrimary: true },
          })
        }
        // Move the asset's existing IPAM row to the new IP when it still fits the
        // same subnet; never reassign across subnets automatically.
        if (ipChanged && newIp && isIpv4(newIp)) {
          const existingAssign = await prisma.ipAssignment.findFirst({
            where: { assetId: id }, include: { subnet: { select: { cidr: true } } },
          })
          if (existingAssign && existingAssign.ipAddress !== newIp && ipInCidr(newIp, existingAssign.subnet.cidr)) {
            // Guard the @@unique([subnetId, ipAddress]) — only move if the target is free.
            const clash = await prisma.ipAssignment.findUnique({
              where: { subnetId_ipAddress: { subnetId: existingAssign.subnetId, ipAddress: newIp } },
            })
            if (!clash) {
              await prisma.ipAssignment.update({ where: { id: existingAssign.id }, data: { ipAddress: newIp } })
            }
          }
        }
      } catch (e) {
        console.error("[asset PATCH] interface/IPAM sync failed", id, String(e))
      }
    }

    return NextResponse.json(asset)
  } catch (e) {
    return NextResponse.json({ error: "Failed to update asset" }, { status: 500 })
  }
}
