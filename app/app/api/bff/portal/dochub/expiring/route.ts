import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyPortalHmac } from "@/lib/bff-hmac"

export const dynamic = "force-dynamic"

/**
 * Portal "what's expiring" rollup for a client — the #1 self-service view.
 * Aggregates licenses, domains, SSL certs, warranties, and circuit contracts
 * into one sorted list so the portal doesn't re-derive it per entity.
 * Read-only; no secrets. (Not paywalled — IT Glue's documented complaint.)
 */
interface Payload { clientId: string; days?: number }

type Item = { category: string; label: string; sublabel?: string; expiresAt: string; linkType: string }

export async function POST(req: Request) {
  const rawBody = await req.text()
  const verify = verifyPortalHmac(
    rawBody,
    req.headers.get("x-portal-signature"),
    req.headers.get("x-portal-timestamp"),
    process.env.PORTAL_BFF_SECRET ?? "",
  )
  if (!verify.ok) return NextResponse.json({ ok: false, error: verify.reason }, { status: verify.status })

  let payload: Payload
  try { payload = JSON.parse(rawBody) } catch { return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 }) }
  if (!payload.clientId) return NextResponse.json({ ok: false, error: "clientId required" }, { status: 400 })

  const clientId = payload.clientId

  const [licenses, websites, assets, circuits] = await Promise.all([
    prisma.license.findMany({
      where: { clientId, isActive: true, expiryDate: { not: null } },
      select: { name: true, vendor: true, expiryDate: true, vendorRef: { select: { name: true } } },
    }),
    prisma.website.findMany({
      where: { clientId, OR: [{ expiresAt: { not: null } }, { sslExpiresAt: { not: null } }] },
      select: { domain: true, expiresAt: true, sslExpiresAt: true, sslIssuer: true },
    }),
    prisma.asset.findMany({
      where: { location: { clientId }, warrantyExpiry: { not: null }, status: { notIn: ["RETIRED", "DISPOSED"] } },
      select: { name: true, friendlyName: true, warrantyExpiry: true },
    }),
    prisma.internetCircuit.findMany({
      where: { clientId, contractEnd: { not: null } },
      select: { label: true, contractEnd: true, vendor: { select: { name: true } } },
    }),
  ])

  const items: Item[] = []
  for (const l of licenses) items.push({ category: "license", label: l.name, sublabel: l.vendorRef?.name ?? l.vendor ?? undefined, expiresAt: l.expiryDate!.toISOString(), linkType: "licenses" })
  for (const w of websites) {
    if (w.expiresAt) items.push({ category: "domain", label: w.domain, expiresAt: w.expiresAt.toISOString(), linkType: "domains" })
    if (w.sslExpiresAt) items.push({ category: "ssl", label: w.domain, sublabel: w.sslIssuer ?? undefined, expiresAt: w.sslExpiresAt.toISOString(), linkType: "domains" })
  }
  for (const a of assets) items.push({ category: "warranty", label: a.friendlyName ?? a.name, expiresAt: a.warrantyExpiry!.toISOString(), linkType: "assets" })
  for (const c of circuits) items.push({ category: "circuit", label: c.label, sublabel: c.vendor?.name ?? undefined, expiresAt: c.contractEnd!.toISOString(), linkType: "network" })

  // Optional window filter (e.g. days=90 → only what expires within 90 days).
  let filtered = items
  if (payload.days && payload.days > 0) {
    const cutoff = Date.now() + payload.days * 86400000
    filtered = items.filter(i => new Date(i.expiresAt).getTime() <= cutoff)
  }
  filtered.sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime())

  return NextResponse.json({ ok: true, items: filtered })
}
