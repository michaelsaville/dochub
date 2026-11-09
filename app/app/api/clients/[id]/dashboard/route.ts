import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"

// Order matters: earlier = shown first in "Key infrastructure".
const INFRA_TYPES = ["Firewall", "Router", "Switch", "Server", "Virtual Host", "NAS", "Access Point", "NVR/DVR", "Phone System", "UPS"]
const IMPORTANT_CRED = /admin|firewall|router|switch|unifi|sonicwall|fortinet|meraki|365|o365|microsoft|azure|entra|domain|registrar|wifi|wi-fi|ssid|server|nas|synology|isp|vpn|dns|godaddy|cloudflare/i

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    if (!scopeAllows(await getClientScope(), id)) return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })

    const assetSelect = {
      id: true, name: true, friendlyName: true, make: true, model: true,
      category: true, status: true, ipAddress: true,
      splashtopUrl: true, managementUrl: true, driverUrl: true,
      rdpEnabled: true, rdpHost: true, rdpPort: true,
      vncEnabled: true, vncHost: true, vncPort: true,
      isFavorite: true,
      location: { select: { name: true } },
      person: { select: { id: true, name: true } },
      assetType: { select: { name: true } },
    } as const

    const [rawAssets, rawCreds, infraAssets, otherCreds, contacts, recentDocs, sops, client] = await Promise.all([
      prisma.asset.findMany({
        where: { location: { clientId: id }, isFavorite: true },
        select: assetSelect,
        orderBy: { name: "asc" },
      }),
      prisma.credential.findMany({
        where: { clientId: id, isFavorite: true, isRetired: false },
        orderBy: { label: "asc" },
      }),
      // "Key infrastructure": the boxes a tech reaches for first on a call.
      prisma.asset.findMany({
        where: {
          location: { clientId: id },
          status: "ACTIVE",
          OR: [
            { category: { in: ["SERVER", "NAS", "NETWORK_GEAR", "PHONE_SYSTEM"] } },
            { assetType: { name: { in: INFRA_TYPES } } },
          ],
        },
        select: assetSelect,
        take: 40,
      }),
      prisma.credential.findMany({
        where: { clientId: id, isFavorite: false, isRetired: false },
        orderBy: { updatedAt: "desc" },
        take: 60,
      }),
      prisma.person.findMany({
        where: { clientId: id, isActive: true, OR: [{ isPrimary: true }, { isEscalation: true }, { isBilling: true }] },
        select: { id: true, name: true, email: true, phone: true, mobile: true, jobTitle: true, isPrimary: true, isBilling: true, isEscalation: true },
        orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
        take: 6,
      }),
      prisma.clientDocument.findMany({
        where: { clientId: id },
        select: { id: true, title: true, updatedAt: true, needsReview: true },
        orderBy: { updatedAt: "desc" },
        take: 6,
      }),
      prisma.runbook.findMany({
        where: { clientId: id },
        select: { id: true, title: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 6,
      }),
      prisma.client.findUnique({ where: { id }, select: { notes: true } }),
    ])

    const strip = (c: (typeof rawCreds)[number]) => ({
      ...c,
      encryptedPassword: undefined,
      encryptedTotp: undefined,
      encryptedNotes: undefined,
      hasPassword: !!c.encryptedPassword,
      hasTotp: !!c.encryptedTotp,
      hasNotes: !!c.encryptedNotes,
    })
    const favCreds = rawCreds.map(strip)

    // Top credentials = favourites first, then the ones whose label looks like
    // an admin / infrastructure login, then most-recently updated. 8 max.
    const scored = otherCreds
      .map((c) => ({ c, s: IMPORTANT_CRED.test(`${c.label} ${c.url ?? ""}`) ? 1 : 0 }))
      .sort((a, b) => b.s - a.s)
      .map((x) => x.c)
    const topCredentials = [...favCreds, ...scored.map(strip)].slice(0, 8)

    const rank = (a: (typeof infraAssets)[number]) => {
      const t = (a.assetType?.name ?? a.category ?? "").toLowerCase()
      const i = INFRA_TYPES.findIndex((x) => t.includes(x.toLowerCase()))
      return i === -1 ? 99 : i
    }
    const keyAssets = [...infraAssets].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name)).slice(0, 10)

    return NextResponse.json({
      favoritedAssets: rawAssets,
      favoritedCredentials: favCreds,
      topCredentials,
      keyAssets,
      contacts,
      recentDocs,
      sops,
      notes: client?.notes ?? null,
    })
  } catch (e) {
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
