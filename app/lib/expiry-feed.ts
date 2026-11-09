import "server-only"
import { prisma } from "@/lib/prisma"
import type { ClientScope } from "@/lib/client-scope"
import { ASSET_STATUSES_WITHOUT_WARRANTY_ALERTS, isStaleExpiry } from "@/lib/alert-policy"

// ─── Hard-expiry feed (server-only) ─────────────────────────────────────────
// Single source for every "thing with an expiry date" — used by
// /api/alerts/unified (bell + /alerts), /api/expirations (/expirations +
// dashboard card) and /api/dashboard. Each item carries `stale` (expired more
// than STALE_AFTER_DAYS ago → informational) so callers apply one policy.

export type ExpiryCategory = "ssl" | "domain" | "warranty" | "credential" | "license" | "contract" | "vpncert" | "circuit"

export interface ExpiryItem {
  id: string
  category: ExpiryCategory
  label: string
  sublabel?: string
  expiresAt: Date
  stale: boolean
  clientId: string
  clientName: string
  linkPath: string
}

export interface ExpiryQuery {
  clientId?: string
  category?: string
  scope?: ClientScope
  /** Only items with expiresAt >= from (applied in SQL). */
  from?: Date
  /** Only items with expiresAt <= to (applied in SQL). */
  to?: Date
}

function minDate(...ds: (Date | null | undefined)[]): Date {
  return new Date(Math.min(...ds.filter((d): d is Date => !!d).map(d => d.getTime())))
}

