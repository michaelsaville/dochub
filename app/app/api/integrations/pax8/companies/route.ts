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

export async function GET() {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const rows = await prisma.appSetting.findMany({
      where: { key: { in: ["integration:pax8:clientId", "integration:pax8:clientSecret"] } },
    })
    const cfg: Record<string, string> = {}
    for (const r of rows) cfg[r.key] = r.value

    const clientId = cfg["integration:pax8:clientId"]?.trim()
    const clientSecret = cfg["integration:pax8:clientSecret"]?.trim()
    if (!clientId || !clientSecret) {
      return NextResponse.json({ error: "Pax8 client ID and secret not configured" }, { status: 422 })
    }

    const token = await getPax8Token(clientId, clientSecret)
    const headers = { Authorization: `Bearer ${token}` }

    // Paginate through all companies
    const companies: { id: string; name: string }[] = []
    let page = 0
    while (true) {
      const r = await fetch(`${PAX8_BASE}/companies?page=${page}&size=200`, { headers })
      if (!r.ok) {
        const text = await r.text()
        return NextResponse.json({ error: `Pax8 API error ${r.status}: ${text}` }, { status: r.status })
      }
      const data = await r.json()
      const content: any[] = data.content ?? data ?? []
      companies.push(...content.map((c: any) => ({ id: c.id, name: c.name })))
      if (content.length < 200) break
      page++
    }

    return NextResponse.json(companies)
  } catch (e: any) {
    return NextResponse.json({ error: `Pax8 connection failed: ${e.message}` }, { status: 500 })
  }
}
