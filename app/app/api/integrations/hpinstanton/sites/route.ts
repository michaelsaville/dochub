import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

const HP_BASE = "https://api.arubainstanton.com/v1"

export async function GET() {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: "integration:hpinstanton:bearerToken" } })
    const token = row?.value?.trim()
    if (!token) return NextResponse.json({ error: "HP Instant On bearer token not configured" }, { status: 422 })

    const res = await fetch(`${HP_BASE}/customer/sites`, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    })
    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: `HP Instant On API error ${res.status}: ${text}` }, { status: res.status })
    }
    const data = await res.json()
    const sites = (data.sites || data || []).map((s: any) => ({ id: s.id, name: s.name }))
    return NextResponse.json(sites)
  } catch (e: any) {
    return NextResponse.json({ error: `HP Instant On connection failed: ${e.message}` }, { status: 500 })
  }
}
