import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

const HP_BASE = "https://api.arubainstanton.com/v1"

function hpDeviceType(type: string, model: string): string {
  const t = type?.toLowerCase() ?? ""
  const m = model?.toLowerCase() ?? ""
  if (t.includes("ap") || m.includes("ap") || t.includes("access")) return "ACCESS_POINT"
  if (t.includes("switch") || m.includes("switch") || m.includes("1930") || m.includes("1960")) return "SWITCH"
  if (t.includes("gateway") || t.includes("router")) return "ROUTER"
  return "ACCESS_POINT" // HP Instant On is mostly APs + small switches
}

export async function POST() {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const rows = await prisma.appSetting.findMany({
      where: { key: { in: ["integration:hpinstanton:bearerToken", "integration:hpinstanton:siteMap"] } },
    })
    const cfg: Record<string, string> = {}
    for (const r of rows) cfg[r.key] = r.value

    const token = cfg["integration:hpinstanton:bearerToken"]?.trim()
    const siteMap: Record<string, string> = cfg["integration:hpinstanton:siteMap"]
      ? JSON.parse(cfg["integration:hpinstanton:siteMap"])
      : {}

    if (!token) return NextResponse.json({ error: "HP Instant On bearer token not configured" }, { status: 422 })

    const mappedSiteIds = Object.keys(siteMap).filter((k) => siteMap[k])
    if (mappedSiteIds.length === 0) return NextResponse.json({ error: "No sites mapped to clients" }, { status: 422 })

    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    let totalDevices = 0
    const errors: string[] = []

    for (const siteId of mappedSiteIds) {
      const clientId = siteMap[siteId]
      try {
        const client = await prisma.client.findUnique({
          where: { id: clientId },
          include: { locations: { take: 1 } },
        })
        if (!client) { errors.push(`Client ${clientId} not found`); continue }

        const res = await fetch(`${HP_BASE}/sites/${siteId}/devices`, { headers })
        if (!res.ok) { errors.push(`Site ${siteId}: HTTP ${res.status}`); continue }
        const data = await res.json()
        const devices: any[] = data.devices || data || []

        for (const d of devices) {
          try {
            const type = hpDeviceType(d.type || d.deviceType || "", d.model || "")
            const mac = d.macAddress?.toLowerCase() || d.mac?.toLowerCase() || null
            const upsertData = {
              clientId,
              locationId: client.locations[0]?.id || null,
              name: d.name || d.hostname || d.model || d.id,
              type: type as any,
              make: "HP / Aruba",
              model: d.model || null,
              ipAddress: d.ipAddress || d.ip || null,
              macAddress: mac,
              serial: d.serialNumber || d.serial || null,
              firmwareVersion: d.firmwareVersion || d.firmware || null,
              managementUrl: `https://app.arubainstanton.com`,
              dataSource: "HPINSTANTON",
              externalId: d.id || d.serial || mac,
              lastSeenAt: new Date(),
              isActive: true,
            }

            const existing = await prisma.networkDevice.findFirst({
              where: { OR: [{ externalId: upsertData.externalId, clientId }, ...(mac ? [{ macAddress: mac, clientId }] : [])] },
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
      } catch (siteErr: any) {
        errors.push(`Site ${siteId}: ${siteErr.message}`)
      }
    }

    return NextResponse.json({ success: true, devices: totalDevices, sites: mappedSiteIds.length, errors: errors.slice(0, 20) })
  } catch (e: any) {
    return NextResponse.json({ error: `Sync failed: ${e.message}` }, { status: 500 })
  }
}
