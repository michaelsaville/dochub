"use client"

import AppShell from "@/components/AppShell"
import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"

type Category = "ssl" | "domain" | "warranty" | "credential" | "license"
type UrgencyKey = "expired" | "critical" | "warning" | "upcoming"

type ExpirationItem = {
  id: string
  category: Category
  label: string
  sublabel?: string
  expiresAt: string
  clientId: string
  clientName: string
  linkPath: string
}

const CATEGORY_META: Record<Category, { label: string; color: string; bg: string }> = {
  ssl:        { label: "SSL",        color: "#6366f1", bg: "rgba(99,102,241,0.12)"  },
  domain:     { label: "Domain",     color: "#10b981", bg: "rgba(16,185,129,0.12)"  },
  warranty:   { label: "Warranty",   color: "#f59e0b", bg: "rgba(245,158,11,0.12)"  },
  credential: { label: "Credential", color: "#ec4899", bg: "rgba(236,72,153,0.12)"  },
  license:    { label: "License",    color: "#3b82f6", bg: "rgba(59,130,246,0.12)"  },
}

const URGENCY_META: Record<UrgencyKey, { label: string; color: string; bg: string }> = {
  expired:  { label: "Expired",  color: "#ef4444", bg: "rgba(239,68,68,0.12)"   },
  critical: { label: "≤ 7 days", color: "#f97316", bg: "rgba(249,115,22,0.12)"  },
  warning:  { label: "≤ 30 days",color: "#f59e0b", bg: "rgba(245,158,11,0.12)"  },
  upcoming: { label: "> 30 days", color: "#10b981", bg: "rgba(16,185,129,0.12)" },
}

function daysUntil(date: string): number {
  return Math.floor((new Date(date).getTime() - Date.now()) / 86400000)
}

function classify(days: number): UrgencyKey {
  if (days < 0)  return "expired"
  if (days <= 7) return "critical"
  if (days <= 30) return "warning"
  return "upcoming"
}

function UrgencyBadge({ expiresAt }: { expiresAt: string }) {
  const days = daysUntil(expiresAt)
  const key = classify(days)
  const meta = URGENCY_META[key]
  const text = days < 0 ? `${Math.abs(days)}d ago` : days === 0 ? "Today" : `${days}d`
  return (
    <span style={{
      fontSize: "12px", padding: "3px 9px", borderRadius: "20px",
      background: meta.bg, color: meta.color, fontWeight: 600,
      whiteSpace: "nowrap",
    }}>
      {text}
    </span>
  )
}

function CategoryBadge({ category }: { category: Category }) {
  const meta = CATEGORY_META[category]
  return (
    <span style={{
      fontSize: "11px", padding: "2px 8px", borderRadius: "5px",
      background: meta.bg, color: meta.color, fontWeight: 500,
      letterSpacing: "0.03em",
    }}>
      {meta.label.toUpperCase()}
    </span>
  )
}

function StatTile({
  label, count, urgency, active, onClick,
}: {
  label: string; count: number; urgency: UrgencyKey; active: boolean; onClick: () => void
}) {
  const meta = URGENCY_META[urgency]
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, minWidth: 0, textAlign: "left", cursor: "pointer",
        border: active ? `1px solid ${meta.color}` : "0.5px solid var(--color-border-tertiary)",
        borderRadius: "10px",
        padding: "16px 20px",
        background: active ? meta.bg : "var(--color-background-secondary)",
        transition: "border-color 0.15s, background 0.15s",
      }}
    >
      <div style={{ fontSize: "28px", fontWeight: 600, color: meta.color, lineHeight: 1 }}>{count}</div>
      <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "6px" }}>{label}</div>
    </button>
  )
}

const CATEGORIES: Array<{ key: Category | "all"; label: string }> = [
  { key: "all",        label: "All"         },
  { key: "ssl",        label: "SSL"         },
  { key: "domain",     label: "Domains"     },
  { key: "warranty",   label: "Warranties"  },
  { key: "credential", label: "Credentials" },
  { key: "license",    label: "Licenses"    },
]

