import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { upsertNetworkAsset, loadAssetTypeMap, NETWORK_TYPE_MAP } from "@/lib/network-asset"

const MERAKI_BASE = "https://api.meraki.com/api/v1"

function merakiDeviceType(productType: string, model: string): string {
  const p = productType?.toLowerCase() ?? ""
  const m = model?.toLowerCase() ?? ""
  if (p === "wireless" || m.startsWith("mr") || m.startsWith("cw")) return "ACCESS_POINT"
  if (p === "switch" || m.startsWith("ms")) return "SWITCH"
  if (p === "appliance" || m.startsWith("mx") || m.startsWith("z")) return "FIREWALL"
  if (p === "cellulargateway") return "ROUTER"
  return "OTHER"
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
    const rows = await prisma.appSetting.findMany({
      where: { key: { in: ["integration:meraki:apiKey", "integration:meraki:orgId", "integration:meraki:networkMap"] } },
    })
    const cfg: Record<string, string> = {}
    for (const r of rows) cfg[r.key] = r.value

    const apiKey = cfg["integration:meraki:apiKey"]?.trim()
    const orgId = cfg["integration:meraki:orgId"]?.trim()
    const networkMap: Record<string, string> = cfg["integration:meraki:networkMap"]
      ? JSON.parse(cfg["integration:meraki:networkMap"])
      : {}

    if (!apiKey || !orgId) return NextResponse.json({ error: "Meraki API key and org ID required" }, { status: 422 })

    const mappedNetworkIds = Object.keys(networkMap).filter((k) => networkMap[k])
    if (mappedNetworkIds.length === 0) {
      return NextResponse.json({ error: "No networks mapped to clients" }, { status: 422 })
    }

    const headers = { "X-Cisco-Meraki-API-Key": apiKey, "Content-Type": "application/json" }

    // Fetch all devices + statuses in parallel
    const [devicesRes, statusesRes] = await Promise.all([
      fetch(`${MERAKI_BASE}/organizations/${orgId}/devices`, { headers }),
      fetch(`${MERAKI_BASE}/organizations/${orgId}/devices/statuses`, { headers }),
    ])
    const allDevices: any[] = await devicesRes.json()
    const allStatuses: any[] = await statusesRes.json()

    // Build status map by serial
    const statusMap: Record<string, string> = {}
    for (const s of allStatuses) statusMap[s.serial] = s.status

    const typeByName = await loadAssetTypeMap()
    let totalDevices = 0
    const errors: string[] = []

    for (const networkId of mappedNetworkIds) {
      const clientId = networkMap[networkId]
      try {
        const client = await prisma.client.findUnique({
          where: { id: clientId },
          include: { locations: { take: 1 } },
        })
        if (!client) { errors.push(`Client ${clientId} not found`); continue }

        const networkDevices = allDevices.filter((d) => d.networkId === networkId)

        for (const d of networkDevices) {
          try {
            const type = merakiDeviceType(d.productType, d.model)
            const status = statusMap[d.serial] ?? "unknown"
            const notesLine = status !== "online" ? `Status: ${status}` : null
            const assetTypeName = NETWORK_TYPE_MAP[type] ?? "Other"

            await upsertNetworkAsset(
              clientId,
              client.locations[0]?.id || null,
              { mac: d.mac?.toLowerCase() || null, serial: d.serial || null },
              {
                name: d.name || d.model || d.serial,
                assetTypeId: typeByName[assetTypeName] ?? null,
                make: "Cisco Meraki",
                model: d.model || null,
                ipAddress: d.lanIp || null,
                macAddress: d.mac?.toLowerCase() || null,
                serial: d.serial || null,
                firmwareVersion: d.firmware || null,
                managementUrl: "https://dashboard.meraki.com",
                notes: notesLine,
              },
              "MERAKI",
            )
            totalDevices++
          } catch (devErr: any) {
            errors.push(`Device ${d.serial}: ${devErr.message}`)
          }
        }
      } catch (netErr: any) {
        errors.push(`Network ${networkId}: ${netErr.message}`)
      }
    }

    return NextResponse.json({ success: true, devices: totalDevices, networks: mappedNetworkIds.length, errors: errors.slice(0, 20) })
  } catch (e: any) {
    return NextResponse.json({ error: `Sync failed: ${e.message}` }, { status: 500 })
  }
}
