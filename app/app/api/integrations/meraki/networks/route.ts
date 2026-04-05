import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

const MERAKI_BASE = "https://api.meraki.com/api/v1"

export async function GET() {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const rows = await prisma.appSetting.findMany({
      where: { key: { in: ["integration:meraki:apiKey", "integration:meraki:orgId"] } },
    })
    const cfg: Record<string, string> = {}
    for (const r of rows) cfg[r.key] = r.value

    const apiKey = cfg["integration:meraki:apiKey"]?.trim()
    const orgId = cfg["integration:meraki:orgId"]?.trim()

    if (!apiKey) return NextResponse.json({ error: "Meraki API key not configured" }, { status: 422 })

    const headers = { "X-Cisco-Meraki-API-Key": apiKey, "Content-Type": "application/json" }

    // If no org ID saved, list orgs for selection
    if (!orgId) {
      const res = await fetch(`${MERAKI_BASE}/organizations`, { headers })
      const orgs = await res.json()
      return NextResponse.json({ needsOrgSelection: true, orgs })
    }

    const res = await fetch(`${MERAKI_BASE}/organizations/${orgId}/networks`, { headers })
    if (!res.ok) {
      const err = await res.json()
      return NextResponse.json({ error: err.errors?.[0] || "Meraki API error" }, { status: res.status })
    }
    const networks = await res.json()
    return NextResponse.json(networks.map((n: any) => ({ id: n.id, name: n.name, productTypes: n.productTypes })))
  } catch (e: any) {
    return NextResponse.json({ error: `Meraki connection failed: ${e.message}` }, { status: 500 })
  }
}