export default function ExpirationsPage() {
  const router = useRouter()
  const [items, setItems] = useState<ExpirationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [categoryFilter, setCategoryFilter] = useState<Category | "all">("all")
  const [clientFilter, setClientFilter] = useState<string>("all")
  const [urgencyFilter, setUrgencyFilter] = useState<UrgencyKey | "all">("all")

  useEffect(() => {
    setLoading(true)
    fetch("/api/expirations")
      .then(r => r.json())
      .then(setItems)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const clients = useMemo(() => {
    const map = new Map<string, string>()
    items.forEach(i => map.set(i.clientId, i.clientName))
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [items])

  const filtered = useMemo(() => {
    return items.filter(item => {
      if (categoryFilter !== "all" && item.category !== categoryFilter) return false
      if (clientFilter !== "all" && item.clientId !== clientFilter) return false
      if (urgencyFilter !== "all") {
        const days = daysUntil(item.expiresAt)
        if (classify(days) !== urgencyFilter) return false
      }
      return true
    })
  }, [items, categoryFilter, clientFilter, urgencyFilter])

  const counts = useMemo(() => {
    const base = clientFilter === "all"
      ? items
      : items.filter(i => i.clientId === clientFilter)
    const filtered = categoryFilter === "all"
      ? base
      : base.filter(i => i.category === categoryFilter)

    return {
      expired:  filtered.filter(i => classify(daysUntil(i.expiresAt)) === "expired").length,
      critical: filtered.filter(i => classify(daysUntil(i.expiresAt)) === "critical").length,
      warning:  filtered.filter(i => classify(daysUntil(i.expiresAt)) === "warning").length,
      upcoming: filtered.filter(i => classify(daysUntil(i.expiresAt)) === "upcoming").length,
    }
  }, [items, clientFilter, categoryFilter])

  const selectStyle = {
    fontSize: "13px", padding: "7px 12px", borderRadius: "8px",
    border: "0.5px solid var(--color-border-secondary)",
    background: "var(--color-background-primary)",
    color: "var(--color-text-primary)", cursor: "pointer",
  }

  return (
    <AppShell>
      <div style={{ padding: "32px", maxWidth: "1100px" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }}>
          <div>
            <h1 style={{ fontSize: "22px", fontWeight: 500, marginBottom: "4px" }}>Expirations</h1>
            <p style={{ fontSize: "14px", color: "var(--color-text-secondary)" }}>
              {loading ? "Loading..." : `${items.length} item${items.length !== 1 ? "s" : ""} with expiry data across all clients`}
            </p>
          </div>
          <select
            value={clientFilter}
            onChange={e => setClientFilter(e.target.value)}
            style={selectStyle}
          >
            <option value="all">All clients</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Stat tiles */}
        <div style={{ display: "flex", gap: "12px", marginBottom: "28px" }}>
          {(["expired", "critical", "warning", "upcoming"] as UrgencyKey[]).map(key => (
            <StatTile
              key={key}
              label={URGENCY_META[key].label}
              count={counts[key]}
              urgency={key}
              active={urgencyFilter === key}
              onClick={() => setUrgencyFilter(urgencyFilter === key ? "all" : key)}
            />
          ))}
        </div>

        {/* Category tabs */}
        <div style={{ display: "flex", gap: "4px", borderBottom: "0.5px solid var(--color-border-tertiary)", marginBottom: "20px" }}>
          {CATEGORIES.map(({ key, label }) => {
            const active = categoryFilter === key
            return (
              <button
                key={key}
                onClick={() => setCategoryFilter(key as Category | "all")}
                style={{
                  fontSize: "13px", padding: "6px 14px",
                  background: "none", border: "none", cursor: "pointer",
                  color: active ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                  fontWeight: active ? 500 : 400,
                  borderBottom: active ? "2px solid var(--color-text-primary)" : "2px solid transparent",
                  marginBottom: "-0.5px",
                }}
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* Table */}
        {loading ? (
          <div style={{ padding: "48px", textAlign: "center", fontSize: "14px", color: "var(--color-text-secondary)" }}>
            Loading...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "48px", textAlign: "center", fontSize: "14px", color: "var(--color-text-secondary)" }}>
            No items match the current filters.
          </div>
        ) : (
          <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "10px", overflow: "hidden" }}>
            {/* Column headers */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "90px 1fr 180px 140px 120px",
              padding: "9px 16px",
              background: "var(--color-background-secondary)",
              borderBottom: "0.5px solid var(--color-border-tertiary)",
            }}>
              {["Type", "Name", "Client", "Expires", "Status"].map(h => (
                <div key={h} style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-secondary)" }}>{h}</div>
              ))}
            </div>

            {filtered.map((item, i) => (
              <div
                key={item.id}
                onClick={() => router.push(item.linkPath)}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--color-background-secondary)")}
                onMouseLeave={e => (e.currentTarget.style.background = "var(--color-background-primary)")}
                style={{
                  display: "grid",
                  gridTemplateColumns: "90px 1fr 180px 140px 120px",
                  padding: "11px 16px",
                  alignItems: "center",
                  borderBottom: i < filtered.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none",
                  background: "var(--color-background-primary)",
                  cursor: "pointer",
                  transition: "background 0.1s",
                }}
              >
                <div><CategoryBadge category={item.category} /></div>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-primary)" }}>{item.label}</div>
                  {item.sublabel && (
                    <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "2px" }}>{item.sublabel}</div>
                  )}
                </div>
                <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>{item.clientName}</div>
                <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
                  {new Date(item.expiresAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                </div>
                <div><UrgencyBadge expiresAt={item.expiresAt} /></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
