import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import {
  localLogin, localLogout, localGetNetworks, localGetDhcpLeases,
  localGetWifiNetworks, localGetPortTables,
  type LocalControllerAuth,
} from "@/lib/unifi"

/**
 * POST /api/integrations/unifi/sync-local
 *
 * Connects to each Location with a tailscaleIp, authenticates to the local
 * UniFi controller, and syncs:
 *   - VLANs / network configs  -> Vlan + Subnet
 *   - DHCP active clients      -> IpAssignment
 *   - WiFi SSIDs               -> WifiNetwork (via WifiController)
 *   - Switch port tables       -> SwitchPort live data (PoE, uplink, speed)
 */
export async function POST() {
  const { error } = await requireAuth()
  if (error) return error

  try {
    // Get controller credentials from AppSettings
    const keys = ["integration:unifi:username", "integration:unifi:password"]
    const rows = await prisma.appSetting.findMany({ where: { key: { in: keys } } })
    const cfg: Record<string, string> = {}
    for (const r of rows) cfg[r.key] = r.value

    const username = cfg["integration:unifi:username"]?.trim()
    const password = cfg["integration:unifi:password"]?.trim()
    if (!username || !password) {
      return NextResponse.json({ error: "UniFi credentials not configured" }, { status: 422 })
    }

    // Find all locations with a Tailscale IP configured
    const locations = await prisma.location.findMany({
      where: { tailscaleIp: { not: null } },
      include: {
        client: { select: { id: true, name: true } },
        assets: { where: { dataSource: "UNIFI" }, select: { id: true, macAddress: true, portCount: true } },
      },
    })

    if (locations.length === 0) {
      return NextResponse.json({ error: "No locations have a Tailscale IP configured" }, { status: 422 })
    }

    const results: { location: string; client: string; vlans: number; subnets: number; leases: number; wifiNetworks: number; portUpdates: number; error?: string }[] = []

    for (const loc of locations) {
      const clientId = loc.client.id
      let auth: LocalControllerAuth | null = null

      try {
        auth = await localLogin(loc.tailscaleIp!, username, password, "unifi_os")

        // ── 1. Sync VLANs + Subnets ──────────────────────────────────────
        const networks = await localGetNetworks(auth)
        let vlanCount = 0
        let subnetCount = 0

        for (const net of networks) {
          // Sync VLAN (if VLAN-tagged)
          if (net.vlanId != null && net.vlanId > 0) {
            await prisma.vlan.upsert({
              where: { clientId_vlanNumber: { clientId, vlanNumber: net.vlanId } },
              create: {
                clientId,
                vlanNumber: net.vlanId,
                name: net.name,
                description: net.purpose !== "corporate" ? net.purpose : null,
              },
              update: { name: net.name },
            })
            vlanCount++
          }

          // Sync Subnet (if has IP range)
          if (net.subnet) {
            const existing = await prisma.subnet.findFirst({
              where: { clientId, cidr: net.subnet },
            })
            if (existing) {
              await prisma.subnet.update({
                where: { id: existing.id },
                data: {
                  gateway: net.gateway,
                  vlan: net.vlanId ? String(net.vlanId) : null,
                  description: net.name,
                  locationId: loc.id,
                },
              })
            } else {
              await prisma.subnet.create({
                data: {
                  clientId,
                  locationId: loc.id,
                  cidr: net.subnet,
                  gateway: net.gateway,
                  vlan: net.vlanId ? String(net.vlanId) : null,
                  description: net.name,
                },
              })
            }
            subnetCount++
          }
        }

        // ── 2. Sync DHCP leases → IpAssignment ───────────────────────────
        const leases = await localGetDhcpLeases(auth)
        let leaseCount = 0

        // Build MAC→asset lookup for this location
        const macToAssetId = new Map<string, string>()
        for (const asset of loc.assets) {
          if (asset.macAddress) macToAssetId.set(asset.macAddress.toLowerCase(), asset.id)
        }

        // Find subnets for this client to match leases
        const clientSubnets = await prisma.subnet.findMany({
          where: { clientId },
          select: { id: true, cidr: true },
        })

        for (const lease of leases) {
          // Match lease IP to a subnet
          const matchedSubnet = clientSubnets.find(s => ipInCidr(lease.ip, s.cidr))
          if (!matchedSubnet) continue

          const assetId = macToAssetId.get(lease.mac) || null

          await prisma.ipAssignment.upsert({
            where: { subnetId_ipAddress: { subnetId: matchedSubnet.id, ipAddress: lease.ip } },
            create: {
              subnetId: matchedSubnet.id,
              ipAddress: lease.ip,
              hostname: lease.hostname || null,
              assetId,
            },
            update: {
              hostname: lease.hostname || undefined,
              assetId: assetId || undefined,
            },
          })
          leaseCount++
        }

        // ── 3. Sync WiFi SSIDs → WifiNetwork ─────────────────────────────
        const wifiConfigs = await localGetWifiNetworks(auth)
        let wifiCount = 0

        // Ensure a WifiController record exists for this client
        let controller = await prisma.wifiController.findFirst({
          where: { clientId, type: "UNIFI" },
        })
        if (!controller) {
          controller = await prisma.wifiController.create({
            data: {
              clientId,
              name: `UniFi Controller (${loc.name})`,
              type: "UNIFI",
              managementUrl: `https://${loc.tailscaleIp}`,
            },
          })
        }

        for (const wifi of wifiConfigs) {
          if (!wifi.ssid) continue

          const securityMap: Record<string, string> = {
            wpapsk: "WPA2_PERSONAL",
            "wpa-eap": "WPA2_ENTERPRISE",
            wpa3: "WPA3_PERSONAL",
            "wpa3-eap": "WPA3_ENTERPRISE",
            "wpa-mixed": "WPA2_WPA3_TRANSITION",
            open: "OPEN",
          }
          const security = securityMap[wifi.security] || "WPA2_PERSONAL"

          // Upsert by controller + SSID name
          const existing = await prisma.wifiNetwork.findFirst({
            where: { controllerId: controller.id, ssid: wifi.ssid },
          })

          if (existing) {
            await prisma.wifiNetwork.update({
              where: { id: existing.id },
              data: {
                security: security as any,
                vlanId: wifi.vlanId,
                isHidden: wifi.isHidden,
                isActive: wifi.isEnabled,
              },
            })
          } else {
            await prisma.wifiNetwork.create({
              data: {
                controllerId: controller.id,
                ssid: wifi.ssid,
                security: security as any,
                vlanId: wifi.vlanId,
                isHidden: wifi.isHidden,
                isActive: wifi.isEnabled,
              },
            })
          }
          wifiCount++
        }

        // ── 4. Sync live port data from switches ──────────────────────────
        const portTables = await localGetPortTables(auth)
        let portUpdates = 0

        for (const sw of portTables) {
          // Find the switch asset by MAC
          const switchAsset = loc.assets.find(a => a.macAddress?.toLowerCase() === sw.mac)
          if (!switchAsset) continue

          for (const port of sw.portTable) {
            const portNumber = port.portIdx
            if (!portNumber || portNumber < 1) continue

            // Update existing SwitchPort with live data
            const existing = await prisma.switchPort.findFirst({
              where: { assetId: switchAsset.id, portNumber },
            })
            if (existing) {
              await prisma.switchPort.update({
                where: { id: existing.id },
                data: {
                  isUplink: port.isUplink,
                  isPoe: port.poeEnable,
                },
              })
              portUpdates++
            }
          }
        }

        results.push({
          location: loc.name,
          client: loc.client.name,
          vlans: vlanCount,
          subnets: subnetCount,
          leases: leaseCount,
          wifiNetworks: wifiCount,
          portUpdates,
        })
      } catch (e: any) {
        results.push({
          location: loc.name,
          client: loc.client.name,
          vlans: 0, subnets: 0, leases: 0, wifiNetworks: 0, portUpdates: 0,
          error: e.message,
        })
      } finally {
        if (auth) await localLogout(auth).catch(() => {})
      }
    }

    return NextResponse.json({ success: true, locations: results.length, results })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

/** Check if an IP address falls within a CIDR range */
function ipInCidr(ip: string, cidr: string): boolean {
  const [net, bits] = cidr.split("/")
  if (!net || !bits) return false
  const mask = ~(2 ** (32 - parseInt(bits)) - 1) >>> 0
  const ipNum = ipToNum(ip)
  const netNum = ipToNum(net)
  return (ipNum & mask) === (netNum & mask)
}

function ipToNum(ip: string): number {
  return ip.split(".").reduce((acc, oct) => (acc << 8) + parseInt(oct), 0) >>> 0
}
