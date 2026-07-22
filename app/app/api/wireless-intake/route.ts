/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { encrypt } from "@/lib/crypto"

// Server-to-server ingest from the wireless-installs portal ("Push to DocHub").
// Secret-gated (not session auth). Create-or-links Client -> Location -> Wi-Fi,
// deduped onto the right customer via Location.thSiteId <-> TicketHub TH_Site.
// Additive: never overwrites a populated Location field; Wi-Fi networks upsert
// by SSID so a re-push updates rather than duplicates.

function mapBand(b?: string | null): any {
  return ({ "2.4 GHz": "TWO_FOUR", "5 GHz": "FIVE", "6 GHz": "SIX", "Dual-band": "DUAL" } as Record<string, string>)[String(b || "")] || "DUAL"
}
function mapSecurity(s?: string | null): any {
  const u = String(s || "").toUpperCase()
  if (u === "NOPASS" || u === "OPEN" || u === "") return "OPEN"
  if (u.includes("WPA3")) return "WPA3_PERSONAL"
  return "WPA2_PERSONAL"
}

export async function POST(req: Request) {
  const secret = process.env.INTEGRATION_SECRET
  if (secret && req.headers.get("x-integration-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const b = (await req.json().catch(() => ({}))) as any

  // 1) Resolve the client + a location — prefer the TicketHub site link.
  let location = b.thSiteId
    ? await prisma.location.findUnique({ where: { thSiteId: String(b.thSiteId) }, include: { client: true } })
    : null
  let client = location?.client ?? null

  if (!client) {
    const name = String(b.client?.name || "").trim()
    if (!name) return NextResponse.json({ error: "client name (or a matching thSiteId) is required" }, { status: 400 })
    client = await prisma.client.findFirst({ where: { name: { equals: name, mode: "insensitive" }, isActive: true } })
    if (!client) client = await prisma.client.create({ data: { name, notes: "Created from a residential wireless install." } })
  }

  if (!location) {
    location = await prisma.location.findFirst({ where: { clientId: client.id }, orderBy: { createdAt: "asc" }, include: { client: true } })
    if (!location) {
      location = await prisma.location.create({
        data: {
          clientId: client.id,
          name: "Home",
          address: b.client?.address || null,
          ...(b.thSiteId ? { thSiteId: String(b.thSiteId) } : {}),
        },
        include: { client: true },
      })
    }
  }

  // 2) Additively fill ISP fields on the location; log the rest in notes.
  const upd: any = {}
  if (b.isp?.provider && !location.ispName) upd.ispName = b.isp.provider
  if (b.isp?.wanIp && !location.wanIp) upd.wanIp = b.isp.wanIp
  const extra = [
    b.isp?.connectionType && `Connection: ${b.isp.connectionType}`,
    b.isp?.dataPlan && `Data plan: ${b.isp.dataPlan}`,
    b.isp?.gateway && `Gateway: ${b.isp.gateway}`,
    Array.isArray(b.isp?.dns) && b.isp.dns.length && `DNS: ${b.isp.dns.join(", ")}`,
    b.lan?.ip && `LAN IP: ${b.lan.ip}`,
    b.lan?.subnet && `Subnet: ${b.lan.subnet}`,
    b.ticketNumber && `TicketHub #${b.ticketNumber}`,
  ].filter(Boolean).join("; ")
  if (extra) upd.notes = (location.notes ? location.notes + "\n" : "") + "[Wireless Portal] " + extra
  if (Object.keys(upd).length) await prisma.location.update({ where: { id: location.id }, data: upd })

  // 3) A Wi-Fi controller to hang the networks off of (Client -> Controller -> Network).
  let controller = await prisma.wifiController.findFirst({ where: { clientId: client.id } })
  if (!controller) controller = await prisma.wifiController.create({ data: { clientId: client.id, name: "Home Wi-Fi", type: "STANDALONE" } })

  // 4) Upsert the Wi-Fi network(s) by SSID; vault the PSK as an encrypted credential.
  const wifiResult: any[] = []
  async function upsertWifi(ssid: string | null | undefined, password: string | null | undefined, security: string | null | undefined, band: string | null | undefined, purpose: any, hidden: boolean) {
    if (!ssid) return
    let credentialId: string | null = null
    if (password && mapSecurity(security) !== "OPEN") {
      const cred = await prisma.credential.create({
        data: { clientId: client!.id, label: `Wi-Fi: ${ssid}`, encryptedPassword: encrypt(String(password)), dataSource: "WIRELESS_PORTAL" },
      })
      credentialId = cred.id
    }
    const existing = await prisma.wifiNetwork.findFirst({ where: { controllerId: controller!.id, ssid } })
    if (existing) {
      await prisma.wifiNetwork.update({
        where: { id: existing.id },
        data: { security: mapSecurity(security), band: mapBand(band), isHidden: !!hidden, ...(credentialId ? { credentialId } : {}) },
      })
      wifiResult.push({ ssid, updated: true })
    } else {
      await prisma.wifiNetwork.create({
        data: { controllerId: controller!.id, ssid, security: mapSecurity(security), band: mapBand(band), purpose, isHidden: !!hidden, credentialId },
      })
      wifiResult.push({ ssid, updated: false })
    }
  }

  await upsertWifi(b.wifi?.ssid, b.wifi?.password, b.wifi?.security, b.wifi?.band, "CORPORATE", !!b.wifi?.hidden)
  if (b.wifi?.guest?.ssid) {
    await upsertWifi(b.wifi.guest.ssid, b.wifi.guest.password, b.wifi.guest.security || "WPA", b.wifi?.band, "GUEST", !!b.wifi.guest.hidden)
  }

  return NextResponse.json({ ok: true, clientId: client.id, locationId: location.id, wifi: wifiResult })
}
