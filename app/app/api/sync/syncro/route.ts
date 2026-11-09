import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { normalizeMac, normalizeSerial } from "@/lib/asset-identity"

const SYNCRO_BASE = `https://${process.env.SYNCRO_SUBDOMAIN}.syncromsp.com/api/v1`
const HEADERS = { Authorization: process.env.SYNCRO_API_KEY! }

async function fetchAllPages(endpoint: string) {
  const results: any[] = []
  let page = 1
  let totalPages = 1
  while (page <= totalPages) {
    const res = await fetch(`${SYNCRO_BASE}${endpoint}?page=${page}&per_page=100`, { headers: HEADERS })
    const data = await res.json()
    const key = Object.keys(data).find(k => Array.isArray(data[k]) && k !== "meta")
    if (key) results.push(...data[key])
    totalPages = data.meta?.total_pages ?? 1
    page++
  }
  return results
}

function detectClientType(customer: any): "BUSINESS" | "RESIDENTIAL" {
  return customer.business_name?.trim() ? "BUSINESS" : "RESIDENTIAL"
}

function getClientName(customer: any): string {
  return customer.business_name?.trim() || customer.fullname || `Customer ${customer.id}`
}

function detectAssetCategory(asset: any): string {
  const type = asset.asset_type?.toLowerCase() ?? ""
  const form = asset.properties?.form_factor?.toLowerCase() ?? ""
  if (type === "printer" || form.includes("printer")) return "PRINTER"
  if (form.includes("laptop") || form.includes("notebook")) return "LAPTOP"
  if (form.includes("desktop")) return "COMPUTER"
  if (form.includes("server")) return "SERVER"
  return "COMPUTER"
}

/**
 * An existing, not-yet-Syncro-linked asset in this client that is the same
 * hardware: matched on normalised serial (placeholders like "To be filled by
 * O.E.M." ignored), then MAC. Returns null when there's no match or when the
 * match is ambiguous (2+ candidates) — never guess.
 */
async function findClaimableAsset(clientId: string, serial: string | null, mac: string | null): Promise<string | null> {
  const nSerial = normalizeSerial(serial)
  const nMac = normalizeMac(mac)
  if (!nSerial && !nMac) return null
  const candidates = await prisma.asset.findMany({
    where: {
      location: { clientId },
      syncroAssetId: null,
      status: { notIn: ["RETIRED", "DISPOSED"] },
      OR: [{ serial: { not: null } }, { macAddress: { not: null } }],
    },
    select: { id: true, serial: true, macAddress: true },
  })
  if (nSerial) {
    const hits = candidates.filter((c) => normalizeSerial(c.serial) === nSerial)
    if (hits.length === 1) return hits[0].id
    if (hits.length > 1) return null
  }
  if (nMac) {
    const hits = candidates.filter((c) => normalizeMac(c.macAddress) === nMac)
    if (hits.length === 1) return hits[0].id
  }
  return null
}

