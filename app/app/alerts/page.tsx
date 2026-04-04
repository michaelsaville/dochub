"use client"

import AppShell from "@/components/AppShell"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"

type AlertItem = {
  id: string
  domain?: string
  label?: string
  name?: string
  vendor?: string | null
  username?: string | null
  expiresAt?: string | null
  sslExpiresAt?: string | null
  sslIssuer?: string | null
  expiryDate?: string | null
  renewalDate?: string | null
  vendorRef?: { id: string; name: string } | null
  client: { id: string; name: string }
}

type AlertsData = {
  domains: AlertItem[]
  sslCerts: AlertItem[]
  licenses: AlertItem[]
  credentials: AlertItem[]
}

function daysUntil(date: string | null | undefined): number | null {
  if (!date) return null
  return Math.floor((new Date(date).getTime() - Date.now()) / 86400000)
}

function ExpiryBadge({ date }: { date: string | null | undefined }) {
  const days = daysUntil(date)
  if (days === null) return <span style={{ color: "var(--color-text-muted)", fontSize: "13px" }}>—</span>
  const color = days < 0 ? "var(--color-text-danger)" : days <= 7 ? "var(--color-text-danger)" : days <= 30 ? "var(--color-text-warning)" : "var(--color-text-success)"
  const bg = days < 0 ? "var(--color-background-danger)" : days <= 7 ? "var(--color-background-danger)" : days <= 30 ? "var(--color-background-warning)" : "var(--color-background-success)"
  const label = days < 0 ? "Expired" : `${days}d`
  return (
    <span style={{ fontSize: "12px", padding: "2px 8px", borderRadius: "20px", background: bg, color, fontWeight: 500 }}>
      {label}
    </span>
  )
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div style={{ marginBottom: "24px", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "10px", overflow: "hidden" }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "var(--color-background-secondary)", cursor: "pointer", userSelect: "none" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "15px", fontWeight: 500 }}>{title}</span>
          <span style={{
            fontSize: "12px", padding: "2px 8px", borderRadius: "20px",
            background: count > 0 ? "var(--color-background-danger)" : "var(--color-background-hover)",
            color: count > 0 ? "var(--color-text-danger)" : "var(--color-text-muted)",
          }}>{count}</span>
        </div>
        <span style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>{open ? "▲" : "▼"}</span>
      </div>
      {open && children}
    </div>
  )
}

