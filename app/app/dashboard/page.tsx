"use client"

import AppShell from "@/components/AppShell"
import { useSession } from "next-auth/react"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"

type Stats = {
  clients: number
  assets: number
  alarms: number
  licensesExpiring: number
}

type ExpirationItem = {
  id: string
  category: string
  label: string
  clientName: string
  expiresAt: string
  linkPath: string
}

type AlarmItem = {
  id: string
  severity: "INFO" | "WARNING" | "CRITICAL"
  type: string
  message: string
  client: { id: string; name: string }
  createdAt: string
}

type ActivityItem = {
  id: string
  eventType: string
  title: string
  body: string | null
  createdAt: string
  isPinned: boolean
  client: { id: string; name: string }
  staffUser: { id: string; name: string } | null
}

type FlaggedDoc = {
  id: string
  title: string
  flaggedAt: string | null
  reviewNote: string | null
  client: { id: string; name: string }
}

type SyncStatusRow = {
  key: string
  status: "OK" | "ERROR" | "DEGRADED" | "UNCONFIGURED"
  lastRunAt: string
  message: string | null
}

const SYNC_LABELS: Record<string, string> = {
  syncro: "Syncro",
  domains: "Domain monitor",
  alerts: "Alerts email",
  synology: "Synology",
  unifiLocal: "UniFi local",
  uptime: "HTTP uptime",
  backupVerify: "Backup verify",
}

function relativeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60) return "just now"
  const mins = Math.floor(secs / 60); if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60); if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function daysUntil(iso: string) {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000)
}

function expiryColor(iso: string) {
  const d = daysUntil(iso)
  if (d < 0) return "#ef4444"
  if (d <= 7) return "#ef4444"
  if (d <= 30) return "#f59e0b"
  return "#22c55e"
}

function alarmColor(severity: string) {
  if (severity === "CRITICAL") return "#ef4444"
  if (severity === "WARNING") return "#f59e0b"
  return "#3d6fff"
}

