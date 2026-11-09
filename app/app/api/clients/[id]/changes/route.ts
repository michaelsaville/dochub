import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"

export type ChangeKind =
  | "asset" | "credential" | "license" | "network" | "document" | "sop"
  | "person" | "website" | "alarm" | "activity" | "audit"

export type ChangeItem = {
  /** stable key for React */
  id: string
  at: string
  kind: ChangeKind
  /** one line, already human-formatted. Never contains secret values. */
  text: string
  /** who/what made the change: staff name, "Syncro sync", … */
  by: string | null
  href?: string
}

const DAY = 86_400_000
const MAX_ITEMS = 300

/** Fields whose values must never be echoed, only "changed". */
const SECRET_FIELD = /pass|secret|totp|token|licen[cs]eKey|apiKey|privateKey|encrypted|secureNotes|psk/i

const SOURCE_LABEL: Record<string, string> = {
  SYNCRO: "Syncro sync",
  UNIFI: "UniFi sync",
  MERAKI: "Meraki sync",
  SONICWALL: "SonicWall sync",
  PAX8: "Pax8 sync",
  SCOUT: "Scout scan",
  ITFLOW: "ITFlow import",
  NOTES_INTAKE: "notes intake",
}

/** Asset rows created by the Syncro sync carry syncroAssetId but (historically) dataSource MANUAL. */
const assetSource = (a: { dataSource: string; syncroAssetId: string | null }) =>
  a.dataSource === "MANUAL" && a.syncroAssetId ? "Syncro sync" : SOURCE_LABEL[a.dataSource] ?? null

