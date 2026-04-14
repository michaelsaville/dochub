import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  const { error: authError } = await requireAuth()
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const clientId = searchParams.get("clientId") || undefined

  const where = clientId ? { id: clientId } : {}

  const [clients, assets] = await Promise.all([
    prisma.client.findMany({
      where,
      select: {
        id: true, name: true,
        people: { select: { id: true, name: true, role: true, email: true, phone: true, isPrimary: true }, orderBy: { isPrimary: "desc" } },
        locations: { select: { id: true, name: true, city: true, state: true, address: true } },
        licenses: {
          where: { isActive: true },
          select: { id: true, name: true, seats: true, assignedSeats: true, expiryDate: true },
        },
        websites: {
          select: { id: true, domain: true, expiresAt: true, sslExpiresAt: true },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.asset.findMany({
      where: clientId
        ? { status: { not: "RETIRED" }, location: { clientId } }
        : { status: { not: "RETIRED" } },
      select: { id: true, warrantyExpiry: true, location: { select: { clientId: true } } },
    }),
  ])

  const now = new Date()
  const soon90 = new Date(now.getTime() + 90 * 86400 * 1000)

  // Index assets by clientId
  const assetsByClient = new Map<string, typeof assets>()
  for (const a of assets) {
    const cid = a.location.clientId
    if (!assetsByClient.has(cid)) assetsByClient.set(cid, [])
    assetsByClient.get(cid)!.push(a)
  }

  const summaries = clients.map(c => {
    const clientAssets = assetsByClient.get(c.id) ?? []
    const totalAssets = clientAssets.length
    const warrantyCritical = clientAssets.filter(a => a.warrantyExpiry && new Date(a.warrantyExpiry) < now).length
    const warrantyWarn = clientAssets.filter(a => {
      if (!a.warrantyExpiry) return false
      const d = new Date(a.warrantyExpiry)
      return d >= now && d < soon90
    }).length

    const expiredLicenses = c.licenses.filter(l => l.expiryDate && new Date(l.expiryDate) < now).length
    const expiringLicenses = c.licenses.filter(l => {
      if (!l.expiryDate) return false
      const d = new Date(l.expiryDate)
      return d >= now && d < soon90
    }).length

    const expiredDomains = c.websites.filter(d => d.expiresAt && new Date(d.expiresAt) < now).length
    const expiredSSL = c.websites.filter(d => d.sslExpiresAt && new Date(d.sslExpiresAt) < now).length

    return {
      id: c.id, name: c.name,
      contacts: c.people, locations: c.locations,
      totalAssets, warrantyCritical, warrantyWarn,
      totalLicenses: c.licenses.length, expiredLicenses, expiringLicenses,
      totalDomains: c.websites.length, expiredDomains, expiredSSL,
    }
  })

  return NextResponse.json({ clients: summaries })
}
