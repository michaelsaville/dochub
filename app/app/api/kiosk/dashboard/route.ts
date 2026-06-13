import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireKioskToken } from "@/lib/kiosk-auth"

// Token-gated, never SSO. Inherently dynamic (reads the token per request).
export const dynamic = "force-dynamic"

const EXPIRY_WINDOW_DAYS = 60

/**
 * Read-only wallboard feed for an unattended iPad kiosk.
 *
 * Returns ONLY non-sensitive, aggregate data: counts, active-alarm headlines,
 * and upcoming expirations (label + client + date). It deliberately exposes NO
 * credentials, passwords, TOTP seeds, IPs, or document contents — anything a
 * shoulder-surfer at the desk shouldn't see. Keep it that way.
 *
 * Optional ?clientId=<id> scopes the whole feed to one client (the wallboard
 * use case). Omit it for a global ops view.
 */
export async function GET(req: Request) {
  const denied = requireKioskToken(req)
  if (denied) return denied

  const clientId = new URL(req.url).searchParams.get("clientId") || undefined

  try {
    const now = new Date()
    const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    const windowEnd = new Date(now.getTime() + EXPIRY_WINDOW_DAYS * 24 * 60 * 60 * 1000)

    // Per-table client filters (Asset scopes via its Location; the rest are direct).
    const assetClient = clientId ? { location: { clientId } } : {}
    const directClient = clientId ? { clientId } : {}

    const [client, assets, activeAlarms, licensesExpiring, alarms, licenses, sslCerts, domains, warranties, contracts] =
      await Promise.all([
        clientId
          ? prisma.client.findUnique({ where: { id: clientId }, select: { name: true } })
          : Promise.resolve(null),

        prisma.asset.count({ where: { status: "ACTIVE", ...assetClient } }),
        prisma.alarm.count({ where: { status: "ACTIVE", ...directClient } }),
        prisma.license.count({ where: { isActive: true, expiryDate: { lte: soon, gte: now }, ...directClient } }),

        prisma.alarm.findMany({
          where: { status: "ACTIVE", ...directClient },
          orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
          take: 8,
          select: {
            id: true, severity: true, type: true, message: true, createdAt: true,
            client: { select: { name: true } },
          },
        }),

        prisma.license.findMany({
          where: { isActive: true, expiryDate: { gte: now, lte: windowEnd }, ...directClient },
          orderBy: { expiryDate: "asc" },
          take: 25,
          select: { id: true, name: true, expiryDate: true, client: { select: { name: true } } },
        }),
        prisma.website.findMany({
          where: { sslExpiresAt: { gte: now, lte: windowEnd }, ...directClient },
          orderBy: { sslExpiresAt: "asc" },
          take: 25,
          select: { id: true, domain: true, sslExpiresAt: true, client: { select: { name: true } } },
        }),
        prisma.website.findMany({
          where: { expiresAt: { gte: now, lte: windowEnd }, ...directClient },
          orderBy: { expiresAt: "asc" },
          take: 25,
          select: { id: true, domain: true, label: true, expiresAt: true, client: { select: { name: true } } },
        }),
        prisma.asset.findMany({
          where: {
            warrantyExpiry: { gte: now, lte: windowEnd },
            status: { notIn: ["RETIRED", "DISPOSED"] },
            ...assetClient,
          },
          orderBy: { warrantyExpiry: "asc" },
          take: 25,
          select: {
            id: true, name: true, friendlyName: true, warrantyExpiry: true,
            location: { select: { client: { select: { name: true } } } },
          },
        }),
        // Vendor contract / lease renewals. Label + client + date only — no
        // cost or documentUrl (kiosk is a shoulder-surfable wallboard).
        prisma.vendorContract.findMany({
          where: { endDate: { gte: now, lte: windowEnd }, ...directClient },
          orderBy: { endDate: "asc" },
          take: 25,
          select: { id: true, name: true, endDate: true, vendor: { select: { name: true } }, client: { select: { name: true } } },
        }),
      ])

    if (clientId && !client) {
      return NextResponse.json({ error: "Unknown clientId" }, { status: 404 })
    }

    const allExpirations = [
      ...licenses.map(l => ({
        id: `lic-${l.id}`, category: "License", label: l.name,
        clientName: l.client?.name ?? "—", expiresAt: l.expiryDate!.toISOString(),
      })),
      ...sslCerts.map(w => ({
        id: `ssl-${w.id}`, category: "SSL", label: w.domain,
        clientName: w.client?.name ?? "—", expiresAt: w.sslExpiresAt!.toISOString(),
      })),
      ...domains.map(w => ({
        id: `dom-${w.id}`, category: "Domain", label: w.label || w.domain,
        clientName: w.client?.name ?? "—", expiresAt: w.expiresAt!.toISOString(),
      })),
      ...warranties.map(a => ({
        id: `war-${a.id}`, category: "Warranty", label: a.friendlyName || a.name,
        clientName: a.location?.client?.name ?? "—", expiresAt: a.warrantyExpiry!.toISOString(),
      })),
      ...contracts.map(v => ({
        id: `con-${v.id}`, category: "Contract", label: v.name,
        clientName: v.client?.name ?? v.vendor.name, expiresAt: v.endDate!.toISOString(),
      })),
    ].sort((x, y) => x.expiresAt.localeCompare(y.expiresAt))

    return NextResponse.json({
      clientName: client?.name ?? null,
      stats: {
        assets,
        alarms: activeAlarms,
        licensesExpiring,
        expiringSoon: allExpirations.length,
      },
      alarms: alarms.map(a => ({
        id: a.id, severity: a.severity, type: a.type, message: a.message,
        clientName: a.client?.name ?? "—", createdAt: a.createdAt.toISOString(),
      })),
      expirations: allExpirations.slice(0, 12),
      generatedAt: now.toISOString(),
    })
  } catch (e) {
    return NextResponse.json({ error: "Failed to build kiosk feed" }, { status: 500 })
  }
}