const short = (v: string | null, n = 60) => {
  if (v === null || v === undefined || v === "") return "∅"
  const s = v.replace(/\s+/g, " ").trim()
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

/** "ipAddress" → "IP address", "firmwareVersion" → "firmware version" */
const fieldLabel = (f: string) => {
  const special: Record<string, string> = {
    ipAddress: "IP address", macAddress: "MAC", url: "URL", os: "OS", ram: "RAM", cpu: "CPU",
    isActive: "active", personId: "assigned person", locationId: "location", assetTypeId: "type",
  }
  if (special[f]) return special[f]
  return f.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()
}

/**
 * "What changed recently" for one client. Read-only merge of every place the
 * schema records a change: FieldHistory, AuditLog, document + SOP versions,
 * ActivityEvent, and createdAt/updatedAt-derived events (new assets/people/
 * credentials/licenses/domains, people deactivated, credentials retired,
 * alarms raised/resolved). Secret values are never included.
 *
 * Note: integration syncs don't write FieldHistory for most fields, and the
 * Syncro sync bumps updatedAt on every asset nightly, so "asset updated by
 * sync" can only be shown where FieldHistory exists.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAuth()
  if (error) return error
  const { id } = await params
  if (!scopeAllows(await getClientScope(), id)) {
    return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })
  }
  const daysParam = Number(new URL(req.url).searchParams.get("days") ?? 14)
  const days = Number.isFinite(daysParam) ? Math.min(Math.max(Math.round(daysParam), 1), 90) : 14
  const since = new Date(Date.now() - days * DAY)

  try {
    // Name lookups for FieldHistory (which has no clientId) — ids of everything this client owns.
    const [assets, creds, licenses, netDevices] = await Promise.all([
      prisma.asset.findMany({
        where: { location: { clientId: id } },
        select: { id: true, name: true, friendlyName: true, dataSource: true, syncroAssetId: true, createdAt: true, status: true },
      }),
      prisma.credential.findMany({
        where: { clientId: id },
        select: { id: true, label: true, createdAt: true, updatedAt: true, isRetired: true, dataSource: true },
      }),
      prisma.license.findMany({
        where: { clientId: id },
        select: { id: true, name: true, createdAt: true, dataSource: true },
      }),
      prisma.networkDevice.findMany({ where: { clientId: id }, select: { id: true, name: true } }),
    ])
    const assetName = new Map(assets.map((a) => [a.id, a.friendlyName || a.name]))
    const credName = new Map(creds.map((c) => [c.id, c.label]))
    const licName = new Map(licenses.map((l) => [l.id, l.name]))
    const netName = new Map(netDevices.map((n) => [n.id, n.name]))
    const ownedIds = [...assetName.keys(), ...credName.keys(), ...licName.keys(), ...netName.keys()]

    const [history, audits, docVersions, sopVersions, activity, people, websites, alarms] = await Promise.all([
      ownedIds.length
        ? prisma.fieldHistory.findMany({
            where: { entityId: { in: ownedIds }, changedAt: { gte: since }, field: { not: "reveal" } },
            orderBy: { changedAt: "desc" },
            take: MAX_ITEMS,
          })
        : Promise.resolve([]),
      prisma.auditLog.findMany({
        where: {
          clientId: id,
          at: { gte: since },
          NOT: [{ action: { endsWith: ".reveal" } }, { action: { startsWith: "auth." } }],
        },
        select: { id: true, at: true, action: true, entityType: true, entityId: true, actorLabel: true, summary: true },
        orderBy: { at: "desc" },
        take: MAX_ITEMS,
      }),
      prisma.documentVersion.findMany({
        where: { savedAt: { gte: since }, document: { clientId: id } },
        select: { id: true, savedAt: true, savedBy: true, documentId: true, document: { select: { title: true, createdAt: true } } },
        orderBy: { savedAt: "desc" },
        take: MAX_ITEMS,
      }),
      prisma.runbookVersion.findMany({
        where: { savedAt: { gte: since }, runbook: { clientId: id } },
        select: { id: true, savedAt: true, savedBy: true, runbookId: true, runbook: { select: { title: true } } },
        orderBy: { savedAt: "desc" },
        take: MAX_ITEMS,
      }),
      prisma.activityEvent.findMany({
        where: { clientId: id, createdAt: { gte: since }, dismissedAt: null },
        select: { id: true, createdAt: true, title: true, eventType: true, staffUser: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: MAX_ITEMS,
      }),
      prisma.person.findMany({
        where: {
          clientId: id,
          OR: [{ createdAt: { gte: since } }, { isActive: false, updatedAt: { gte: since } }],
        },
        select: { id: true, name: true, isActive: true, createdAt: true, updatedAt: true, syncroContactId: true },
      }),
      prisma.website.findMany({
        where: { clientId: id, createdAt: { gte: since } },
        select: { id: true, domain: true, createdAt: true },
      }),
      prisma.alarm.findMany({
        where: { clientId: id, OR: [{ createdAt: { gte: since } }, { resolvedAt: { gte: since } }] },
        select: { id: true, message: true, severity: true, createdAt: true, resolvedAt: true },
        take: MAX_ITEMS,
      }),
    ])

    const items: ChangeItem[] = []
    const dayKey = (d: Date) => d.toISOString().slice(0, 10)
    /** entity+day pairs already explained by FieldHistory — skip the matching audit "updated" line. */
    const explained = new Set<string>()

    // ── FieldHistory ────────────────────────────────────────────────────────
    for (const h of history) {
      const field = fieldLabel(h.field)
      let subject: string
      let kind: ChangeKind
      let href: string | undefined
      if (assetName.has(h.entityId)) {
        subject = assetName.get(h.entityId)!; kind = "asset"; href = `/assets/${h.entityId}`
      } else if (credName.has(h.entityId)) {
        subject = `Credential '${credName.get(h.entityId)}'`; kind = "credential"
      } else if (licName.has(h.entityId)) {
        subject = `License '${licName.get(h.entityId)}'`; kind = "license"
      } else {
        subject = netName.get(h.entityId) ?? "Network device"; kind = "network"
      }
      let text: string
      if (h.field === "rotation") text = `${subject}: marked rotated`
      else if (kind === "credential" && h.field === "password") text = `${subject}: password changed`
      else if (SECRET_FIELD.test(h.field)) text = `${subject}: ${field} changed`
      else if (h.field === "isActive" && h.newValue === "false") text = `${subject}: archived`
      else text = `${subject}: ${field} ${short(h.oldValue)} → ${short(h.newValue)}`
      explained.add(`${h.entityId}|${dayKey(h.changedAt)}`)
      items.push({ id: `fh:${h.id}`, at: h.changedAt.toISOString(), kind, text, by: h.changedBy, href })
    }

    // Entities whose creation the audit log already describes — skip the derived "added" line.
    const auditedCreate = new Set(audits.filter((a) => a.entityId && /creat/.test(a.action)).map((a) => a.entityId!))

    // ── AuditLog (summaries are written by the app, never contain secrets) ──
    for (const a of audits) {
      if (a.entityId && /\.update/.test(a.action) && explained.has(`${a.entityId}|${dayKey(a.at)}`)) continue
      const kind: ChangeKind =
        a.entityType?.toLowerCase() === "asset" ? "asset"
        : a.entityType?.toLowerCase() === "credential" ? "credential"
        : "audit"
      items.push({
        id: `al:${a.id}`,
        at: a.at.toISOString(),
        kind,
        text: short(a.summary, 140),
        by: a.actorLabel,
        href: kind === "asset" && a.entityId ? `/assets/${a.entityId}` : undefined,
      })
    }

    // ── Document / SOP versions: collapse multiple saves per doc per day ────
    const collapse = <T extends { savedAt: Date; savedBy: string | null }>(
      rows: T[], keyOf: (r: T) => string,
    ) => {
      const m = new Map<string, { first: T; count: number; by: Set<string> }>()
      for (const r of rows) {
        const k = `${keyOf(r)}|${dayKey(r.savedAt)}`
        const e = m.get(k)
        if (e) { e.count++; if (r.savedBy) e.by.add(r.savedBy) }
        else m.set(k, { first: r, count: 1, by: new Set(r.savedBy ? [r.savedBy] : []) })
      }
      return [...m.values()]
    }
    for (const g of collapse(docVersions, (v) => v.documentId)) {
      const v = g.first
      items.push({
        id: `dv:${v.id}`,
        at: v.savedAt.toISOString(),
        kind: "document",
        text: `Document '${short(v.document.title, 70)}' edited${g.count > 1 ? ` (${g.count} saves)` : ""}`,
        by: [...g.by].join(", ") || null,
        href: `/clients/${id}?tab=Documents`,
      })
    }
    for (const g of collapse(sopVersions, (v) => v.runbookId)) {
      const v = g.first
      items.push({
        id: `rv:${v.id}`,
        at: v.savedAt.toISOString(),
        kind: "sop",
        text: `SOP '${short(v.runbook.title, 70)}' edited${g.count > 1 ? ` (${g.count} saves)` : ""}`,
        by: [...g.by].join(", ") || null,
        href: `/runbooks/${v.runbookId}`,
      })
    }

    // ── Activity feed ───────────────────────────────────────────────────────
    for (const e of activity) {
      items.push({
        id: `ae:${e.id}`,
        at: e.createdAt.toISOString(),
        kind: "activity",
        text: short(e.title, 140),
        by: e.staffUser?.name ?? null,
      })
    }

    // ── Derived: new records ────────────────────────────────────────────────
    for (const a of assets) {
      if (a.createdAt < since || auditedCreate.has(a.id)) continue
      items.push({
        id: `an:${a.id}`,
        at: a.createdAt.toISOString(),
        kind: "asset",
        text: `Asset ${a.friendlyName || a.name} added`,
        by: assetSource(a),
        href: `/assets/${a.id}`,
      })
    }
    for (const c of creds) {
      if (c.createdAt >= since) {
        if (auditedCreate.has(c.id)) continue
        items.push({ id: `cn:${c.id}`, at: c.createdAt.toISOString(), kind: "credential", text: `Credential '${c.label}' added`, by: SOURCE_LABEL[c.dataSource] ?? null })
      } else if (c.isRetired && c.updatedAt >= since) {
        items.push({ id: `cr:${c.id}`, at: c.updatedAt.toISOString(), kind: "credential", text: `Credential '${c.label}' retired`, by: null })
      }
    }
    for (const l of licenses) {
      if (l.createdAt < since || auditedCreate.has(l.id)) continue
      items.push({ id: `ln:${l.id}`, at: l.createdAt.toISOString(), kind: "license", text: `License '${l.name}' added`, by: SOURCE_LABEL[l.dataSource] ?? null })
    }
    for (const p of people) {
      if (p.createdAt >= since) {
        if (auditedCreate.has(p.id)) continue
        items.push({ id: `pn:${p.id}`, at: p.createdAt.toISOString(), kind: "person", text: `${p.name} added${p.isActive ? "" : " (inactive)"}`, by: p.syncroContactId ? "Syncro sync" : null })
      } else if (!p.isActive) {
        // updatedAt is the best timestamp we have for the deactivation.
        items.push({ id: `pd:${p.id}`, at: p.updatedAt.toISOString(), kind: "person", text: `${p.name} marked inactive`, by: null })
      }
    }
    for (const w of websites) {
      if (auditedCreate.has(w.id)) continue
      items.push({ id: `wn:${w.id}`, at: w.createdAt.toISOString(), kind: "website", text: `Domain ${w.domain} added`, by: null, href: `/clients/${id}?tab=Domains` })
    }
    for (const al of alarms) {
      if (al.createdAt >= since) {
        items.push({ id: `aa:${al.id}`, at: al.createdAt.toISOString(), kind: "alarm", text: `${al.severity === "CRITICAL" ? "Critical alarm" : "Alarm"}: ${short(al.message, 110)}`, by: null })
      }
      if (al.resolvedAt && al.resolvedAt >= since) {
        items.push({ id: `ar:${al.id}`, at: al.resolvedAt.toISOString(), kind: "alarm", text: `Resolved: ${short(al.message, 110)}`, by: null })
      }
    }

    items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    return NextResponse.json({ days, since: since.toISOString(), items: items.slice(0, MAX_ITEMS), truncated: items.length > MAX_ITEMS })
  } catch (e) {
    console.error("[changes]", e)
    return NextResponse.json({ error: "Failed to load changes" }, { status: 500 })
  }
}
