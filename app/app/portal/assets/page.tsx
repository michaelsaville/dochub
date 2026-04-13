"use client"

import { useState, useEffect } from "react"
import { usePortalUser } from "@/lib/portal-context"

type Asset = {
  id: string; name: string; friendlyName: string | null; category: string
  status: string; make: string | null; model: string | null; serial: string | null
  assetTag: string | null; ipAddress: string | null; room: string | null
  purchaseDate: string | null; warrantyExpiry: string | null
  location: { name: string; city: string | null } | null
  assetType: { name: string } | null
}

export default function PortalAssets() {
  const user = usePortalUser()
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!user) return
    fetch("/api/portal/assets")
      .then(r => r.ok ? r.json() : r.json().then((d: any) => Promise.reject(d.error)))
      .then(setAssets)
      .catch(setError)
      .finally(() => setLoading(false))
  }, [user])

  const grouped = assets.reduce<Record<string, Asset[]>>((acc, a) => {
    const key = a.assetType?.name || a.category
    acc[key] = [...(acc[key] || []), a]
    return acc
  }, {})

  if (!user?.permissions.assets) return <div style={{ color: "var(--color-text-secondary)" }}>Access not enabled for this section.</div>

  return (
    <div>
      <h1 style={{ fontSize: "20px", fontWeight: 500, marginBottom: "4px" }}>Assets</h1>
      <p style={{ fontSize: "14px", color: "var(--color-text-secondary)", marginBottom: "24px" }}>Devices and equipment at your organisation.</p>

      {loading && <div style={{ color: "var(--color-text-secondary)" }}>Loading...</div>}
      {error && <div style={{ color: "var(--color-text-danger)" }}>{error}</div>}

      {Object.entries(grouped).map(([group, items]) => (
        <div key={group} style={{ marginBottom: "28px" }}>
          <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "10px" }}>{group}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {items.map(a => (
              <div key={a.id} style={{ padding: "14px 18px", borderRadius: "10px", background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-text-primary)" }}>
                      {a.friendlyName || a.name}
                    </div>
                    {a.friendlyName && <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "1px" }}>{a.name}</div>}
                    <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "4px" }}>
                      {[a.make, a.model].filter(Boolean).join(" ")}
                      {a.serial && <span> · S/N: {a.serial}</span>}
                      {a.location && <span> · {a.location.name}{a.location.city ? `, ${a.location.city}` : ""}</span>}
                      {a.room && <span> · {a.room}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    {a.warrantyExpiry && (
                      <div style={{ fontSize: "12px", color: new Date(a.warrantyExpiry) < new Date() ? "var(--color-text-danger)" : "var(--color-text-secondary)" }}>
                        Warranty: {new Date(a.warrantyExpiry) < new Date() ? "Expired" : `Until ${new Date(a.warrantyExpiry).toLocaleDateString()}`}
                      </div>
                    )}
                    {a.ipAddress && <div style={{ fontSize: "12px", color: "var(--color-text-muted)", fontFamily: "monospace" }}>{a.ipAddress}</div>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {!loading && assets.length === 0 && !error && <div style={{ color: "var(--color-text-secondary)" }}>No assets found.</div>}
    </div>
  )
}
