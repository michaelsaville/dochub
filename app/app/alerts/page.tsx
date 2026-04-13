"use client"

import AppShell from "@/components/AppShell"
import { useState, useEffect } from "react"

type AlertCategory = "ssl" | "domain" | "warranty" | "credential" | "license" | "operational"
type AlertUrgency = "expired" | "critical" | "warning" | "upcoming" | "info"

type UnifiedAlert = {
  id: string
  category: AlertCategory
  label: string
  sublabel?: string
  message?: string
  severity?: string
  status?: string
  urgency: AlertUrgency
  expiresAt: string | null
  clientId: string
  clientName: string
  linkPath: string
  alarmId?: string
  createdAt?: string
}

type Stats = { total: number; expired: number; critical: number; warning: number; upcoming: number }

const CATEGORIES: { key: AlertCategory | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "ssl", label: "SSL" },
  { key: "domain", label: "Domain" },
  { key: "warranty", label: "Warranty" },
  { key: "credential", label: "Credential" },
  { key: "license", label: "License" },
  { key: "operational", label: "Operational" },
]

const urgencyConfig: Record<AlertUrgency, { label: string; bg: string; color: string }> = {
  expired:  { label: "Expired",  bg: "#fef2f2", color: "#dc2626" },
  critical: { label: "Critical", bg: "#fef2f2", color: "#ef4444" },
  warning:  { label: "Warning",  bg: "#fffbeb", color: "#f59e0b" },
  upcoming: { label: "Upcoming", bg: "#f0fdf4", color: "#22c55e" },
  info:     { label: "Info",     bg: "#f5f3ff", color: "#6366f1" },
}

const categoryIcons: Record<AlertCategory, string> = {
  ssl: "🔒", domain: "🌐", warranty: "🛡", credential: "🔑", license: "📜", operational: "⚠",
}

function daysUntil(dateStr: string): string {
  const days = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000)
  if (days < 0) return `${Math.abs(days)}d overdue`
  if (days === 0) return "today"
  return `${days}d`
}

