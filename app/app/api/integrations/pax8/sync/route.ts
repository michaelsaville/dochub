import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

const PAX8_TOKEN_URL = "https://id.pax8.com/auth/realms/pax8-b2b/protocol/openid-connect/token"
const PAX8_BASE = "https://api.pax8.com/v1"

async function getPax8Token(clientId: string, clientSecret: string): Promise<string> {
  const res = await fetch(PAX8_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })
  if (!res.ok) throw new Error(`Pax8 auth failed: HTTP ${res.status}`)
  const data = await res.json()
  if (!data.access_token) throw new Error("No access_token in Pax8 auth response")
  return data.access_token
}

async function getPax8Subscriptions(pax8CompanyId: string, token: string): Promise<any[]> {
  const headers = { Authorization: `Bearer ${token}` }
  const subs: any[] = []
  let page = 0
  while (true) {
    const r = await fetch(`${PAX8_BASE}/subscriptions?companyId=${pax8CompanyId}&page=${page}&size=200`, { headers })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const data = await r.json()
    const content: any[] = data.content ?? data ?? []
    subs.push(...content)
    if (content.length < 200) break
    page++
  }
  return subs
}

export async function POST() {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const rows = await prisma.appSetting.findMany({
      where: { key: { in: ["integration:pax8:clientId", "integration:pax8:clientSecret", "integration:pax8:companyMap"] } },
    })
    const cfg: Record<string, string> = {}
    for (const r of rows) cfg[r.key] = r.value

    const clientId = cfg["integration:pax8:clientId"]?.trim()
    const clientSecret = cfg["integration:pax8:clientSecret"]?.trim()
    const companyMap: Record<string, string> = cfg["integration:pax8:companyMap"]
      ? JSON.parse(cfg["integration:pax8:companyMap"])
      : {}

    if (!clientId || !clientSecret) {
      return NextResponse.json({ error: "Pax8 client ID and secret not configured" }, { status: 422 })
    }

    const mappedCompanyIds = Object.keys(companyMap).filter(k => companyMap[k])
    if (mappedCompanyIds.length === 0) {
      return NextResponse.json({ error: "No Pax8 companies mapped to clients" }, { status: 422 })
    }

    const token = await getPax8Token(clientId, clientSecret)

    let totalLicenses = 0
    const errors: string[] = []

    for (const pax8CompanyId of mappedCompanyIds) {
      const dochubClientId = companyMap[pax8CompanyId]
      try {
        const client = await prisma.client.findUnique({ where: { id: dochubClientId } })
        if (!client) { errors.push(`Client ${dochubClientId} not found`); continue }

        const subs = await getPax8Subscriptions(pax8CompanyId, token)

        for (const sub of subs) {
          try {
            // Skip cancelled/terminated subscriptions
            const status: string = sub.status ?? "Unknown"
            if (["Cancelled", "Terminated"].includes(status)) continue

            const quantity: number = sub.quantity ?? 1
            const unitPrice: number = sub.price ?? 0
            const billingTerm: string = sub.billingTerm ?? "Monthly"

            // Normalize cost to $/month total
            let costPerMonth = unitPrice * quantity
            if (billingTerm === "Annual") costPerMonth = costPerMonth / 12
            else if (billingTerm === "2Year") costPerMonth = costPerMonth / 24
            else if (billingTerm === "3Year") costPerMonth = costPerMonth / 36

            const renewalDate = sub.commitmentTerm?.endDate ?? sub.endDate ?? null

            const upsertData = {
              clientId: dochubClientId,
              name: sub.productName ?? sub.productId ?? "Unknown Product",
              vendor: sub.vendorName ?? null,
              seats: quantity,
              cost: Math.round(costPerMonth * 100) / 100,
              billingTerm,
              status,
              pax8Id: sub.id,
              purchaseDate: sub.startDate ? new Date(sub.startDate) : null,
              renewalDate: renewalDate ? new Date(renewalDate) : null,
              dataSource: "PAX8",
              isActive: true,
            }

            const existing = await prisma.license.findFirst({
              where: { pax8Id: sub.id, clientId: dochubClientId },
            })

            if (existing) {
              await prisma.license.update({
                where: { id: existing.id },
                // Don't overwrite assignedUserId — preserve user assignments
                data: {
                  name: upsertData.name,
                  vendor: upsertData.vendor,
                  seats: upsertData.seats,
                  cost: upsertData.cost,
                  billingTerm: upsertData.billingTerm,
                  status: upsertData.status,
                  purchaseDate: upsertData.purchaseDate,
                  renewalDate: upsertData.renewalDate,
                  isActive: true,
                },
              })
            } else {
              await prisma.license.create({ data: upsertData })
            }
            totalLicenses++
          } catch (subErr: any) {
            errors.push(`Sub ${sub.id}: ${subErr.message}`)
          }
        }
      } catch (compErr: any) {
        errors.push(`Company ${pax8CompanyId}: ${compErr.message}`)
      }
    }

    return NextResponse.json({ success: true, licenses: totalLicenses, companies: mappedCompanyIds.length, errors: errors.slice(0, 20) })
  } catch (e: any) {
    return NextResponse.json({ error: `Sync failed: ${e.message}` }, { status: 500 })
  }
}
