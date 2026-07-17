import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"
import { getRotationSettings, computeRotation, rotationUrgency } from "@/lib/rotation"

export type AlertCategory = "ssl" | "domain" | "warranty" | "credential" | "license" | "contract" | "vpncert" | "circuit" | "operational"
export type AlertUrgency = "expired" | "critical" | "warning" | "upcoming" | "info"

export interface UnifiedAlert {
  id: string
  category: AlertCategory
  kind?: "expiry" | "rotation"   // distinguishes a hard expiry from a rotation-age policy
  label: string
  sublabel?: string
  message?: string
  severity?: string        // for operational alarms
  status?: string          // for operational alarms (ACTIVE/DISMISSED/RESOLVED)
  urgency: AlertUrgency
  expiresAt: string | null
  clientId: string
  clientName: string
  linkPath: string         // DocHub path to the source item
  credentialId?: string    // source credential id (rotation items — enables inline Mark-rotated)
  alarmId?: string         // if this is an operational alarm, its DB ID
  createdAt?: string       // for operational alarms
}

function computeUrgency(expiresAt: Date): AlertUrgency {
  const now = new Date()
  const diffMs = expiresAt.getTime() - now.getTime()
  const days = diffMs / 86_400_000
  if (days < 0) return "expired"
  if (days <= 7) return "critical"
  if (days <= 30) return "warning"
  return "upcoming"
}

function alarmSeverityToUrgency(severity: string, status: string): AlertUrgency {
  if (status === "RESOLVED" || status === "DISMISSED") return "info"
  if (severity === "CRITICAL") return "critical"
  if (severity === "WARNING") return "warning"
  return "upcoming"
}