export default function DashboardPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [stats, setStats] = useState<Stats | null>(null)
  const [expirations, setExpirations] = useState<ExpirationItem[]>([])
  const [recentAlarms, setRecentAlarms] = useState<AlarmItem[]>([])
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [flaggedDocs, setFlaggedDocs] = useState<FlaggedDoc[]>([])
  const [syncRows, setSyncRows] = useState<SyncStatusRow[]>([])

  useEffect(() => {
    fetch("/api/dashboard")
      .then(r => r.json())
      .then(setStats)
      .catch(() => {})
    fetch("/api/expirations")
      .then(r => r.json())
      .then((items: ExpirationItem[]) => setExpirations(items.slice(0, 5)))
      .catch(() => {})
    fetch("/api/alarms?status=ACTIVE")
      .then(r => r.json())
      .then((items: AlarmItem[]) => setRecentAlarms(items.slice(0, 5)))
      .catch(() => {})
    fetch("/api/activity/recent")
      .then(r => r.json())
      .then((items: ActivityItem[]) => setActivity(items.slice(0, 8)))
      .catch(() => {})
    fetch("/api/documents/flagged")
      .then(r => r.json())
      .then((items: FlaggedDoc[]) => setFlaggedDocs(items.slice(0, 5)))
      .catch(() => {})
    fetch("/api/sync-status")
      .then(r => r.json())
      .then((rows: SyncStatusRow[]) => setSyncRows(rows.filter(r => r.status === "ERROR")))
      .catch(() => {})
  }, [])

  const cards = [
    { label: "Active clients", value: stats?.clients, href: "/clients" },
    { label: "Active assets", value: stats?.assets, href: "/clients" },
    { label: "Open alarms", value: stats?.alarms, href: "/alarms" },
    { label: "Licenses expiring", value: stats?.licensesExpiring, href: "/clients" },
  ]

  return (
    <AppShell>
      <div style={{ padding: "32px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 500, marginBottom: "4px" }}>Dashboard</h1>
        <p style={{ fontSize: "14px", color: "var(--color-text-secondary)", marginBottom: "32px" }}>
          Welcome back, {session?.user?.name?.split(" ")[0]}
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", maxWidth: "800px" }}>
          {cards.map((card) => (
            <div
              key={card.label}
              onClick={() => router.push(card.href)}
              style={{
                background: "var(--color-background-secondary)",
                borderRadius: "10px", padding: "16px",
                border: "0.5px solid var(--color-border-tertiary)",
                cursor: "pointer",
              }}
              onMouseEnter={e => (e.currentTarget.style.border = "0.5px solid var(--color-border-secondary)")}
              onMouseLeave={e => (e.currentTarget.style.border = "0.5px solid var(--color-border-tertiary)")}
            >
              <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginBottom: "6px" }}>
                {card.label}
              </div>
              <div style={{ fontSize: "28px", fontWeight: 500 }}>
                {card.value ?? "—"}
              </div>
            </div>
          ))}
        </div>

        {/* Widgets row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", maxWidth: "800px", marginTop: "24px" }}>

          {/* Soonest expirations */}
          <div style={{
            background: "var(--color-background-secondary)",
            border: "0.5px solid var(--color-border-tertiary)",
            borderRadius: "10px", padding: "16px",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <div style={{ fontSize: "13px", fontWeight: 500 }}>Soonest expirations</div>
              <button
                onClick={() => router.push("/expirations")}
                style={{ fontSize: "11px", color: "var(--color-accent, #3d6fff)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                View all
              </button>
            </div>
            {expirations.length === 0 ? (
              <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>None upcoming</div>
            ) : expirations.map(item => {
              const d = daysUntil(item.expiresAt)
              const color = expiryColor(item.expiresAt)
              return (
                <div
                  key={item.id}
                  onClick={() => router.push(item.linkPath)}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", cursor: "pointer", borderBottom: "0.5px solid var(--color-border-tertiary)" }}
                >
                  <div>
                    <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-primary)" }}>{item.label}</div>
                    <div style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>{item.clientName} · {item.category}</div>
                  </div>
                  <div style={{ fontSize: "11px", fontWeight: 600, color, whiteSpace: "nowrap", marginLeft: "8px" }}>
                    {d < 0 ? `${Math.abs(d)}d ago` : d === 0 ? "Today" : `${d}d`}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Recent active alarms */}
          <div style={{
            background: "var(--color-background-secondary)",
            border: "0.5px solid var(--color-border-tertiary)",
            borderRadius: "10px", padding: "16px",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <div style={{ fontSize: "13px", fontWeight: 500 }}>Active alarms</div>
              <button
                onClick={() => router.push("/alarms")}
                style={{ fontSize: "11px", color: "var(--color-accent, #3d6fff)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                View all
              </button>
            </div>
            {recentAlarms.length === 0 ? (
              <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>No active alarms</div>
            ) : recentAlarms.map(alarm => (
              <div
                key={alarm.id}
                onClick={() => router.push("/alarms")}
                style={{ display: "flex", alignItems: "flex-start", gap: "8px", padding: "6px 0", cursor: "pointer", borderBottom: "0.5px solid var(--color-border-tertiary)" }}
              >
                <div style={{
                  width: "6px", height: "6px", borderRadius: "50%", marginTop: "5px", flexShrink: 0,
                  background: alarmColor(alarm.severity),
                }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {alarm.message}
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>
                    {alarm.client.name} · {alarm.severity}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Docs needing review */}
          <div style={{
            background: "var(--color-background-secondary)",
            border: "0.5px solid var(--color-border-tertiary)",
            borderRadius: "10px", padding: "16px",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <div style={{ fontSize: "13px", fontWeight: 500 }}>
                Docs flagged for review
                {flaggedDocs.length > 0 && (
                  <span style={{ marginLeft: 6, fontSize: 11, color: "#b45309" }}>
                    {flaggedDocs.length}
                  </span>
                )}
              </div>
              <button
                onClick={() => router.push("/docs/review")}
                style={{ fontSize: "11px", color: "var(--color-accent, #3d6fff)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                View all
              </button>
            </div>
            {flaggedDocs.length === 0 ? (
              <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>Nothing flagged</div>
            ) : flaggedDocs.map(doc => (
              <div
                key={doc.id}
                onClick={() => router.push(`/clients/${doc.client.id}?tab=Documents`)}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "6px 0", cursor: "pointer", borderBottom: "0.5px solid var(--color-border-tertiary)", gap: 8 }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {doc.title}
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>
                    {doc.client.name}{doc.reviewNote ? ` · ${doc.reviewNote}` : ""}
                  </div>
                </div>
                {doc.flaggedAt && (
                  <div style={{ fontSize: "11px", color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
                    {relativeAgo(doc.flaggedAt)}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Sync errors */}
          <div style={{
            background: "var(--color-background-secondary)",
            border: "0.5px solid var(--color-border-tertiary)",
            borderRadius: "10px", padding: "16px",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <div style={{ fontSize: "13px", fontWeight: 500 }}>
                Integration errors
                {syncRows.length > 0 && (
                  <span style={{ marginLeft: 6, fontSize: 11, color: "#dc2626" }}>
                    {syncRows.length}
                  </span>
                )}
              </div>
              <button
                onClick={() => router.push("/settings?section=sync-status")}
                style={{ fontSize: "11px", color: "var(--color-accent, #3d6fff)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                View all
              </button>
            </div>
            {syncRows.length === 0 ? (
              <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>All integrations healthy</div>
            ) : syncRows.map(row => (
              <div
                key={row.key}
                onClick={() => router.push("/settings?section=sync-status")}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "6px 0", cursor: "pointer", borderBottom: "0.5px solid var(--color-border-tertiary)", gap: 8 }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-primary)" }}>
                    {SYNC_LABELS[row.key] ?? row.key}
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row.message ?? "Error"}
                  </div>
                </div>
                <div style={{ fontSize: "11px", color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
                  {relativeAgo(row.lastRunAt)}
                </div>
              </div>
            ))}
          </div>

        </div>

        {/* Wider activity feed below */}
        <div style={{
          maxWidth: "800px", marginTop: "16px",
          background: "var(--color-background-secondary)",
          border: "0.5px solid var(--color-border-tertiary)",
          borderRadius: "10px", padding: "16px",
        }}>
          <div style={{ fontSize: "13px", fontWeight: 500, marginBottom: "12px" }}>
            Recent activity — across all clients
          </div>
          {activity.length === 0 ? (
            <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>No recent activity</div>
          ) : activity.map(ev => (
            <div
              key={ev.id}
              onClick={() => router.push(`/clients/${ev.client.id}?tab=Audit%20Trail`)}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, padding: "6px 0", cursor: "pointer", borderBottom: "0.5px solid var(--color-border-tertiary)" }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: "12px", color: "var(--color-text-primary)" }}>
                  <span style={{ fontWeight: 500 }}>{ev.title}</span>
                  {ev.body && <span style={{ color: "var(--color-text-secondary)" }}> — {ev.body}</span>}
                </div>
                <div style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>
                  {ev.client.name}
                  {ev.staffUser && ` · ${ev.staffUser.name}`}
                </div>
              </div>
              <div style={{ fontSize: "11px", color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
                {relativeAgo(ev.createdAt)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  )
}
