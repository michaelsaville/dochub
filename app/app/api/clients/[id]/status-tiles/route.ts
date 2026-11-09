import { NextResponse } from "next/server"
import { breezeConfigured, liveStatuses } from "@/lib/breeze"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"
import { computeRotation, getRotationSettings } from "@/lib/rotation"

export type TileTone = "ok" | "warn" | "bad" | "neutral"
export type StatusTile = {
  key: string
  label: string
  value: string
  /** one short line under the value */
  sub?: string
  tone: TileTone
  href?: string
}

const DAY = 86_400_000
const daysUntil = (d: Date, now: Date) => Math.ceil((d.getTime() - now.getTime()) / DAY)
const ago = (d: Date, now: Date) => {
  const m = Math.round((now.getTime() - d.getTime()) / 60_000)
  if (m < 60) return `${Math.max(m, 0)}m ago`
  const h = Math.round(m / 60)
  if (h < 48) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`

/**
 * Hudu "Magic Dash"-style health tiles for one client, built only from data
 * DocHub actually stores. Tiles whose data source doesn't exist for this
 * client are omitted (not shown as zero).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireAuth()
  if (error) return error
  const { id } = await params
  if (!scopeAllows(await getClientScope(), id)) {
    return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })
  }
  const isAdmin = session.user.role === "ADMIN"
  const base = `/clients/${id}?tab=`
  const now = new Date()

  try {
    const client = await prisma.client.findUnique({
      where: { id },
      select: { id: true, syncroId: true, lastSyncedAt: true, breezeOrgId: true },
    })
    if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const [
      alarms, websites, licenses, assetAgg, warrantyExpired, warrantySoon,
      creds, synologyJobs, backupConfigs, unifiAssets, syncStatuses, unifiSiteMap, rotationSettings,
    ] = await Promise.all([
      prisma.alarm.groupBy({
        by: ["severity"],
        where: { clientId: id, status: "ACTIVE" },
        _count: { _all: true },
      }),
      prisma.website.findMany({
        where: { clientId: id },
        select: { expiresAt: true, sslExpiresAt: true, uptimeEnabled: true, isUp: true },
      }),
      prisma.license.findMany({
        where: { clientId: id, isActive: true },
        select: {
          seats: true, assignedSeats: true, expiryDate: true, renewalDate: true,
          _count: { select: { seatAssignments: true } },
        },
      }),
      prisma.asset.count({ where: { location: { clientId: id }, status: "ACTIVE" } }),
      prisma.asset.count({
        where: { location: { clientId: id }, status: "ACTIVE", warrantyExpiry: { lt: now } },
      }),
      prisma.asset.count({
        where: {
          location: { clientId: id }, status: "ACTIVE",
          warrantyExpiry: { gte: now, lt: new Date(now.getTime() + 90 * DAY) },
        },
      }),
      prisma.credential.findMany({
        where: { clientId: id, isRetired: false },
        select: {
          lastRotated: true, createdAt: true, rotationIntervalDays: true,
          rotationExempt: true, rotationSnoozedUntil: true,
        },
      }),
      prisma.synologyBackupJob.findMany({
        where: { config: { asset: { location: { clientId: id } } } },
        select: { lastResult: true, lastRunAt: true, config: { select: { assetId: true } } },
      }),
      prisma.backupConfig.findMany({
        where: { clientId: id, status: "active" },
        select: { nextVerifyBy: true, lastVerifiedAt: true },
      }),
      prisma.asset.aggregate({
        where: { location: { clientId: id }, dataSource: "UNIFI" },
        _count: { _all: true },
        _max: { updatedAt: true },
      }),
      prisma.integrationSyncStatus.findMany({
        where: { key: { in: ["syncro", "unifiCloud", "unifiLocal", "synology"] } },
      }),
      prisma.appSetting.findUnique({ where: { key: "integration:unifi:siteMap" } }),
      getRotationSettings(),
    ])

    const syncroAssetsOff = (await prisma.appSetting.findUnique({ where: { key: "integration:syncro:assetsDisabled" } }))?.value === "true"
    const tiles: StatusTile[] = []
    const status = new Map(syncStatuses.map((s) => [s.key, s]))

    // ── Alarms (DocHub's own — always shown) ────────────────────────────────
    const crit = alarms.find((a) => a.severity === "CRITICAL")?._count._all ?? 0
    const warn = alarms.find((a) => a.severity === "WARNING")?._count._all ?? 0
    const totalAlarms = alarms.reduce((n, a) => n + a._count._all, 0)
    tiles.push({
      key: "alarms",
      label: "Open alarms",
      value: String(totalAlarms),
      sub: totalAlarms === 0 ? "All clear" : [crit && `${crit} critical`, warn && `${warn} warning`].filter(Boolean).join(" · ") || "info only",
      tone: crit > 0 ? "bad" : warn > 0 ? "warn" : totalAlarms > 0 ? "neutral" : "ok",
      href: `${base}Dashboard`,
    })

    // ── Domains + SSL ───────────────────────────────────────────────────────
    if (websites.length > 0) {
      const domainDays = websites.filter((w) => w.expiresAt).map((w) => daysUntil(w.expiresAt!, now))
      const sslDays = websites.filter((w) => w.sslExpiresAt).map((w) => daysUntil(w.sslExpiresAt!, now))
      const minDomain = domainDays.length ? Math.min(...domainDays) : null
      const minSsl = sslDays.length ? Math.min(...sslDays) : null
      const parts: string[] = []
      if (minSsl !== null) parts.push(minSsl < 0 ? `SSL expired ${-minSsl}d ago` : `SSL ${minSsl}d left`)
      if (minDomain !== null) parts.push(minDomain < 0 ? `domain expired` : `domain ${minDomain}d left`)
      const worst = Math.min(minSsl ?? Infinity, minDomain ?? Infinity)
      tiles.push({
        key: "domains",
        label: "Domains",
        value: String(websites.length),
        sub: parts.join(" · ") || "No expiry data",
        tone: worst === Infinity ? "neutral" : worst < 7 ? "bad" : worst < 30 ? "warn" : "ok",
        href: `${base}Domains`,
      })

      const monitored = websites.filter((w) => w.uptimeEnabled)
      if (monitored.length > 0) {
        const down = monitored.filter((w) => !w.isUp).length
        tiles.push({
          key: "uptime",
          label: "Sites up",
          value: `${monitored.length - down}/${monitored.length}`,
          sub: down ? `${plural(down, "site")} down` : "All responding",
          tone: down ? "bad" : "ok",
          href: `${base}Domains`,
        })
      }
    }

    // ── Licenses: seats + expiring ──────────────────────────────────────────
    if (licenses.length > 0) {
      let total = 0
      let used = 0
      let withSeats = 0
      for (const l of licenses) {
        if (!l.seats) continue
        withSeats++
        total += l.seats
        used += l._count.seatAssignments > 0 ? l._count.seatAssignments : (l.assignedSeats ?? 0)
      }
      const soon = licenses.filter((l) => {
        const d = l.expiryDate ?? l.renewalDate
        return d && daysUntil(d, now) <= 30
      }).length
      const expired = licenses.filter((l) => l.expiryDate && l.expiryDate < now).length
      const over = used > total && total > 0
      tiles.push({
        key: "licenses",
        label: "License seats",
        value: withSeats ? `${used}/${total}` : String(licenses.length),
        sub: [
          !withSeats && plural(licenses.length, "license"),
          expired && `${expired} expired`,
          soon - expired > 0 && `${soon - expired} renew ≤30d`,
          over && "over-assigned",
        ].filter(Boolean).join(" · ") || "No renewals due",
        tone: expired || over ? "bad" : soon ? "warn" : "ok",
        href: `${base}Licenses`,
      })
    }

    // ── Assets + warranty ───────────────────────────────────────────────────
    if (assetAgg > 0) {
      tiles.push({
        key: "assets",
        label: "Active assets",
        value: String(assetAgg),
        sub: warrantyExpired || warrantySoon
          ? [warrantyExpired && `${warrantyExpired} out of warranty`, warrantySoon && `${warrantySoon} expire ≤90d`].filter(Boolean).join(" · ")
          : "Warranty OK / untracked",
        tone: warrantyExpired ? "warn" : "neutral",
        href: `${base}Assets`,
      })
    }

    // ── Credential rotation ─────────────────────────────────────────────────
    if (creds.length > 0 && rotationSettings.enabled) {
      let overdue = 0
      let dueSoon = 0
      for (const c of creds) {
        const r = computeRotation(c, rotationSettings, now)
        if (r.status === "overdue") overdue++
        else if (r.status === "dueSoon") dueSoon++
      }
      tiles.push({
        key: "rotation",
        label: "Passwords to rotate",
        value: String(overdue),
        sub: `of ${creds.length} active${dueSoon ? ` · ${dueSoon} due soon` : ""}`,
        tone: overdue > 0 ? "warn" : "ok",
        href: `${base}Credentials`,
      })
    }

    // ── Backups (Synology job results + documented verification) ────────────
    if (synologyJobs.length > 0 || backupConfigs.length > 0) {
      const failed = synologyJobs.filter((j) => j.lastResult === "error").length
      const warned = synologyJobs.filter((j) => j.lastResult === "warning" || j.lastResult === "unfinished").length
      const stale = synologyJobs.filter((j) => !j.lastRunAt || now.getTime() - j.lastRunAt.getTime() > 3 * DAY).length
      const verifyOverdue = backupConfigs.filter((b) => b.nextVerifyBy && b.nextVerifyBy < now).length
      const okJobs = synologyJobs.length - failed - warned
      const nasIds = new Set(synologyJobs.map((j) => j.config.assetId))
      tiles.push({
        key: "backups",
        label: "Backups",
        value: synologyJobs.length ? `${okJobs}/${synologyJobs.length}` : plural(backupConfigs.length, "plan"),
        sub: [
          failed && `${failed} failed`,
          warned && `${warned} warning`,
          stale && `${stale} not run in 3d`,
          verifyOverdue && `${verifyOverdue} restore test overdue`,
        ].filter(Boolean).join(" · ") || (synologyJobs.length ? "Last runs OK" : "Documented"),
        tone: failed ? "bad" : warned || stale || verifyOverdue ? "warn" : "ok",
        // No client-level backups tab exists; Synology status lives on the NAS asset page.
        href: nasIds.size === 1 ? `/assets/${[...nasIds][0]}` : undefined,
      })
    }

    // ── Breeze devices (live agent status, 2-min cache) ─────────────────────
    if (client.breezeOrgId && breezeConfigured()) {
      const linked = await prisma.asset.findMany({
        where: { location: { clientId: id }, breezeDeviceId: { not: null }, status: { notIn: ["RETIRED", "DISPOSED"] } },
        select: { breezeDeviceId: true, lastSeenAt: true },
      })
      try {
        const live = await liveStatuses()
        const st = linked.map((a) => live.get(a.breezeDeviceId!))
        const online = st.filter((x) => x?.status === "online").length
        const stale = linked.filter((a, i) => {
          const seen = st[i]?.lastSeenAt ? new Date(st[i]!.lastSeenAt!) : a.lastSeenAt
          return !seen || now.getTime() - seen.getTime() > 7 * DAY
        }).length
        tiles.push({
          key: "breeze",
          label: "Devices online",
          value: linked.length ? `${online}/${linked.length}` : "0",
          sub: linked.length === 0 ? "No Breeze agents synced yet" : stale ? `${stale} not seen in 7d+` : "All checked in this week",
          tone: linked.length === 0 ? "neutral" : stale > 0 ? "warn" : "ok",
          href: `${base}Assets`,
        })
      } catch {
        tiles.push({ key: "breeze", label: "Devices online", value: "—", sub: "Breeze unreachable", tone: "warn", href: `${base}Assets` })
      }
    }

    // ── Syncro sync health ──────────────────────────────────────────────────
    if (client.syncroId) {
      const s = status.get("syncro")
      const last = client.lastSyncedAt
      const ageH = last ? (now.getTime() - last.getTime()) / 3_600_000 : Infinity
      tiles.push({
        key: "syncro",
        label: "Syncro sync",
        value: last ? ago(last, now) : "never",
        sub: s?.status === "ERROR" ? (isAdmin ? `Error: ${s.message ?? "unknown"}`.slice(0, 80) : "Last run failed") : syncroAssetsOff ? "Client roster (Breeze owns assets)" : "Contacts + assets",
        tone: s?.status === "ERROR" || ageH > 72 ? "bad" : ageH > 36 ? "warn" : "ok",
        href: isAdmin ? "/settings" : undefined,
      })
    }

    // ── UniFi sync health ───────────────────────────────────────────────────
    let unifiMapped = false
    try {
      const map = unifiSiteMap ? (JSON.parse(unifiSiteMap.value) as Record<string, string>) : {}
      unifiMapped = Object.values(map).includes(id)
    } catch { /* malformed setting — treat as unmapped */ }
    if (unifiMapped || unifiAssets._count._all > 0) {
      const s = [status.get("unifiCloud"), status.get("unifiLocal")].find((x) => x && x.status !== "UNCONFIGURED")
      const last = unifiAssets._max.updatedAt
      const ageH = last ? (now.getTime() - last.getTime()) / 3_600_000 : Infinity
      tiles.push({
        key: "unifi",
        label: "UniFi sync",
        value: last ? ago(last, now) : "no devices",
        sub: s?.status === "ERROR"
          ? (isAdmin ? `Error: ${s.message ?? "unknown"}`.slice(0, 80) : "Last run failed")
          : `${plural(unifiAssets._count._all, "device")}${unifiMapped ? "" : " · site unmapped"}`,
        tone: s?.status === "ERROR" || ageH > 72 ? "bad" : ageH > 36 || !unifiMapped ? "warn" : "ok",
        href: `${base}Network`,
      })
    }

    return NextResponse.json({ tiles, generatedAt: now.toISOString() })
  } catch (e) {
    console.error("[status-tiles]", e)
    return NextResponse.json({ error: "Failed to load status" }, { status: 500 })
  }
}
