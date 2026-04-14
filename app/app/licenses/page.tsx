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

export default function LicensesPage() {
  const [licenses, setLicenses] = useState<License[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    fetch("/api/licenses")
      .then(r => r.json())
      .then(setLicenses)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

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
            {["License", "Client", "Vendor", "Seats", "Cost/yr", "Expiry"].map(h => (
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
                <div style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-text-primary)", alignSelf: "center" }}>{l.name}</div>
                <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", alignSelf: "center" }}>{l.client.name}</div>
                <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", alignSelf: "center" }}>
                  {l.vendorRef?.name ?? l.vendor ?? "—"}
                </div>
                <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", alignSelf: "center" }}>
                  {l.seats ? `${l.assignedSeats ?? 0}/${l.seats}` : "—"}
                </div>
                <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", alignSelf: "center" }}>
                  {l.cost ? `$${l.cost.toFixed(0)}` : "—"}
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
