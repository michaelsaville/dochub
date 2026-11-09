import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"
import { getRotationSettings, computeRotation, rotationUrgency, isRotationActionable } from "@/lib/rotation"
import { expiryUrgency, type AlertUrgency } from "@/lib/alert-policy"
import { getExpiryItems } from "@/lib/expiry-feed"

export type AlertCategory = "ssl" | "domain" | "warranty" | "credential" | "license" | "contract" | "vpncert" | "circuit" | "operational"
export type { AlertUrgency }

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
  stale?: boolean          // informational: expired >90d ago, or a never-rotated rollup
  count?: number           // rollup items: how many underlying records
  expiresAt: string | null
  clientId: string
  clientName: string
  linkPath: string         // DocHub path to the source item
  credentialId?: string    // source credential id (rotation items — enables inline Mark-rotated)
  alarmId?: string         // if this is an operational alarm, its DB ID
  createdAt?: string       // for operational alarms
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

  const includeInfo = url.searchParams.get("includeInfo") === "1"
  const scope = await getClientScope()
  if (clientId && !scopeAllows(scope, clientId)) {
    return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })
  }

  const [expiries, alarms] = await Promise.all([
    getExpiryItems({ clientId, category, scope }),
    category && category !== "operational" ? Promise.resolve([]) :
    prisma.alarm.findMany({
      where: {
        ...(clientId ? { clientId } : !scope.all ? { clientId: { in: scope.clientIds } } : {}),
      },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
      include: { client: { select: { id: true, name: true } } },
    }),
  ])

  const items: UnifiedAlert[] = [
    ...expiries.map(e => ({
      id: e.id,
      category: e.category,
      ...(e.category === "credential" ? { kind: "expiry" as const } : {}),
      label: e.label,
      sublabel: e.sublabel,
      urgency: expiryUrgency(e.expiresAt),
      stale: e.stale || undefined,
      expiresAt: e.expiresAt.toISOString(),
      clientId: e.clientId,
      clientName: e.clientName,
      linkPath: e.linkPath,
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
  // Rule lives in lib/rotation-policy.ts. Creds with a real rotation baseline
  // that are overdue/due soon → one alert each. Creds that have NEVER been
  // rotated (status "unknown") → ONE info item per client, not N criticals.
  const rotationSettings = await getRotationSettings()
  if (rotationSettings.enabled && (!category || category === "credential")) {
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

    const unknownByClient = new Map<string, { name: string; count: number }>()
    for (const c of rotationCreds) {
      const r = computeRotation(c, rotationSettings)
      if (r.status === "unknown") {
        const g = unknownByClient.get(c.client.id) ?? { name: c.client.name, count: 0 }
        g.count++
        unknownByClient.set(c.client.id, g)
        continue
      }
      if (!isRotationActionable(r)) continue
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
    for (const [cid, g] of unknownByClient) {
      items.push({
        id: `rotation-unknown-${cid}`,
        category: "credential",
        kind: "rotation",
        label: `${g.count} credential${g.count === 1 ? " has" : "s have"} no rotation date`,
        sublabel: "Mark rotated (or exempt) to start tracking",
        urgency: "info",
        stale: true,
        count: g.count,
        expiresAt: null,
        clientId: cid,
        clientName: g.name,
        linkPath: `/clients/${cid}?tab=Credentials`,
      })
    }
  }

  // Sort: expired first, then critical, warning, upcoming, info; nearest date first within a tier
  const urgencyOrder = { expired: 0, critical: 1, warning: 2, upcoming: 3, info: 4 }
  const t = (i: UnifiedAlert) => (i.expiresAt ? Math.abs(new Date(i.expiresAt).getTime() - Date.now()) : Infinity)
  items.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency] || t(a) - t(b))

  // Stats. `info` items (long-expired >90d, never-rotated rollups, resolved
  // alarms) are counted separately and NEVER feed expired/critical, so the
  // header bell (expired + critical) reflects only actionable items.
  const loud = items.filter(i => i.urgency !== "info")
  const stats = {
    total: loud.length,
    expired: loud.filter(i => i.urgency === "expired").length,
    critical: loud.filter(i => i.urgency === "critical").length,
    warning: loud.filter(i => i.urgency === "warning").length,
    upcoming: loud.filter(i => i.urgency === "upcoming").length,
    info: items.length - loud.length,
    infoLongExpiredWarranty: items.filter(i => i.category === "warranty" && i.stale).length,
    infoLongExpiredOther: items.filter(i => i.category !== "warranty" && i.stale && i.kind !== "rotation").length,
    infoNoRotationDate: items.filter(i => i.id.startsWith("rotation-unknown-")).reduce((s, i) => s + (i.count ?? 0), 0),
  }

  // Default response = actionable only; ?includeInfo=1 adds the info items.
  return NextResponse.json({ items: includeInfo ? items : loud, stats })
}