export async function POST() {
  try {
    const results = { clients: 0, assets: 0, claimed: 0, errors: [] as string[] }

    const customers = await fetchAllPages("/customers")
    for (const c of customers) {
      if (c.disabled) continue
      try {
        await prisma.client.upsert({
          where: { syncroId: String(c.id) },
          update: {
            name: getClientName(c),
            type: detectClientType(c),
            lastSyncedAt: new Date(),
            updatedAt: new Date(),
          },
          create: {
            name: getClientName(c),
            type: detectClientType(c),
            syncroId: String(c.id),
            locations: {
              create: {
                name: "Primary location",
                address: c.address || null,
                city: c.city || null,
                state: c.state ? c.state.split(",")[0].trim() : null,
                zip: c.zip || null,
              },
            },
          },
        })
        results.clients++
      } catch (e: any) {
        results.errors.push(`Customer ${c.id}: ${e.message}`)
      }
    }

    const assets = await fetchAllPages("/customer_assets")
    for (const a of assets) {
      try {
        const client = await prisma.client.findUnique({
          where: { syncroId: String(a.customer_id) },
          include: { locations: { take: 1 } },
        })
        if (!client || !client.locations[0]) continue

        const p = a.properties ?? {}
        const mac = Array.isArray(p.mac) ? p.mac[0] : null
        const warrantyRaw = p.warranty_end_date
        const warrantyExpiry = warrantyRaw && !warrantyRaw.includes("Team plan")
          ? new Date(warrantyRaw) : null
        const splashtopUuid = p.syncro_splashtop_uuid || p["Splashtop UUID"] || null
        const splashtopUrl = splashtopUuid ? `splashtop://launch?uuid=${splashtopUuid}` : null

        // friendlyName = tech-given Syncro label; name = actual device hostname
        const syncroFriendlyName = a.name?.trim() || null
        const hostname = p.computer_name || p.device_name || a.name || String(a.id)

        const serial = a.asset_serial || null
        const fields = {
          name: hostname,
          friendlyName: syncroFriendlyName,
          make: p.manufacturer || null,
          model: p.model || null,
          serial,
          macAddress: mac,
          managementUrl: a.external_rmm_link || null,
          splashtopUrl,
          warrantyExpiry,
          notes: p.notes || null,
        }

        const linked = await prisma.asset.findUnique({
          where: { syncroAssetId: String(a.id) },
          select: { id: true },
        })
        if (linked) {
          await prisma.asset.update({
            where: { id: linked.id },
            data: { ...fields, updatedAt: new Date() },
          })
          results.assets++
          continue
        }

        // Not linked yet — before creating, try to CLAIM an existing row for the
        // same hardware in this client (e.g. an ITFlow import or a hand-entered
        // asset). Without this, every pre-existing asset got a Syncro twin.
        const claim = await findClaimableAsset(client.id, serial, mac)
        if (claim) {
          // Only overwrite with values Syncro actually has; keep the existing
          // row's notes/make/model when Syncro's are blank.
          const fill = Object.fromEntries(
            Object.entries(fields).filter(([, v]) => v !== null && v !== ""),
          )
          await prisma.asset.update({
            where: { id: claim },
            data: { ...fill, syncroAssetId: String(a.id), dataSource: "SYNCRO", updatedAt: new Date() },
          })
          results.claimed++
          results.assets++
          continue
        }

        await prisma.asset.create({
          data: {
            locationId: client.locations[0].id,
            syncroAssetId: String(a.id),
            category: detectAssetCategory(a) as any,
            dataSource: "SYNCRO",
            ...fields,
          },
        })
        results.assets++
      } catch (e: any) {
        results.errors.push(`Asset ${a.id}: ${e.message}`)
      }
    }

    // Step 3 — sync contacts
    const contacts = await fetchAllPages("/contacts")
    let contactCount = 0
    for (const c of contacts) {
      try {
        const client = await prisma.client.findUnique({
          where: { syncroId: String(c.customer_id) },
        })
        if (!client) continue
        await prisma.person.upsert({
          where: { syncroContactId: String(c.id) },
          update: {
            name: c.name || "Unknown",
            role: c.properties?.title || null,
            email: c.email || null,
            phone: c.processed_phone || c.phone || null,
            mobile: c.mobile || null,
            notes: c.notes || null,
            isActive: true,
            updatedAt: new Date(),
          },
          create: {
            clientId: client.id,
            syncroContactId: String(c.id),
            name: c.name || "Unknown",
            role: c.properties?.title || null,
            email: c.email || null,
            phone: c.processed_phone || c.phone || null,
            mobile: c.mobile || null,
            notes: c.notes || null,
            isActive: true,
          },
        })
        contactCount++
      } catch (e: any) {
        results.errors.push(`Contact ${c.id}: ${e.message}`)
      }
    }

    return NextResponse.json({
      success: true,
      clients: results.clients,
      assets: results.assets,
      claimedExisting: results.claimed,
      contacts: contactCount,
      errors: results.errors.slice(0, 20),
    })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 })
  }
}