export async function getExpiryItems(q: ExpiryQuery = {}): Promise<ExpiryItem[]> {
  const { clientId, category, scope, from, to } = q
  const want = (c: ExpiryCategory) => !category || category === c
  const range = from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } : { not: null }
  // Direct client filter (explicit clientId wins; otherwise restrict to scope).
  const cid: string | { in: string[] } | undefined =
    clientId ?? (scope && !scope.all ? { in: scope.clientIds } : undefined)
  const byClient = cid ? { clientId: cid } : {}

  const [sslCerts, domains, warranties, credentials, licenses, vendorContracts, vpnCerts, circuits] = await Promise.all([
    !want("ssl") ? [] : prisma.website.findMany({
      where: { sslExpiresAt: range, ...byClient },
      select: { id: true, domain: true, sslExpiresAt: true, sslIssuer: true, client: { select: { id: true, name: true } } },
    }),
    !want("domain") ? [] : prisma.website.findMany({
      where: { expiresAt: range, ...byClient },
      select: { id: true, domain: true, label: true, expiresAt: true, client: { select: { id: true, name: true } } },
    }),
    !want("warranty") ? [] : prisma.asset.findMany({
      where: {
        warrantyExpiry: range,
        status: { notIn: [...ASSET_STATUSES_WITHOUT_WARRANTY_ALERTS] },
        ...(cid ? { location: { clientId: cid } } : {}),
      },
      select: { id: true, name: true, friendlyName: true, warrantyExpiry: true, location: { select: { client: { select: { id: true, name: true } } } } },
    }),
    !want("credential") ? [] : prisma.credential.findMany({
      where: { isRetired: false, expiryDate: range, ...byClient },
      select: { id: true, label: true, username: true, expiryDate: true, client: { select: { id: true, name: true } } },
    }),
    // Pax8 subs only carry renewalDate, manual licenses carry expiryDate —
    // either makes a license expiring; the soonest one wins.
    !want("license") ? [] : prisma.license.findMany({
      where: { isActive: true, OR: [{ expiryDate: range }, { renewalDate: range }], ...byClient },
      select: { id: true, name: true, vendor: true, expiryDate: true, renewalDate: true, client: { select: { id: true, name: true } }, vendorRef: { select: { name: true } } },
    }),
    !want("contract") ? [] : prisma.vendorContract.findMany({
      where: { OR: [{ endDate: range }, { renewalDate: range }], ...byClient },
      select: { id: true, name: true, contractType: true, endDate: true, renewalDate: true, vendor: { select: { id: true, name: true } }, client: { select: { id: true, name: true } } },
    }),
    !want("vpncert") ? [] : prisma.vpnAccessor.findMany({
      where: { isActive: true, certExpiry: range, ...(cid ? { gateway: { clientId: cid } } : {}) },
      select: { id: true, certExpiry: true, thirdPartyName: true, person: { select: { name: true } }, vendor: { select: { name: true } }, staffUser: { select: { name: true } }, gateway: { select: { name: true, client: { select: { id: true, name: true } } } } },
    }),
    !want("circuit") ? [] : prisma.internetCircuit.findMany({
      where: { contractEnd: range, ...byClient },
      select: { id: true, label: true, contractEnd: true, client: { select: { id: true, name: true } }, vendor: { select: { name: true } } },
    }),
  ])

  const now = new Date()
  const mk = (i: Omit<ExpiryItem, "stale">): ExpiryItem => ({ ...i, stale: isStaleExpiry(i.expiresAt, now) })

  const items: ExpiryItem[] = [
    ...sslCerts.map(w => mk({
      id: `ssl-${w.id}`, category: "ssl", label: w.domain, sublabel: w.sslIssuer ?? undefined,
      expiresAt: w.sslExpiresAt!, clientId: w.client.id, clientName: w.client.name,
      linkPath: `/clients/${w.client.id}?tab=Domains`,
    })),
    ...domains.map(w => mk({
      id: `domain-${w.id}`, category: "domain", label: w.domain, sublabel: w.label ?? undefined,
      expiresAt: w.expiresAt!, clientId: w.client.id, clientName: w.client.name,
      linkPath: `/clients/${w.client.id}?tab=Domains`,
    })),
    ...warranties.map(a => mk({
      id: `warranty-${a.id}`, category: "warranty", label: a.friendlyName ?? a.name,
      expiresAt: a.warrantyExpiry!, clientId: a.location.client.id, clientName: a.location.client.name,
      linkPath: `/assets/${a.id}`,
    })),
    ...credentials.map(c => mk({
      id: `credential-${c.id}`, category: "credential", label: c.label, sublabel: c.username ?? undefined,
      expiresAt: c.expiryDate!, clientId: c.client.id, clientName: c.client.name,
      linkPath: `/clients/${c.client.id}?tab=Credentials`,
    })),
    ...licenses.map(l => mk({
      id: `license-${l.id}`, category: "license", label: l.name, sublabel: l.vendorRef?.name ?? l.vendor ?? undefined,
      expiresAt: minDate(l.expiryDate, l.renewalDate), clientId: l.client.id, clientName: l.client.name,
      linkPath: `/clients/${l.client.id}?tab=Licenses`,
    })),
    ...vendorContracts.map(v => mk({
      id: `contract-${v.id}`, category: "contract", label: v.name,
      sublabel: [v.vendor.name, v.contractType].filter(Boolean).join(" · "),
      expiresAt: minDate(v.endDate, v.renewalDate), clientId: v.client?.id ?? "", clientName: v.client?.name ?? v.vendor.name,
      linkPath: `/vendors/${v.vendor.id}`,
    })),
    ...vpnCerts.map(a => mk({
      id: `vpncert-${a.id}`, category: "vpncert",
      label: `${a.person?.name ?? a.vendor?.name ?? a.staffUser?.name ?? a.thirdPartyName ?? "VPN access"} cert`,
      sublabel: a.gateway.name, expiresAt: a.certExpiry!, clientId: a.gateway.client.id, clientName: a.gateway.client.name,
      linkPath: `/clients/${a.gateway.client.id}?tab=Remote Access`,
    })),
    ...circuits.map(c => mk({
      id: `circuit-${c.id}`, category: "circuit", label: c.label, sublabel: c.vendor?.name ?? undefined,
      expiresAt: c.contractEnd!, clientId: c.client.id, clientName: c.client.name,
      linkPath: `/clients/${c.client.id}?tab=Network`,
    })),
  ]

  // License/contract OR-ranges can let the *other* date pull an item outside
  // the requested window — re-apply it on the resolved expiresAt.
  return items.filter(i => (!from || i.expiresAt >= from) && (!to || i.expiresAt <= to))
}
