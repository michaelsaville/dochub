"use client"

import AppShell from "@/components/AppShell"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"

type License = {
  id: string
  name: string
  vendor: string | null
  vendorRef: { id: string; name: string } | null
  seats: number | null
  assignedSeats: number | null
  pax8Id: string | null
  dataSource: string | null
  _count?: { seatAssignments: number }
  expiryDate: string | null
  renewalDate: string | null
  cost: number | null
  isActive: boolean
  client: { id: string; name: string }
  person: { id: string; name: string } | null
}

function expiryBadge(date: string | null) {
  if (!date) return null
  const days = Math.floor((new Date(date).getTime() - Date.now()) / 86400000)
  if (days < 0) return { label: "Expired", color: "var(--color-text-danger)", bg: "var(--color-background-danger)" }
  if (days <= 7) return { label: `${days}d`, color: "var(--color-text-danger)", bg: "var(--color-background-danger)" }
  if (days <= 30) return { label: `${days}d`, color: "var(--color-text-warning)", bg: "var(--color-background-warning)" }
  return { label: `${days}d`, color: "var(--color-text-success)", bg: "var(--color-background-success)" }
}

const SOURCE_LABELS: Record<string, string> = {
  MANUAL: "Manual", SYNCRO: "Syncro", UNIFI: "Unifi",
  ITFLOW: "ITFlow", PAX8: "Pax8", PULSEWAY: "Pulseway",
  MERAKI: "Meraki", HPINSTANTON: "HP Instant On", SONICWALL: "SonicWall",
  SCOUT: "Scout",
}

const SOURCE_DEFAULTS: Record<string, string> = {
  SYNCRO: "#3b82f6", UNIFI: "#8b5cf6", ITFLOW: "#f97316", PAX8: "#10b981", PULSEWAY: "#ec4899",
  MERAKI: "#00bceb", HPINSTANTON: "#0096d6", SONICWALL: "#e8521a", SCOUT: "#14b8a6",
}

const SOURCE_DOMAINS: Record<string, string> = {
  SYNCRO:      "syncromsp.com",
  UNIFI:       "ui.com",
  ITFLOW:      "itflow.org",
  PAX8:        "pax8.com",
  PULSEWAY:    "pulseway.com",
  MERAKI:      "meraki.cisco.com",
  HPINSTANTON: "arubainstanton.com",
  SONICWALL:   "sonicwall.com",
}

function SourceStamp({ sourceKey, color, label }: { sourceKey: string; color: string; label: string }) {
  const [failed, setFailed] = useState(false)
  const domain = SOURCE_DOMAINS[sourceKey]
  return (
    <span
      title={`Source: ${label}`}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: "20px", height: "20px", borderRadius: "4px",
        border: `1px solid ${color}55`,
        background: "rgba(255,255,255,0.07)",
        overflow: "hidden", flexShrink: 0, cursor: "default",
        boxShadow: `0 0 0 1px ${color}22`,
      }}
    >
      {domain && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
          width={14} height={14}
          alt={label}
          style={{ display: "block", imageRendering: "auto" }}
          onError={() => setFailed(true)}
        />
      ) : (
        <span style={{ fontSize: "9px", fontWeight: 700, color, lineHeight: 1 }}>{label[0]}</span>
      )}
    </span>
  )
}

function sourceTag(
  dataSource?: string | null,
  fallbackPax8Id?: string | null,
  colors?: Record<string, string>,
) {
  const src = dataSource || (fallbackPax8Id ? "PAX8" : "MANUAL")
  if (src === "MANUAL") return null
  const color = colors?.[src] ?? SOURCE_DEFAULTS[src] ?? "#64748b"
  const label = SOURCE_LABELS[src] ?? src
  return <SourceStamp sourceKey={src} color={color} label={label} />
}

