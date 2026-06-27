import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import {
  unifiLogin, unifiGetSites, unifiGetDevices, unifiLogout, unifiDeviceType,
  uiCloudGetDevices, uiCloudDeviceType,
} from "@/lib/unifi"
import { upsertNetworkAsset, type NetworkAssetData } from "@/lib/network-asset"

// Map UniFi device type → AssetType name
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

// Infer switch port count from UniFi model info.
// Shortname lookup first (most reliable); regex extract from model name as fallback.
function inferPortCount(model: string, shortname: string): number | null {
  const PORT_COUNT: Record<string, number> = {
    // USW Lite
    "USL8LP": 8, "USL16LP": 16,
    // USW
    "USW8": 8, "USW8P60": 8, "USW8P150": 8,
    "USW16P": 16,
    "USW24": 24, "USW24P250": 24, "USW24P500": 24,
    "USW48": 48, "USW48P500": 48, "USW48P750": 48,
    // USW Flex
    "USWFLEX": 5, "USWFLEXMINI": 5,
    // USW Pro
    "USW24PRO": 24, "USW48PRO": 48,
    "USWPRO24": 24, "USWPRO48": 48,
    // USW Pro Max
    "USW24PROMAX": 28, "USW48PROMAX": 52,
    // USW Enterprise
    "USW24EN": 28, "USW48EN": 52,
    // US (legacy)
    "US8": 8, "US8P60": 8, "US8P150": 8,
    "US16P150": 16,
    "US24P250": 24, "US24P500": 24,
    "US48P500": 48, "US48P750": 48,
  }
  const sn = (shortname || "").toUpperCase().replace(/-/g, "")
  if (PORT_COUNT[sn] != null) return PORT_COUNT[sn]

  // Regex fallback: first number in the model name in plausible port-count range
  const nums = [...(model || "").matchAll(/\b(\d+)\b/g)]
    .map(m => parseInt(m[1]))
    .filter(n => n >= 4 && n <= 96)
  return nums[0] ?? null
}

/** Create SwitchPort rows for a switch asset if none exist yet. */
async function scaffoldSwitchPorts(assetId: string, portCount: number | null) {
  if (!portCount || portCount < 1) return
  const existing = await prisma.switchPort.count({ where: { assetId } })
  if (existing > 0) return
  await prisma.switchPort.createMany({
    data: Array.from({ length: portCount }, (_, i) => ({
      assetId,
      portNumber: i + 1,
    })),
  })
}

function isNvrDevice(d: any): boolean {
  const model = (d.model || "").toLowerCase()
  const shortname = (d.shortname || "").toLowerCase()
  return (
    model.includes("nvr") ||
    shortname.startsWith("unvr") ||
    shortname.startsWith("udnvr") ||
    shortname.startsWith("udr")
  )
}

function isViewportDevice(d: any): boolean {
  return (d.model || "").toLowerCase().includes("viewport")
}

