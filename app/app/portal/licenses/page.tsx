"use client"

import { useState, useEffect } from "react"
import { usePortalUser } from "../layout"

type License = { id: string; name: string; vendor: string | null; seats: number | null; assignedSeats: number | null; expiryDate: string | null; renewalDate: string | null }

export default function PortalLicenses() {
  const user = usePortalUser()
  const [licenses, setLicenses] = useState<License[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    fetch("/api/portal/licenses").then(r => r.ok ? r.json() : []).then(setLicenses).finally(() => setLoading(false))
  }, [user])

  if (!user?.permissions.licenses) return <div style={{ color: "var(--color-text-secondary)" }}>Access not enabled for this section.</div>

  const now = new Date()
  const soon = new Date(now.getTime() + 30 * 86400 * 1000)

  return (
    <div>
      <h1 style={{ fontSize: "20px", fontWeight: 500, marginBottom: "4px" }}>Licenses</h1>
      <p style={{ fontSize: "14px", color: "var(--color-text-secondary)", marginBottom: "24px" }}>Your software licenses and subscriptions.</p>
      {loading && <div style={{ color: "var(--color-text-secondary)" }}>Loading...</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {licenses.map(lic => {
          const expiry = lic.expiryDate ? new Date(lic.expiryDate) : null
          const expired = expiry && expiry < now
          const expiringSoon = expiry && !expired && expiry < soon
          return (
            <div key={lic.id} style={{ display: "flex", alignItems: "center", gap: "16px", padding: "14px 18px", borderRadius: "10px", background: "var(--color-background-secondary)", border: `0.5px solid ${expired ? "rgba(239,68,68,0.3)" : expiringSoon ? "rgba(245,158,11,0.3)" : "var(--color-border-tertiary)"}` }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-text-primary)" }}>{lic.name}</div>
                {lic.vendor && <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "2px" }}>{lic.vendor}</div>}
              </div>
              {lic.seats != null && (
                <div style={{ textAlign: "right", fontSize: "13px", color: "var(--color-text-secondary)", flexShrink: 0 }}>
                  {lic.assignedSeats ?? 0} / {lic.seats} seats
                </div>
              )}
              {expiry && (
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: "12px", color: expired ? "var(--color-text-danger)" : expiringSoon ? "#f59e0b" : "var(--color-text-muted)" }}>
                    {expired ? "Expired" : `Expires ${expiry.toLocaleDateString()}`}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {!loading && licenses.length === 0 && <div style={{ color: "var(--color-text-secondary)" }}>No licenses found.</div>}
    </div>
  )
}
