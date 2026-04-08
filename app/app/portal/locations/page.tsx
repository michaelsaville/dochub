"use client"

import { useState, useEffect } from "react"
import { usePortalUser } from "../layout"

type Location = { id: string; name: string; address: string | null; city: string | null; state: string | null; zip: string | null; ispName: string | null; wanIp: string | null; notes: string | null }

export default function PortalLocations() {
  const user = usePortalUser()
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    fetch("/api/portal/locations").then(r => r.ok ? r.json() : []).then(setLocations).finally(() => setLoading(false))
  }, [user])

  if (!user?.permissions.locations) return <div style={{ color: "var(--color-text-secondary)" }}>Access not enabled for this section.</div>

  return (
    <div>
      <h1 style={{ fontSize: "20px", fontWeight: 500, marginBottom: "4px" }}>Locations</h1>
      <p style={{ fontSize: "14px", color: "var(--color-text-secondary)", marginBottom: "24px" }}>Your office and site information.</p>
      {loading && <div style={{ color: "var(--color-text-secondary)" }}>Loading...</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {locations.map(loc => (
          <div key={loc.id} style={{ padding: "16px 20px", borderRadius: "10px", background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)" }}>
            <div style={{ fontSize: "15px", fontWeight: 500, color: "var(--color-text-primary)", marginBottom: "6px" }}>📍 {loc.name}</div>
            {(loc.address || loc.city) && (
              <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>
                {[loc.address, loc.city, loc.state, loc.zip].filter(Boolean).join(", ")}
              </div>
            )}
            {loc.ispName && <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "4px" }}>ISP: {loc.ispName}</div>}
            {loc.notes && <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginTop: "8px", paddingTop: "8px", borderTop: "0.5px solid var(--color-border-tertiary)" }}>{loc.notes}</div>}
          </div>
        ))}
      </div>
      {!loading && locations.length === 0 && <div style={{ color: "var(--color-text-secondary)" }}>No locations found.</div>}
    </div>
  )
}