export async function POST(req: Request) {
  // Allow the nightly cron (Bearer CRON_SECRET) OR an authenticated session.
  const authHeader = req.headers.get("authorization")
  const isCron = !!process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`
  if (!isCron) {
    const { error } = await requireAuth()
    if (error) return error
  }
  try {
    const keys = [
      "integration:unifi:url",
      "integration:unifi:username",
      "integration:unifi:password",
      "integration:unifi:controllerType",
      "integration:unifi:apiKey",
      "integration:unifi:siteMap",
    ]
    const rows = await prisma.appSetting.findMany({ where: { key: { in: keys } } })
    const cfg: Record<string, string> = {}
    for (const r of rows) cfg[r.key] = r.value

    const controllerType = (cfg["integration:unifi:controllerType"] || "unifi_os") as "network_application" | "unifi_os" | "ui_cloud"
    const siteMap: Record<string, string> = cfg["integration:unifi:siteMap"]
      ? JSON.parse(cfg["integration:unifi:siteMap"])
      : {}

    const mappedSiteIds = Object.keys(siteMap).filter((k) => siteMap[k])
    if (mappedSiteIds.length === 0) {
      return NextResponse.json({ error: "No sites mapped to clients. Configure site mapping first." }, { status: 422 })
    }

    // Load asset types once for type mapping
    const assetTypes = await prisma.assetType.findMany({ select: { id: true, name: true } })
    const typeByName = Object.fromEntries(assetTypes.map(t => [t.name, t.id]))

    let totalDevices = 0
    let totalCameras = 0
    const errors: string[] = []

    // Returns the upserted asset's ID — delegates to the shared network-asset
    // upsert so UniFi, Meraki, SonicWall, and the manual POST share one path.
    async function upsertDevice(clientId: string, locationId: string | null, mac: string | null, assetData: NetworkAssetData): Promise<string> {
      return upsertNetworkAsset(clientId, locationId, { mac }, assetData, "UNIFI")
    }

    async function syncProtectDevices(
      clientId: string,
      locationId: string | null,
      hostId: string,
      clientName: string,
      devices: any[]
    ) {
      const protectDevices = devices.filter(d => d.productLine === "protect")
      if (protectDevices.length === 0) return

      // Find or create CameraSystem for this host (tagged in notes)
      const hostMarker = `unifi_host:${hostId}`
      let system = await prisma.cameraSystem.findFirst({
        where: { clientId, notes: { contains: hostMarker } },
      })

      // Upsert NVR as Asset and link it
      const nvrDevice = protectDevices.find(isNvrDevice)
      let nvrAssetId: string | null = null
      if (nvrDevice) {
        try {
          const mac = nvrDevice.mac?.toLowerCase() || null
          nvrAssetId = await upsertDevice(clientId, locationId, mac, {
            name: nvrDevice.name || nvrDevice.model || "UniFi NVR",
            assetTypeId: typeByName["NVR / DVR"] ?? null,
            make: "Ubiquiti",
            model: nvrDevice.model || null,
            ipAddress: nvrDevice.ip || null,
            macAddress: mac,
            serial: null,
            firmwareVersion: nvrDevice.version || null,
            managementUrl: nvrDevice.ip ? `https://${nvrDevice.ip}` : null,
          })
          totalDevices++
        } catch (e: any) {
          errors.push(`NVR ${nvrDevice.mac}: ${e.message}`)
        }
      }

      if (!system) {
        system = await prisma.cameraSystem.create({
          data: {
            clientId,
            name: `UniFi Protect — ${clientName}`,
            type: "UNIFI_NVR",
            assetId: nvrAssetId,
            notes: hostMarker,
          },
        })
      } else if (nvrAssetId && !system.assetId) {
        await prisma.cameraSystem.update({
          where: { id: system.id },
          data: { assetId: nvrAssetId },
        })
      }

      // Upsert cameras (skip NVR and Viewport)
      const cameraDevices = protectDevices.filter(d => !isNvrDevice(d) && !isViewportDevice(d))
      for (const d of cameraDevices) {
        try {
          const mac = d.mac?.toLowerCase() || null
          const existing = mac
            ? await prisma.camera.findFirst({
                where: { macAddress: mac, system: { clientId } },
              })
            : null

          if (existing) {
            await prisma.camera.update({
              where: { id: existing.id },
              data: {
                name: d.name || existing.name,
                model: d.model || null,
                ipAddress: d.ip || null,
                macAddress: mac,
                isActive: d.status === "online",
              },
            })
          } else {
            await prisma.camera.create({
              data: {
                systemId: system.id,
                name: d.name || d.model || "Unknown Camera",
                type: "IP_POE",
                make: "Ubiquiti",
                model: d.model || null,
                ipAddress: d.ip || null,
                macAddress: mac,
                isActive: d.status === "online",
              },
            })
          }
          totalCameras++
        } catch (e: any) {
          errors.push(`Camera ${d.mac}: ${e.message}`)
        }
      }
    }

    if (controllerType === "ui_cloud") {
      const apiKey = cfg["integration:unifi:apiKey"]?.trim()
      if (!apiKey) return NextResponse.json({ error: "UI.com API key not configured" }, { status: 422 })

      for (const hostId of mappedSiteIds) {
        const clientId = siteMap[hostId]
        try {
          const client = await prisma.client.findUnique({
            where: { id: clientId },
            include: { locations: { take: 1 } },
          })
          if (!client) { errors.push(`Client ${clientId} not found`); continue }

          const devices = await uiCloudGetDevices(apiKey, hostId)
          const networkDevices = devices.filter((d: any) => d.productLine !== "protect")

          for (const d of networkDevices) {
            try {
              const mac = d.mac?.toLowerCase() || null
              const type = uiCloudDeviceType(d)
              const assetTypeName = TYPE_MAP[type] ?? "Other"

              const assetId = await upsertDevice(clientId, client.locations[0]?.id || null, mac, {
                name: d.name || d.model || d.mac || d.id || "Unknown Device",
                assetTypeId: typeByName[assetTypeName] ?? null,
                make: "Ubiquiti",
                model: d.model || null,
                ipAddress: d.ip || null,
                macAddress: mac,
                serial: d.serial || null,
                firmwareVersion: d.firmwareVersion || d.version || null,
                managementUrl: d.ip ? `https://${d.ip}` : null,
              })
              totalDevices++

              // Auto-set portCount on switches if not already configured
              if (type === "SWITCH") {
                const pc = inferPortCount(d.model || "", d.shortname || "")
                if (pc) {
                  await prisma.asset.updateMany({
                    where: { id: assetId, portCount: null },
                    data: { portCount: pc },
                  })
                }
                const asset = await prisma.asset.findUnique({ where: { id: assetId }, select: { portCount: true } })
                await scaffoldSwitchPorts(assetId, asset?.portCount ?? pc ?? null)
              }
            } catch (devErr: any) {
              errors.push(`Device ${d.id}: ${devErr.message}`)
            }
          }

          await syncProtectDevices(clientId, client.locations[0]?.id || null, hostId, client.name, devices)
        } catch (hostErr: any) {
          errors.push(`Host ${hostId}: ${hostErr.message}`)
        }
      }
    } else {
      const url = cfg["integration:unifi:url"]?.trim()
      const username = cfg["integration:unifi:username"]?.trim()
      const password = cfg["integration:unifi:password"]?.trim()

      if (!url || !username || !password) {
        return NextResponse.json({ error: "Unifi credentials not configured" }, { status: 422 })
      }

      const unifiCfg = { url, username, password, controllerType }
      const { cookies, csrfToken } = await unifiLogin(unifiCfg)

      for (const siteId of mappedSiteIds) {
        const clientId = siteMap[siteId]
        try {
          const client = await prisma.client.findUnique({
            where: { id: clientId },
            include: { locations: { take: 1 } },
          })
          if (!client) { errors.push(`Client ${clientId} not found`); continue }

          const devices = await unifiGetDevices(unifiCfg, cookies, csrfToken, siteId)

          for (const d of devices) {
            try {
              const mac = d.mac?.toLowerCase() || null
              const type = unifiDeviceType(d.type)
              const assetTypeName = TYPE_MAP[type] ?? "Other"

              const assetId = await upsertDevice(clientId, client.locations[0]?.id || null, mac, {
                name: d.name || d.model || d.mac || d._id || "Unknown Device",
                assetTypeId: typeByName[assetTypeName] ?? null,
                make: "Ubiquiti",
                model: d.model || null,
                ipAddress: d.ip || null,
                macAddress: mac,
                serial: d.serial || null,
                firmwareVersion: d.version || null,
                managementUrl: d.ip ? `https://${d.ip}` : null,
              })
              totalDevices++

              // Auto-set portCount on switches if not already configured
              if (type === "SWITCH") {
                const pc = inferPortCount(d.model || "", d.shortname || "")
                if (pc) {
                  await prisma.asset.updateMany({
                    where: { id: assetId, portCount: null },
                    data: { portCount: pc },
                  })
                }
                const asset = await prisma.asset.findUnique({ where: { id: assetId }, select: { portCount: true } })
                await scaffoldSwitchPorts(assetId, asset?.portCount ?? pc ?? null)
              }
            } catch (devErr: any) {
              errors.push(`Device ${d._id}: ${devErr.message}`)
            }
          }
        } catch (siteErr: any) {
          errors.push(`Site ${siteId}: ${siteErr.message}`)
        }
      }

      await unifiLogout(unifiCfg, cookies, csrfToken)
    }

    return NextResponse.json({
      success: true,
      devices: totalDevices,
      cameras: totalCameras,
      sites: mappedSiteIds.length,
      errors: errors.slice(0, 20),
    })
  } catch (e: any) {
    return NextResponse.json({ error: `Sync failed: ${e.message}` }, { status: 500 })
  }
}
