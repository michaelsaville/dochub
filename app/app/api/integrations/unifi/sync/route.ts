import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import {
  unifiLogin, unifiGetSites, unifiGetDevices, unifiLogout, unifiDeviceType,
  uiCloudGetDevices, uiCloudDeviceType,
} from "@/lib/unifi"

export async function POST() {
  const { error } = await requireAuth()
  if (error) return error
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

    let totalDevices = 0
    const errors: string[] = []

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

          for (const d of devices) {
            try {
              const mac = d.mac?.toLowerCase() || null
              const type = uiCloudDeviceType(d)
              const name = d.name || d.model || d.id
              const externalId = d.id

              const upsertData = {
                clientId,
                locationId: client.locations[0]?.id || null,
                name,
                type: type as any,
                make: "Ubiquiti",
                model: d.model || null,
                ipAddress: d.ip || null,
                macAddress: mac,
                serial: d.serial || null,
                firmwareVersion: d.firmwareVersion || d.version || null,
                managementUrl: d.ip ? `https://${d.ip}` : null,
                dataSource: "UNIFI",
                externalId,
                lastSeenAt: new Date(),
                uptime: typeof d.uptime === "number" ? d.uptime : null,
                connectedClients: typeof d.connectedDevicesCount === "number" ? d.connectedDevicesCount : null,
                isActive: true,
              }

              const existing = await prisma.networkDevice.findFirst({
                where: {
                  OR: [
                    { externalId, clientId },
                    ...(mac ? [{ macAddress: mac, clientId }] : []),
                  ],
                },
              })

              if (existing) {
                await prisma.networkDevice.update({ where: { id: existing.id }, data: upsertData })
              } else {
                await prisma.networkDevice.create({ data: upsertData })
              }
              totalDevices++
            } catch (devErr: any) {
              errors.push(`Device ${d.id}: ${devErr.message}`)
            }
          }
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
              const name = d.name || d.model || d._id
              const externalId = d._id

              const upsertData = {
                clientId,
                locationId: client.locations[0]?.id || null,
                name,
                type: type as any,
                make: "Ubiquiti",
                model: d.model || null,
                ipAddress: d.ip || null,
                macAddress: mac,
                serial: d.serial || null,
                firmwareVersion: d.version || null,
                managementUrl: d.ip ? `https://${d.ip}` : null,
                dataSource: "UNIFI",
                externalId,
                lastSeenAt: new Date(),
                uptime: typeof d.uptime === "number" ? d.uptime : null,
                connectedClients: typeof d.num_sta === "number" ? d.num_sta : null,
                isActive: true,
              }

              const existing = await prisma.networkDevice.findFirst({
                where: {
                  OR: [
                    { externalId, clientId },
                    ...(mac ? [{ macAddress: mac, clientId }] : []),
                  ],
                },
              })

              if (existing) {
                await prisma.networkDevice.update({ where: { id: existing.id }, data: upsertData })
              } else {
                await prisma.networkDevice.create({ data: upsertData })
              }
              totalDevices++
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
      sites: mappedSiteIds.length,
      errors: errors.slice(0, 20),
    })
  } catch (e: any) {
    return NextResponse.json({ error: `Sync failed: ${e.message}` }, { status: 500 })
  }
}
