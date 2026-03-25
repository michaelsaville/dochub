import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

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

export async function POST() {
  try {
    const results = { clients: 0, assets: 0, errors: [] as string[] }

    const customers = await fetchAllPages("/customers")
    for (const c of customers) {
      if (c.disabled) continue
      try {
        await prisma.client.upsert({
          where: { syncroId: String(c.id) },
          update: {
            name: getClientName(c),
            type: detectClientType(c),
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

        await prisma.asset.upsert({
          where: { syncroAssetId: String(a.id) },
          update: {
            name: a.name || p.computer_name || p.device_name || String(a.id),
            make: p.manufacturer || null,
            model: p.model || null,
            serial: a.asset_serial || null,
            macAddress: mac,
            managementUrl: a.external_rmm_link || null,
            splashtopUrl,
            warrantyExpiry,
            notes: p.notes || null,
            updatedAt: new Date(),
          },
          create: {
            locationId: client.locations[0].id,
            syncroAssetId: String(a.id),
            category: detectAssetCategory(a) as any,
            name: a.name || p.computer_name || p.device_name || String(a.id),
            make: p.manufacturer || null,
            model: p.model || null,
            serial: a.asset_serial || null,
            macAddress: mac,
            managementUrl: a.external_rmm_link || null,
            splashtopUrl,
            warrantyExpiry,
            notes: p.notes || null,
          },
        })
        results.assets++
      } catch (e: any) {
        results.errors.push(`Asset ${a.id}: ${e.message}`)
      }
    }

    return NextResponse.json({
      success: true,
      clients: results.clients,
      assets: results.assets,
      errors: results.errors.slice(0, 20),
    })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 })
  }
}