export async function GET(req: Request) {
  const { error } = await requireAuth()
  if (error) return error

  const url = new URL(req.url)
  const clientId = url.searchParams.get("clientId") || undefined
  const category = url.searchParams.get("category") || undefined

  // Run all queries in parallel
  const [sslCerts, domains, warranties, credentials, licenses, vendorContracts, vpnCerts, circuits, alarms] = await Promise.all([
    category && category !== "ssl" ? Promise.resolve([]) :
    prisma.website.findMany({
      where: { sslExpiresAt: { not: null }, ...(clientId ? { clientId } : {}) },
      select: { id: true, domain: true, sslExpiresAt: true, sslIssuer: true, client: { select: { id: true, name: true } } },
    }),
    category && category !== "domain" ? Promise.resolve([]) :
    prisma.website.findMany({
      where: { expiresAt: { not: null }, ...(clientId ? { clientId } : {}) },
      select: { id: true, domain: true, label: true, expiresAt: true, client: { select: { id: true, name: true } } },
    }),
    category && category !== "warranty" ? Promise.resolve([]) :
    prisma.asset.findMany({
      where: { warrantyExpiry: { not: null }, status: { notIn: ["RETIRED", "DISPOSED"] }, ...(clientId ? { location: { clientId } } : {}) },
      select: { id: true, name: true, friendlyName: true, warrantyExpiry: true, location: { select: { client: { select: { id: true, name: true } } } } },
    }),
    category && category !== "credential" ? Promise.resolve([]) :
    prisma.credential.findMany({
      where: { isRetired: false, expiryDate: { not: null }, ...(clientId ? { clientId } : {}) },
      select: { id: true, label: true, username: true, expiryDate: true, client: { select: { id: true, name: true } } },
    }),
    category && category !== "license" ? Promise.resolve([]) :
    prisma.license.findMany({
      where: { isActive: true, expiryDate: { not: null }, ...(clientId ? { clientId } : {}) },
      select: { id: true, name: true, vendor: true, expiryDate: true, client: { select: { id: true, name: true } }, vendorRef: { select: { id: true, name: true } } },
    }),
    category && category !== "contract" ? Promise.resolve([]) :
    prisma.vendorContract.findMany({
      where: { endDate: { not: null }, ...(clientId ? { clientId } : {}) },
      select: { id: true, name: true, contractType: true, endDate: true, vendor: { select: { id: true, name: true } }, client: { select: { id: true, name: true } } },
    }),
    category && category !== "vpncert" ? Promise.resolve([]) :
    prisma.vpnAccessor.findMany({
      where: { isActive: true, certExpiry: { not: null }, ...(clientId ? { gateway: { clientId } } : {}) },
      select: { id: true, certExpiry: true, thirdPartyName: true, person: { select: { name: true } }, vendor: { select: { name: true } }, staffUser: { select: { name: true } }, gateway: { select: { id: true, name: true, client: { select: { id: true, name: true } } } } },
    }),
    category && category !== "circuit" ? Promise.resolve([]) :
    prisma.internetCircuit.findMany({
      where: { contractEnd: { not: null }, ...(clientId ? { clientId } : {}) },
      select: { id: true, label: true, contractEnd: true, client: { select: { id: true, name: true } }, vendor: { select: { name: true } } },
    }),
    category && category !== "operational" ? Promise.resolve([]) :
    prisma.alarm.findMany({
      where: { ...(clientId ? { clientId } : {}) },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
      include: { client: { select: { id: true, name: true } } },
    }),
  ])

  const items: UnifiedAlert[] = [
    ...sslCerts.map(w => ({
      id: `ssl-${w.id}`,
      category: "ssl" as const,
      label: w.domain,
      sublabel: w.sslIssuer ?? undefined,
      urgency: computeUrgency(w.sslExpiresAt!),
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
      urgency: computeUrgency(w.expiresAt!),
      expiresAt: w.expiresAt!.toISOString(),
      clientId: w.client.id,
      clientName: w.client.name,
      linkPath: `/clients/${w.client.id}?tab=Domains`,
    })),
    ...warranties.map(a => ({
      id: `warranty-${a.id}`,
      category: "warranty" as const,
      label: a.friendlyName ?? a.name,
      urgency: computeUrgency(a.warrantyExpiry!),
      expiresAt: a.warrantyExpiry!.toISOString(),
      clientId: a.location.client.id,
      clientName: a.location.client.name,
      linkPath: `/assets/${a.id}`,
    })),
    ...credentials.map(c => ({
      id: `credential-${c.id}`,
      category: "credential" as const,
      kind: "expiry" as const,
      label: c.label,
      sublabel: c.username ?? undefined,
      urgency: computeUrgency(c.expiryDate!),
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
      urgency: computeUrgency(l.expiryDate!),
      expiresAt: l.expiryDate!.toISOString(),
      clientId: l.client.id,
      clientName: l.client.name,
      linkPath: `/clients/${l.client.id}?tab=Licenses`,
    })),
    ...vendorContracts.map(v => ({
      id: `contract-${v.id}`,
      category: "contract" as const,
      label: v.name,
      sublabel: [v.vendor.name, v.contractType].filter(Boolean).join(" · "),
      urgency: computeUrgency(v.endDate!),
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
      urgency: computeUrgency(a.certExpiry!),
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
      urgency: computeUrgency(c.contractEnd!),
      expiresAt: c.contractEnd!.toISOString(),
      clientId: c.client.id,
      clientName: c.client.name,
      linkPath: `/clients/${c.client.id}?tab=Network`,
    })),
    ...alarms.map(a => ({
      id: `alarm-${a.id}`,
      category: "operational" as const,
      label: a.type,
      message: a.message,
      sublabel: a.details ?? undefined,
      severity: a.severity,
      status: a.status,
      urgency: alarmSeverityToUrgency(a.severity, a.status),
      expiresAt: null,
      clientId: a.client.id,
      clientName: a.client.name,
      linkPath: `/clients/${a.client.id}`,
      alarmId: a.id,
      createdAt: a.createdAt.toISOString(),
    })),
  ]

  // ─── Password rotation (compute-on-read, kind:"rotation") ─────────────────
  // Separate from the expiryDate items above: rotation staleness is a policy
  // computed from lastRotated (fallback createdAt) for ALL non-retired creds,
  // not just those carrying a hard expiry date. Gated by rotation:enabled and
  // scoped so a restricted tech only sees their own clients' creds.
  const rotationSettings = await getRotationSettings()
  if (rotationSettings.enabled && (!category || category === "credential")) {
    const scope = await getClientScope()
    if (!clientId || scopeAllows(scope, clientId)) {
      const rotWhere: {
        isRetired: boolean; rotationExempt: boolean; clientId?: string | { in: string[] }
      } = { isRetired: false, rotationExempt: false }
      if (clientId) rotWhere.clientId = clientId
      else if (!scope.all) rotWhere.clientId = { in: scope.clientIds }

      const rotationCreds = await prisma.credential.findMany({
        where: rotWhere,
        select: {
          id: true, label: true, username: true, lastRotated: true, createdAt: true,
          rotationIntervalDays: true, rotationSnoozedUntil: true,
          client: { select: { id: true, name: true } },
        },
      })

      for (const c of rotationCreds) {
        const r = computeRotation(c, rotationSettings)
        if (r.status !== "overdue" && r.status !== "dueSoon") continue
        items.push({
          id: `rotation-${c.id}`,
          category: "credential",
          kind: "rotation",
          label: c.label,
          sublabel: r.status === "overdue"
            ? `Rotation overdue · ${r.daysOverdue}d`
            : `Rotation due in ${r.daysUntilDue}d`,
          urgency: rotationUrgency(r),
          expiresAt: r.dueDate ? r.dueDate.toISOString() : null,
          clientId: c.client.id,
          clientName: c.client.name,
          credentialId: c.id,
          linkPath: `/clients/${c.client.id}?tab=Credentials`,
        })
      }
    }
  }

  // Sort: expired first, then critical, warning, upcoming, info
  const urgencyOrder = { expired: 0, critical: 1, warning: 2, upcoming: 3, info: 4 }
  items.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency])

  // Stats
  const stats = {
    total: items.length,
    expired: items.filter(i => i.urgency === "expired").length,
    critical: items.filter(i => i.urgency === "critical").length,
    warning: items.filter(i => i.urgency === "warning").length,
    upcoming: items.filter(i => i.urgency === "upcoming").length,
  }

  return NextResponse.json({ items, stats })
}