export default function AlertsPage() {
  const [data, setData] = useState<AlertsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(90)
  const router = useRouter()

  useEffect(() => {
    setLoading(true)
    fetch(`/api/alerts?days=${days}`)
      .then(r => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [days])

  const colStyle = { fontSize: "12px", fontWeight: 500, color: "var(--color-text-secondary)" } as const
  const rowBase = { padding: "10px 16px", borderBottom: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-primary)", cursor: "pointer" } as const
  const cellStyle = { fontSize: "13px", color: "var(--color-text-secondary)", alignSelf: "center" } as const

  return (
    <AppShell>
      <div style={{ padding: "32px", maxWidth: "960px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }}>
          <div>
            <h1 style={{ fontSize: "22px", fontWeight: 500, marginBottom: "4px" }}>Alerts</h1>
            <p style={{ fontSize: "14px", color: "var(--color-text-secondary)" }}>Expiring items across all clients</p>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            {[30, 60, 90].map(d => (
              <button key={d} onClick={() => setDays(d)} style={{
                fontSize: "13px", padding: "6px 14px", borderRadius: "8px",
                border: "0.5px solid var(--color-border-secondary)",
                background: days === d ? "var(--color-text-primary)" : "var(--color-background-primary)",
                color: days === d ? "var(--color-background-primary)" : "var(--color-text-secondary)",
                cursor: "pointer",
              }}>
                {d}d
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>Loading...</div>
        ) : !data ? (
          <div style={{ color: "var(--color-text-danger)", fontSize: "14px" }}>Failed to load alerts.</div>
        ) : (
          <>
            {/* Domains */}
            <Section title="Domain expiry" count={data.domains.length}>
              {data.domains.length === 0 ? (
                <div style={{ padding: "20px 16px", color: "var(--color-text-secondary)", fontSize: "13px" }}>None expiring within {days} days.</div>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 100px 120px", padding: "8px 16px", background: "var(--color-background-secondary)", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                    {["Domain", "Client", "Expires", ""].map(h => <div key={h} style={colStyle}>{h}</div>)}
                  </div>
                  {data.domains.map(d => (
                    <div key={d.id} style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 100px 120px", ...rowBase }}
                      onClick={() => router.push(`/clients/${d.client.id}?tab=Domains`)}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--color-background-secondary)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "var(--color-background-primary)")}>
                      <div style={{ alignSelf: "center" }}>
                        <div style={{ fontSize: "14px", fontWeight: 500 }}>{d.domain}</div>
                        {d.label && <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{d.label}</div>}
                      </div>
                      <div style={cellStyle}>{d.client.name}</div>
                      <div style={{ ...cellStyle, fontSize: "12px" }}>{d.expiresAt ? new Date(d.expiresAt).toLocaleDateString() : "—"}</div>
                      <div style={{ alignSelf: "center" }}><ExpiryBadge date={d.expiresAt} /></div>
                    </div>
                  ))}
                </>
              )}
            </Section>

            {/* SSL */}
            <Section title="SSL certificate expiry" count={data.sslCerts.length}>
              {data.sslCerts.length === 0 ? (
                <div style={{ padding: "20px 16px", color: "var(--color-text-secondary)", fontSize: "13px" }}>None expiring within {days} days.</div>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1fr 100px 120px", padding: "8px 16px", background: "var(--color-background-secondary)", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                    {["Domain", "Client", "Issuer", "Expires", ""].map(h => <div key={h} style={colStyle}>{h}</div>)}
                  </div>
                  {data.sslCerts.map(d => (
                    <div key={d.id} style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1fr 100px 120px", ...rowBase }}
                      onClick={() => router.push(`/clients/${d.client.id}?tab=Domains`)}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--color-background-secondary)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "var(--color-background-primary)")}>
                      <div style={{ fontSize: "14px", fontWeight: 500, alignSelf: "center" }}>{d.domain}</div>
                      <div style={cellStyle}>{d.client.name}</div>
                      <div style={cellStyle}>{d.sslIssuer ?? "—"}</div>
                      <div style={{ ...cellStyle, fontSize: "12px" }}>{d.sslExpiresAt ? new Date(d.sslExpiresAt).toLocaleDateString() : "—"}</div>
                      <div style={{ alignSelf: "center" }}><ExpiryBadge date={d.sslExpiresAt} /></div>
                    </div>
                  ))}
                </>
              )}
            </Section>

            {/* Licenses */}
            <Section title="License expiry" count={data.licenses.length}>
              {data.licenses.length === 0 ? (
                <div style={{ padding: "20px 16px", color: "var(--color-text-secondary)", fontSize: "13px" }}>None expiring within {days} days.</div>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1.5fr 120px 120px", padding: "8px 16px", background: "var(--color-background-secondary)", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                    {["License", "Client", "Vendor", "Expiry", "Renewal"].map(h => <div key={h} style={colStyle}>{h}</div>)}
                  </div>
                  {data.licenses.map(l => {
                    const soonest = [l.expiryDate, l.renewalDate].filter(Boolean).sort()[0]
                    return (
                      <div key={l.id} style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1.5fr 120px 120px", ...rowBase }}
                        onClick={() => router.push(`/clients/${l.client.id}?tab=Licenses`)}
                        onMouseEnter={e => (e.currentTarget.style.background = "var(--color-background-secondary)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "var(--color-background-primary)")}>
                        <div style={{ alignSelf: "center" }}>
                          <div style={{ fontSize: "14px", fontWeight: 500 }}>{l.name}</div>
                        </div>
                        <div style={cellStyle}>{l.client.name}</div>
                        <div style={cellStyle}>{l.vendorRef?.name ?? l.vendor ?? "—"}</div>
                        <div style={{ alignSelf: "center" }}><ExpiryBadge date={l.expiryDate} /></div>
                        <div style={{ alignSelf: "center" }}><ExpiryBadge date={l.renewalDate} /></div>
                      </div>
                    )
                  })}
                </>
              )}
            </Section>

            {/* Credentials */}
            <Section title="Credential expiry" count={data.credentials.length}>
              {data.credentials.length === 0 ? (
                <div style={{ padding: "20px 16px", color: "var(--color-text-secondary)", fontSize: "13px" }}>None expiring within {days} days.</div>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1.5fr 120px", padding: "8px 16px", background: "var(--color-background-secondary)", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                    {["Credential", "Client", "Username", "Expires"].map(h => <div key={h} style={colStyle}>{h}</div>)}
                  </div>
                  {data.credentials.map(c => (
                    <div key={c.id} style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1.5fr 120px", ...rowBase }}
                      onClick={() => router.push(`/clients/${c.client.id}?tab=Credentials`)}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--color-background-secondary)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "var(--color-background-primary)")}>
                      <div style={{ fontSize: "14px", fontWeight: 500, alignSelf: "center" }}>{c.label}</div>
                      <div style={cellStyle}>{c.client.name}</div>
                      <div style={cellStyle}>{c.username ?? "—"}</div>
                      <div style={{ alignSelf: "center" }}><ExpiryBadge date={c.expiryDate} /></div>
                    </div>
                  ))}
                </>
              )}
            </Section>
          </>
        )}
      </div>
    </AppShell>
  )
}
