import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

export async function GET(req: Request) {
  const { error } = await requireAuth()
  if (error) return error

  const url = new URL(req.url)
  const clientId = url.searchParams.get("clientId") || undefined

  const [sslCerts, domains, warranties, credentials, licenses, vendorContracts, vpnCerts, circuits] = await Promise.all([
    prisma.website.findMany({
      where: {
        sslExpiresAt: { not: null },
        ...(clientId ? { clientId } : {}),
      },
      select: {
        id: true, domain: true, sslExpiresAt: true, sslIssuer: true,
        client: { select: { id: true, name: true } },
      },
      orderBy: { sslExpiresAt: "asc" },
    }),
    prisma.website.findMany({
      where: {
        expiresAt: { not: null },
        ...(clientId ? { clientId } : {}),
      },
      select: {
        id: true, domain: true, label: true, expiresAt: true,
        client: { select: { id: true, name: true } },
      },
      orderBy: { expiresAt: "asc" },
    }),
    prisma.asset.findMany({
      where: {
        warrantyExpiry: { not: null },
        status: { notIn: ["RETIRED", "DISPOSED"] },
        ...(clientId ? { location: { clientId } } : {}),
      },
      select: {
        id: true, name: true, friendlyName: true, warrantyExpiry: true,
        location: {
          select: {
            client: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { warrantyExpiry: "asc" },
    }),
    prisma.credential.findMany({
      where: {
        isRetired: false,
        expiryDate: { not: null },
        ...(clientId ? { clientId } : {}),
      },
      select: {
        id: true, label: true, username: true, expiryDate: true,
        client: { select: { id: true, name: true } },
      },
      orderBy: { expiryDate: "asc" },
    }),
    prisma.license.findMany({
      where: {
        isActive: true,
        // Pax8 subs only carry renewalDate, manual licenses carry expiryDate —
        // either one makes a license expiring.
        OR: [{ expiryDate: { not: null } }, { renewalDate: { not: null } }],
        ...(clientId ? { clientId } : {}),
      },
      select: {
        id: true, name: true, vendor: true, expiryDate: true, renewalDate: true,
        client: { select: { id: true, name: true } },
        vendorRef: { select: { id: true, name: true } },
      },
      orderBy: { expiryDate: "asc" },
    }),
    prisma.vendorContract.findMany({
      where: {
        endDate: { not: null },
        ...(clientId ? { clientId } : {}),
      },
      select: {
        id: true, name: true, contractType: true, endDate: true,
        vendor: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
      },
      orderBy: { endDate: "asc" },
    }),
    prisma.vpnAccessor.findMany({
      where: {
        isActive: true,
        certExpiry: { not: null },
        ...(clientId ? { gateway: { clientId } } : {}),
      },
      select: {
        id: true, certExpiry: true, thirdPartyName: true,
        person: { select: { name: true } },
        vendor: { select: { name: true } },
        staffUser: { select: { name: true } },
        gateway: { select: { id: true, name: true, client: { select: { id: true, name: true } } } },
      },
      orderBy: { certExpiry: "asc" },
    }),
    prisma.internetCircuit.findMany({
      where: {
        contractEnd: { not: null },
        ...(clientId ? { clientId } : {}),
      },
      select: {
        id: true, label: true, contractEnd: true,
        client: { select: { id: true, name: true } },
        vendor: { select: { name: true } },
      },
      orderBy: { contractEnd: "asc" },
    }),
  ])

  const items = [
    ...sslCerts.map(w => ({
      id: `ssl-${w.id}`,
      category: "ssl" as const,
      label: w.domain,
      sublabel: w.sslIssuer ?? undefined,
      expiresAt: w.sslExpiresAt!.toISOString(),
      clientId: w.client.id,
      clientName: w.client.name,
      linkPath: `/clients/${w.client.id}?tab=Domains`,
    })),
    ...domains.map(w => ({
      id: `domain-${w.id}`,
      category: "domain" as const,
      label: w.domain,
      sublabel: w.label ?? undefined,
      expiresAt: w.expiresAt!.toISOString(),
      clientId: w.client.id,
      clientName: w.client.name,
      linkPath: `/clients/${w.client.id}?tab=Domains`,
    })),
    ...warranties.map(a => ({
      id: `warranty-${a.id}`,
      category: "warranty" as const,
      label: a.friendlyName ?? a.name,
      expiresAt: a.warrantyExpiry!.toISOString(),
      clientId: a.location.client.id,
      clientName: a.location.client.name,
      linkPath: `/assets/${a.id}`,
    })),
    ...credentials.map(c => ({
      id: `credential-${c.id}`,
      category: "credential" as const,
      label: c.label,
      sublabel: c.username ?? undefined,
      expiresAt: c.expiryDate!.toISOString(),
      clientId: c.client.id,
      clientName: c.client.name,
      linkPath: `/clients/${c.client.id}?tab=Credentials`,
    })),
    ...licenses.map(l => ({
      id: `license-${l.id}`,
      category: "license" as const,
      label: l.name,
      sublabel: l.vendorRef?.name ?? l.vendor ?? undefined,
      // Soonest of expiry / renewal (Pax8 only sets renewalDate).
      expiresAt: new Date(Math.min(...[l.expiryDate, l.renewalDate].filter(Boolean).map(d => new Date(d!).getTime()))).toISOString(),
      clientId: l.client.id,
      clientName: l.client.name,
      linkPath: `/clients/${l.client.id}?tab=Licenses`,
    })),
    ...vendorContracts.map(v => ({
      id: `contract-${v.id}`,
      category: "contract" as const,
      label: v.name,
      sublabel: [v.vendor.name, v.contractType].filter(Boolean).join(" · "),
      expiresAt: v.endDate!.toISOString(),
      clientId: v.client?.id ?? "",
      clientName: v.client?.name ?? v.vendor.name,
      linkPath: `/vendors/${v.vendor.id}`,
    })),
    ...vpnCerts.map(a => ({
      id: `vpncert-${a.id}`,
      category: "vpncert" as const,
      label: `${a.person?.name ?? a.vendor?.name ?? a.staffUser?.name ?? a.thirdPartyName ?? "VPN access"} cert`,
      sublabel: a.gateway.name,
      expiresAt: a.certExpiry!.toISOString(),
      clientId: a.gateway.client.id,
      clientName: a.gateway.client.name,
      linkPath: `/clients/${a.gateway.client.id}?tab=Remote Access`,
    })),
    ...circuits.map(c => ({
      id: `circuit-${c.id}`,
      category: "circuit" as const,
      label: c.label,
      sublabel: c.vendor?.name ?? undefined,
      expiresAt: c.contractEnd!.toISOString(),
      clientId: c.client.id,
      clientName: c.client.name,
      linkPath: `/clients/${c.client.id}?tab=Network`,
    })),
  ].sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime())

  return NextResponse.json(items)
}
