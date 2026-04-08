"use client"

import { useState, useEffect } from "react"
import { usePortalUser } from "../layout"

type Domain = { id: string; domain: string; registrar: string | null; autoRenew: boolean | null; expiresAt: string | null; sslExpiresAt: string | null; sslIssuer: string | null }

export default function PortalDomains() {
  const user = usePortalUser()
  const [domains, setDomains] = useState<Domain[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    fetch("/api/portal/domains").then(r => r.ok ? r.json() : []).then(setDomains).finally(() => setLoading(false))
  }, [user])

  if (!user?.permissions.domains) return <div style={{ color: "var(--color-text-secondary)" }}>Access not enabled for this section.</div>

  const now = new Date()
  const soon = new Date(now.getTime() + 30 * 86400 * 1000)

  function statusColor(date: string | null) {
    if (!date) return "var(--color-text-muted)"
    const d = new Date(date)
    if (d < now) return "var(--color-text-danger)"
    if (d < soon) return "#f59e0b"
    return "#22c55e"
  }

  return (
    <div>
      <h1 style={{ fontSize: "20px", fontWeight: 500, marginBottom: "4px" }}>Domains</h1>
      <p style={{ fontSize: "14px", color: "var(--color-text-secondary)", marginBottom: "24px" }}>Domain registration and SSL certificate status.</p>
      {loading && <div style={{ color: "var(--color-text-secondary)" }}>Loading...</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {domains.map(d => (
          <div key={d.id} style={{ padding: "14px 18px", borderRadius: "10px", background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-text-primary)", fontFamily: "var(--mono)" }}>{d.domain}</div>
                {d.registrar && <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "2px" }}>Registrar: {d.registrar}</div>}
              </div>
              <div style={{ display: "flex", gap: "20px", flexShrink: 0 }}>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginBottom: "2px" }}>DOMAIN</div>
                  <div style={{ fontSize: "13px", color: statusColor(d.expiresAt) }}>
                    {d.expiresAt ? new Date(d.expiresAt).toLocaleDateString() : "—"}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginBottom: "2px" }}>SSL</div>
                  <div style={{ fontSize: "13px", color: statusColor(d.sslExpiresAt) }}>
                    {d.sslExpiresAt ? new Date(d.sslExpiresAt).toLocaleDateString() : "—"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      {!loading && domains.length === 0 && <div style={{ color: "var(--color-text-secondary)" }}>No domains found.</div>}
    </div>
  )
}