export default function UnifiedAlertsPage() {
  const [alerts, setAlerts] = useState<UnifiedAlert[]>([])
  const [stats, setStats] = useState<Stats>({ total: 0, expired: 0, critical: 0, warning: 0, upcoming: 0 })
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState<AlertCategory | "all">("all")
  const [urgencyFilter, setUrgencyFilter] = useState<AlertUrgency | "all">("all")
  const [creatingTicket, setCreatingTicket] = useState<string | null>(null)
  const [ticketResult, setTicketResult] = useState<Record<string, { url?: string; error?: string }>>({})

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (category !== "all") params.set("category", category)
    fetch(`/api/alerts/unified?${params}`)
      .then(r => r.json())
      .then(d => { setAlerts(d.items ?? []); setStats(d.stats ?? stats) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [category])

  const filtered = urgencyFilter === "all" ? alerts : alerts.filter(a => a.urgency === urgencyFilter)

  async function createTicket(alert: UnifiedAlert) {
    setCreatingTicket(alert.id)
    try {
      const title = alert.category === "operational"
        ? `[Alert] ${alert.label}: ${alert.message}`
        : `[${alert.category.toUpperCase()}] ${alert.label} — ${alert.urgency === "expired" ? "expired" : "expiring " + (alert.expiresAt ? daysUntil(alert.expiresAt) : "")}`
      const description = [
        `Alert Type: ${alert.category}`,
        `Client: ${alert.clientName}`,
        alert.sublabel ? `Details: ${alert.sublabel}` : "",
        alert.expiresAt ? `Expires: ${new Date(alert.expiresAt).toLocaleDateString()}` : "",
        alert.message ? `Message: ${alert.message}` : "",
        `\nSource: DocHub Alert ${alert.id}`,
      ].filter(Boolean).join("\n")

      const priority = alert.urgency === "expired" || alert.urgency === "critical" ? "HIGH" : "MEDIUM"

      const res = await fetch("/api/alerts/create-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientName: alert.clientName, title, description, priority }),
      })
      const data = await res.json()
      if (res.ok && data.url) {
        setTicketResult(prev => ({ ...prev, [alert.id]: { url: data.url } }))
      } else {
        setTicketResult(prev => ({ ...prev, [alert.id]: { error: data.error || "Failed" } }))
      }
    } catch {
      setTicketResult(prev => ({ ...prev, [alert.id]: { error: "Network error" } }))
    } finally {
      setCreatingTicket(null)
    }
  }

  return (
    <AppShell>
      <div style={{ padding: "28px 32px", maxWidth: "1200px" }}>
        <h1 style={{ fontFamily: "var(--mono)", fontSize: "22px", fontWeight: 600, color: "var(--text)", marginBottom: "4px" }}>
          Alerts
        </h1>
        <p style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "20px" }}>
          Expirations, operational alarms, and system alerts across all clients.
        </p>

        {/* Stat tiles */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "20px", flexWrap: "wrap" }}>
          {[
            { label: "Expired", value: stats.expired, color: "#ef4444", filter: "expired" as const },
            { label: "Critical", value: stats.critical, color: "#f59e0b", filter: "critical" as const },
            { label: "Warning", value: stats.warning, color: "#eab308", filter: "warning" as const },
            { label: "Upcoming", value: stats.upcoming, color: "#22c55e", filter: "upcoming" as const },
            { label: "Total", value: stats.total, color: "var(--muted)", filter: "all" as const },
          ].map(s => (
            <button
              key={s.label}
              onClick={() => setUrgencyFilter(s.filter)}
              style={{
                padding: "10px 16px", borderRadius: "8px", border: urgencyFilter === s.filter ? `2px solid ${s.color}` : "0.5px solid var(--color-border-tertiary)",
                background: "var(--color-background-secondary)", cursor: "pointer", minWidth: "90px", textAlign: "left",
              }}
            >
              <div style={{ fontSize: "20px", fontWeight: 700, fontFamily: "var(--mono)", color: s.color }}>{s.value}</div>
              <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "2px" }}>{s.label}</div>
            </button>
          ))}
        </div>

        {/* Category tabs */}
        <div style={{ display: "flex", gap: "4px", marginBottom: "16px", flexWrap: "wrap" }}>
          {CATEGORIES.map(c => (
            <button
              key={c.key}
              onClick={() => setCategory(c.key)}
              style={{
                padding: "5px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: category === c.key ? 600 : 400,
                border: "0.5px solid var(--color-border-tertiary)", cursor: "pointer",
                background: category === c.key ? "rgba(61,111,255,0.1)" : "transparent",
                color: category === c.key ? "var(--accent)" : "var(--muted)",
              }}
            >
              {c.label}
            </button>
          ))}
          {urgencyFilter !== "all" && (
            <button
              onClick={() => setUrgencyFilter("all")}
              style={{ padding: "5px 12px", borderRadius: "6px", fontSize: "11px", border: "none", background: "none", cursor: "pointer", color: "var(--accent)" }}
            >
              Clear urgency filter
            </button>
          )}
        </div>

        {/* Alert list */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "var(--muted)", fontSize: "13px" }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "var(--muted)", fontSize: "13px" }}>No alerts matching filters.</div>
        ) : (
          <div style={{ background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "10px", overflow: "hidden" }}>
            {/* Header */}
            <div style={{ display: "grid", gridTemplateColumns: "36px 1fr 130px 100px 80px 100px", gap: "8px", padding: "8px 12px", borderBottom: "0.5px solid var(--color-border-tertiary)", fontSize: "10px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              <div></div>
              <div>Alert</div>
              <div>Client</div>
              <div>Urgency</div>
              <div>Expires</div>
              <div></div>
            </div>

            {/* Rows */}
            {filtered.map((alert, i) => {
              const urg = urgencyConfig[alert.urgency]
              const result = ticketResult[alert.id]

              return (
                <div key={alert.id} style={{ display: "grid", gridTemplateColumns: "36px 1fr 130px 100px 80px 100px", gap: "8px", padding: "10px 12px", alignItems: "center", borderBottom: i < filtered.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none" }}>
                  {/* Icon */}
                  <div style={{ fontSize: "16px", textAlign: "center" }}>
                    {categoryIcons[alert.category]}
                  </div>

                  {/* Label */}
                  <div style={{ minWidth: 0 }}>
                    <a href={alert.linkPath} style={{ fontSize: "13px", fontWeight: 500, color: "var(--accent)", textDecoration: "none" }}>
                      {alert.label}
                    </a>
                    {alert.sublabel && <div style={{ fontSize: "11px", color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{alert.sublabel}</div>}
                    {alert.message && <div style={{ fontSize: "11px", color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{alert.message}</div>}
                  </div>

                  {/* Client */}
                  <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {alert.clientName}
                  </div>

                  {/* Urgency badge */}
                  <div>
                    <span style={{ fontSize: "10px", fontWeight: 600, padding: "2px 8px", borderRadius: "4px", background: urg.bg, color: urg.color }}>
                      {urg.label}
                    </span>
                  </div>

                  {/* Expiry */}
                  <div style={{ fontSize: "11px", fontFamily: "var(--mono)", color: alert.urgency === "expired" ? "#ef4444" : "var(--muted)" }}>
                    {alert.expiresAt ? daysUntil(alert.expiresAt) : "—"}
                  </div>

                  {/* Actions */}
                  <div>
                    {result?.url ? (
                      <a href={result.url} target="_blank" rel="noopener" style={{ fontSize: "11px", color: "#22c55e", textDecoration: "none", fontWeight: 500 }}>
                        View Ticket →
                      </a>
                    ) : result?.error ? (
                      <span style={{ fontSize: "10px", color: "#ef4444" }}>{result.error}</span>
                    ) : (
                      <button
                        onClick={() => createTicket(alert)}
                        disabled={creatingTicket === alert.id}
                        style={{
                          fontSize: "11px", padding: "3px 8px", borderRadius: "5px",
                          border: "0.5px solid var(--color-border-secondary)",
                          background: "transparent", cursor: "pointer",
                          color: "var(--color-text-secondary)",
                          opacity: creatingTicket === alert.id ? 0.5 : 1,
                        }}
                      >
                        {creatingTicket === alert.id ? "..." : "Create Ticket"}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </AppShell>
  )
}