export default function LicensesPage() {
  const [licenses, setLicenses] = useState<License[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [sourceColors, setSourceColors] = useState<Record<string, string>>(SOURCE_DEFAULTS)
  const router = useRouter()

  useEffect(() => {
    fetch("/api/licenses")
      .then(r => r.json())
      .then(setLicenses)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetch("/api/settings/source-colors")
      .then(r => r.json())
      .then(d => setSourceColors(d))
      .catch(() => {})
  }, [])

  const boundSourceTag = (ds?: string | null, pi?: string | null) => sourceTag(ds, pi, sourceColors)

  const filtered = licenses.filter(l =>
    l.name.toLowerCase().includes(search.toLowerCase()) ||
    l.client.name.toLowerCase().includes(search.toLowerCase()) ||
    (l.vendorRef?.name ?? l.vendor ?? "").toLowerCase().includes(search.toLowerCase())
  )

  const soonest = (l: License) => {
    const dates = [l.expiryDate, l.renewalDate].filter(Boolean) as string[]
    if (!dates.length) return null
    return dates.sort()[0]
  }

  const inputStyle = {
    width: "100%", padding: "8px 12px", fontSize: "14px",
    border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px",
    background: "var(--color-background-primary)", color: "var(--color-text-primary)",
    boxSizing: "border-box" as const,
  }

  return (
    <AppShell>
      <div style={{ padding: "32px" }}>
        <div style={{ marginBottom: "24px" }}>
          <h1 style={{ fontSize: "22px", fontWeight: 500, marginBottom: "4px" }}>Licenses</h1>
          <p style={{ fontSize: "14px", color: "var(--color-text-secondary)" }}>
            {loading ? "Loading..." : `${licenses.length} active licenses across all clients`}
          </p>
        </div>

        <div style={{ marginBottom: "16px", maxWidth: "400px" }}>
          <input type="text" placeholder="Search licenses, clients, vendors..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            style={inputStyle} />
        </div>

        <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "10px", overflow: "hidden" }}>
          <div style={{
            display: "grid", gridTemplateColumns: "2fr 1.5fr 1.5fr 100px 100px 100px",
            padding: "10px 16px", borderBottom: "0.5px solid var(--color-border-tertiary)",
            background: "var(--color-background-secondary)",
          }}>
            {["License", "Client", "Vendor", "Seats", "$/mo", "Expiry"].map(h => (
              <div key={h} style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-secondary)" }}>{h}</div>
            ))}
          </div>

          {loading ? (
            <div style={{ padding: "48px 16px", textAlign: "center", color: "var(--color-text-secondary)", fontSize: "14px" }}>
              Loading...
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: "48px 16px", textAlign: "center", color: "var(--color-text-secondary)", fontSize: "14px" }}>
              {search ? "No licenses match your search." : "No licenses yet."}
            </div>
          ) : filtered.map((l, i) => {
            const badge = expiryBadge(soonest(l))
            return (
              <div
                key={l.id}
                onClick={() => router.push(`/clients/${l.client.id}?tab=Licenses`)}
                style={{
                  display: "grid", gridTemplateColumns: "2fr 1.5fr 1.5fr 100px 100px 100px",
                  padding: "12px 16px", cursor: "pointer",
                  borderBottom: i < filtered.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none",
                  background: "var(--color-background-primary)",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-background-secondary)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "var(--color-background-primary)")}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px", alignSelf: "center" }}>
                  <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-text-primary)" }}>{l.name}</span>
                  {boundSourceTag(l.dataSource, l.pax8Id)}
                </div>
                <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", alignSelf: "center" }}>{l.client.name}</div>
                <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", alignSelf: "center" }}>
                  {l.vendorRef?.name ?? l.vendor ?? "—"}
                </div>
                <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", alignSelf: "center" }}>
                  {l.seats ? `${l._count?.seatAssignments ?? l.assignedSeats ?? 0}/${l.seats}` : "—"}
                </div>
                <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", alignSelf: "center" }}>
                  {l.cost != null ? `$${l.cost.toFixed(2)}` : "—"}
                </div>
                <div style={{ alignSelf: "center" }}>
                  {badge ? (
                    <span style={{
                      fontSize: "12px", padding: "2px 8px", borderRadius: "20px",
                      background: badge.bg, color: badge.color,
                    }}>{badge.label}</span>
                  ) : "—"}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </AppShell>
  )
}
