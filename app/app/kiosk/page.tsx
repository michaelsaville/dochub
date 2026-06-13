"use client"

import { useEffect, useState, useCallback } from "react"

// Standalone wallboard for an unattended iPad kiosk. NOT wrapped in AppShell,
// so it never triggers the SSO login redirect — access is gated by the
// ?token=<KIOSK_TOKEN> in the URL, validated server-side by the kiosk API.

const REFRESH_MS = 60_000

type Alarm = {
  id: string; severity: "INFO" | "WARNING" | "CRITICAL"
  type: string; message: string; clientName: string; createdAt: string
}
type Expiration = { id: string; category: string; label: string; clientName: string; expiresAt: string }
type Stats = { assets: number; alarms: number; licensesExpiring: number; expiringSoon: number }
type Feed = { clientName: string | null; stats: Stats; alarms: Alarm[]; expirations: Expiration[]; generatedAt: string }

function daysUntil(iso: string) {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)
}
function expiryColor(iso: string) {
  const d = daysUntil(iso)
  if (d <= 7) return "var(--danger)"
  if (d <= 30) return "var(--warn)"
  return "var(--accent2)"
}
function alarmColor(sev: string) {
  if (sev === "CRITICAL") return "var(--danger)"
  if (sev === "WARNING") return "var(--warn)"
  return "var(--accent)"
}

export default function KioskPage() {
  const [token, setToken] = useState<string | null>(null)
  const [clientId, setClientId] = useState<string | null>(null)
  const [feed, setFeed] = useState<Feed | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [clock, setClock] = useState("")

  // Read the token + optional clientId from the URL once on mount (avoids the
  // useSearchParams Suspense boundary; a kiosk URL is static anyway).
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    setToken(p.get("token"))
    setClientId(p.get("clientId"))
  }, [])

  const load = useCallback(async () => {
    if (!token) return
    try {
      const q = new URLSearchParams({ token })
      if (clientId) q.set("clientId", clientId)
      const r = await fetch(`/api/kiosk/dashboard?${q.toString()}`, { cache: "no-store" })
      if (r.status === 401) { setError("Invalid or missing kiosk token."); return }
      if (!r.ok) { setError("Feed unavailable — retrying…"); return }
      setFeed(await r.json())
      setError(null)
    } catch {
      setError("Network error — retrying…")
    }
  }, [token, clientId])

  useEffect(() => {
    if (!token) return
    load()
    const id = setInterval(load, REFRESH_MS)
    return () => clearInterval(id)
  }, [token, load])

  useEffect(() => {
    const tick = () =>
      setClock(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))
    tick()
    const id = setInterval(tick, 15_000)
    return () => clearInterval(id)
  }, [])

  if (token === null && typeof window !== "undefined" && !window.location.search.includes("token=")) {
    return (
      <Center>
        <p style={{ color: "var(--muted)", fontSize: 20 }}>
          Append <code style={{ color: "var(--text)" }}>?token=…</code> to the URL to load the kiosk.
        </p>
      </Center>
    )
  }

  const stat = (label: string, value: number | undefined, color: string) => (
    <div style={{
      flex: 1, background: "var(--card)", border: "1px solid var(--border)",
      borderRadius: 16, padding: "28px 24px", minWidth: 180,
    }}>
      <div style={{ fontSize: 64, fontWeight: 600, lineHeight: 1, color, fontVariantNumeric: "tabular-nums" }}>
        {value ?? "—"}
      </div>
      <div style={{ marginTop: 10, fontSize: 18, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1 }}>
        {label}
      </div>
    </div>
  )

  return (
    <div style={{
      minHeight: "100dvh", background: "var(--bg)", color: "var(--text)",
      padding: "max(28px, env(safe-area-inset-top)) 32px 32px", fontFamily: "var(--sans)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 28 }}>
        <h1 style={{ fontSize: 34, fontWeight: 600, margin: 0 }}>
          {feed?.clientName
            ? <>{feed.clientName} <span style={{ color: "var(--accent)" }}>Wallboard</span></>
            : <>DocHub <span style={{ color: "var(--accent)" }}>Wallboard</span></>}
        </h1>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 40, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{clock}</div>
          {error
            ? <div style={{ fontSize: 14, color: "var(--warn)" }}>{error}</div>
            : feed && <div style={{ fontSize: 13, color: "var(--muted)" }}>
                updated {new Date(feed.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>}
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 18, marginBottom: 28, flexWrap: "wrap" }}>
        {stat("Active Assets", feed?.stats.assets, "var(--text)")}
        {stat("Active Alarms", feed?.stats.alarms, feed?.stats.alarms ? "var(--danger)" : "var(--accent2)")}
        {stat("Licenses ≤30d", feed?.stats.licensesExpiring, feed?.stats.licensesExpiring ? "var(--warn)" : "var(--accent2)")}
        {stat("Expiring ≤60d", feed?.stats.expiringSoon, feed?.stats.expiringSoon ? "var(--warn)" : "var(--accent2)")}
      </div>

      {/* Two columns: alarms + expirations */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <Panel title="Active Alarms" count={feed?.alarms.length}>
          {feed && feed.alarms.length === 0 && <Empty>No active alarms 🎉</Empty>}
          {feed?.alarms.map(a => (
            <Row key={a.id} accent={alarmColor(a.severity)}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 19, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {a.message}
                </div>
                <div style={{ fontSize: 14, color: "var(--muted)" }}>{a.clientName} · {a.type}</div>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: alarmColor(a.severity) }}>{a.severity}</span>
            </Row>
          ))}
        </Panel>

        <Panel title="Upcoming Expirations" count={feed?.expirations.length}>
          {feed && feed.expirations.length === 0 && <Empty>Nothing expiring in 60 days</Empty>}
          {feed?.expirations.map(e => {
            const d = daysUntil(e.expiresAt)
            return (
              <Row key={e.id} accent={expiryColor(e.expiresAt)}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 19, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {e.label}
                  </div>
                  <div style={{ fontSize: 14, color: "var(--muted)" }}>{e.clientName} · {e.category}</div>
                </div>
                <span style={{ fontSize: 17, fontWeight: 600, color: expiryColor(e.expiresAt), fontVariantNumeric: "tabular-nums" }}>
                  {d}d
                </span>
              </Row>
            )
          })}
        </Panel>
      </div>
    </div>
  )
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      {children}
    </div>
  )
}
function Panel({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
        <h2 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>{title}</h2>
        {count !== undefined && <span style={{ fontSize: 16, color: "var(--muted)" }}>{count}</span>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
    </div>
  )
}
function Row({ accent, children }: { accent: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 14, padding: "12px 14px",
      background: "var(--card)", borderLeft: `4px solid ${accent}`, borderRadius: 10,
    }}>
      {children}
    </div>
  )
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "18px 4px", color: "var(--muted)", fontSize: 17 }}>{children}</div>
}
