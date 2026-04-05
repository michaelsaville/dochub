"use client"

import AppShell from "@/components/AppShell"
import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"

type Asset = {
  id: string
  name: string
  category: string
  make: string | null
  model: string | null
  serial: string | null
  macAddress: string | null
  ipAddress: string | null
  status: string
  managementUrl: string | null
  driverUrl: string | null
  warrantyExpiry: string | null
  notes: string | null
  syncroAssetId: string | null
  createdAt: string
  location: {
    id: string
    name: string
    client: { id: string; name: string }
  }
}

const categoryLabel: Record<string, string> = {
  COMPUTER: "Desktop", LAPTOP: "Laptop", SERVER: "Server", NAS: "NAS",
  NETWORK_GEAR: "Network Gear", WIRELESS: "Wireless", PRINTER: "Printer",
  TABLET: "Tablet", PHONE_SYSTEM: "Phone System", PHONE_ENDPOINT: "Phone Endpoint",
  WEBSITE: "Website", VPN: "VPN", OTHER: "Other",
}

const statusColor: Record<string, string> = {
  ACTIVE: "#22c55e", RETIRING: "#f59e0b", SUNSET: "#94a3b8",
}

export default function AssetDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const [asset, setAsset] = useState<Asset | null>(null)
  const [loading, setLoading] = useState(true)

  const [driverLookup, setDriverLookup] = useState<{ url: string; source: "manufacturer" | "search" } | null>(null)
  const [driverLooking, setDriverLooking] = useState(false)
  const [driverSaving, setDriverSaving] = useState(false)
  const [driverEditUrl, setDriverEditUrl] = useState("")
  const [driverEditing, setDriverEditing] = useState(false)

  useEffect(() => {
    if (id) fetch("/api/assets/" + id)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setAsset)
      .catch(() => router.back())
      .finally(() => setLoading(false))
  }, [id])

  async function findDrivers() {
    setDriverLooking(true)
    setDriverLookup(null)
    try {
      const res = await fetch(`/api/assets/${id}/driver-url`)
      if (res.ok) setDriverLookup(await res.json())
      else {
        const err = await res.json()
        alert(err.error || "Could not look up drivers")
      }
    } finally { setDriverLooking(false) }
  }

  async function saveDriverUrl(url: string) {
    setDriverSaving(true)
    try {
      const res = await fetch(`/api/assets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverUrl: url }),
      })
      if (res.ok) {
        setAsset(a => a ? { ...a, driverUrl: url } : a)
        setDriverLookup(null)
        setDriverEditing(false)
      }
    } finally { setDriverSaving(false) }
  }

  async function clearDriverUrl() {
    setDriverSaving(true)
    try {
      const res = await fetch(`/api/assets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverUrl: "" }),
      })
      if (res.ok) setAsset(a => a ? { ...a, driverUrl: null } : a)
    } finally { setDriverSaving(false) }
  }

  if (loading) return (
    <AppShell>
      <div style={{ padding: "32px", color: "var(--color-text-secondary)", fontSize: "14px" }}>Loading...</div>
    </AppShell>
  )

  if (!asset) return null

  const fields = [
    { label: "Category", value: categoryLabel[asset.category] ?? asset.category },
    { label: "Status", value: (
      <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: statusColor[asset.status] ?? "#94a3b8", display: "inline-block" }} />
        {asset.status.charAt(0) + asset.status.slice(1).toLowerCase()}
      </span>
    )},
    { label: "Make", value: asset.make || "—" },
    { label: "Model", value: asset.model || "—" },
    { label: "Serial", value: asset.serial || "—", mono: true },
    { label: "MAC address", value: asset.macAddress || "—", mono: true },
    { label: "IP address", value: asset.ipAddress || "—", mono: true },
    { label: "Location", value: asset.location.name },
    { label: "Warranty expiry", value: asset.warrantyExpiry ? new Date(asset.warrantyExpiry).toLocaleDateString() : "—" },
    { label: "Syncro ID", value: asset.syncroAssetId || "—" },
  ]

  return (
    <AppShell>
      <div style={{ padding: "32px" }}>
        <div style={{ marginBottom: "4px" }}>
          <span onClick={() => router.push("/clients")} style={{ fontSize: "13px", color: "var(--color-text-secondary)", cursor: "pointer" }}>Clients</span>
          <span style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}> / </span>
          <span onClick={() => router.push("/clients/" + asset.location.client.id)} style={{ fontSize: "13px", color: "var(--color-text-secondary)", cursor: "pointer" }}>
            {asset.location.client.name}
          </span>
          <span style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}> / </span>
          <span style={{ fontSize: "13px", color: "var(--color-text-primary)" }}>{asset.name}</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "32px", marginTop: "8px" }}>
          <h1 style={{ fontSize: "22px", fontWeight: 500 }}>{asset.name}</h1>
          <span style={{
            fontSize: "12px", padding: "3px 8px", borderRadius: "6px",
            background: "var(--color-background-secondary)",
            border: "0.5px solid var(--color-border-tertiary)",
            color: "var(--color-text-secondary)",
          }}>
            {categoryLabel[asset.category] ?? asset.category}
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", maxWidth: "800px" }}>
          <div style={{
            background: "var(--color-background-secondary)",
            border: "0.5px solid var(--color-border-tertiary)",
            borderRadius: "10px", padding: "20px",
          }}>
            <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: "12px" }}>Details</div>
            {fields.map(({ label, value, mono }) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "0.5px solid var(--color-border-tertiary)", gap: "16px" }}>
                <span style={{ fontSize: "13px", color: "var(--color-text-secondary)", flexShrink: 0 }}>{label}</span>
                <span style={{ fontSize: "13px", fontFamily: mono ? "monospace" : "inherit", textAlign: "right" }}>{value}</span>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {asset.managementUrl && (
              <div style={{
                background: "var(--color-background-secondary)",
                border: "0.5px solid var(--color-border-tertiary)",
                borderRadius: "10px", padding: "20px",
              }}>
                <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: "12px" }}>Management</div>
                <a href={asset.managementUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "13px", color: "var(--color-text-primary)" }}>
                  Open in Syncro
                </a>
              </div>
            )}

            {/* Drivers & Support card */}
            {(asset.make || asset.driverUrl) && (
              <div style={{
                background: "var(--color-background-secondary)",
                border: "0.5px solid var(--color-border-tertiary)",
                borderRadius: "10px", padding: "20px",
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                  <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-secondary)" }}>Drivers & Support</div>
                  {!driverEditing && (
                    <div style={{ display: "flex", gap: "8px" }}>
                      {!asset.driverUrl && (
                        <button
                          onClick={findDrivers}
                          disabled={driverLooking}
                          style={{ fontSize: "12px", padding: "3px 10px", borderRadius: "6px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}
                        >
                          {driverLooking ? "Looking up…" : "Auto-find"}
                        </button>
                      )}
                      {asset.driverUrl && (
                        <>
                          <button onClick={() => { setDriverEditUrl(asset.driverUrl ?? ""); setDriverEditing(true) }}
                            style={{ fontSize: "12px", padding: "3px 10px", borderRadius: "6px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>
                            Edit
                          </button>
                          <button onClick={clearDriverUrl} disabled={driverSaving}
                            style={{ fontSize: "12px", padding: "3px 10px", borderRadius: "6px", border: "none", background: "transparent", cursor: "pointer", color: "var(--color-text-danger)" }}>
                            Clear
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Saved URL */}
                {asset.driverUrl && !driverEditing && (
                  <a href={asset.driverUrl} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: "13px", color: "var(--color-text-primary)", wordBreak: "break-all" }}>
                    {asset.make ? `${asset.make} driver & support page` : "Driver & support page"} ↗
                  </a>
                )}

                {/* Edit URL inline */}
                {driverEditing && (
                  <div>
                    <input
                      value={driverEditUrl}
                      onChange={e => setDriverEditUrl(e.target.value)}
                      placeholder="https://…"
                      style={{ width: "100%", padding: "7px 10px", fontSize: "13px", borderRadius: "7px", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box", marginBottom: "8px" }}
                    />
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button onClick={() => saveDriverUrl(driverEditUrl)} disabled={driverSaving || !driverEditUrl.trim()}
                        style={{ fontSize: "12px", padding: "5px 12px", borderRadius: "6px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>
                        {driverSaving ? "Saving…" : "Save"}
                      </button>
                      <button onClick={() => setDriverEditing(false)}
                        style={{ fontSize: "12px", padding: "5px 10px", borderRadius: "6px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Auto-find result */}
                {driverLookup && !driverEditing && (
                  <div style={{ marginTop: asset.driverUrl ? "12px" : 0 }}>
                    <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginBottom: "6px" }}>
                      {driverLookup.source === "manufacturer" ? "Found manufacturer page:" : "No direct page found — Google search:"}
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", wordBreak: "break-all", marginBottom: "10px", padding: "8px", background: "var(--color-background-primary)", borderRadius: "6px", border: "0.5px solid var(--color-border-tertiary)" }}>
                      {driverLookup.url}
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button onClick={() => saveDriverUrl(driverLookup.url)} disabled={driverSaving}
                        style={{ fontSize: "12px", padding: "5px 12px", borderRadius: "6px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>
                        {driverSaving ? "Saving…" : "Save link"}
                      </button>
                      <a href={driverLookup.url} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: "12px", padding: "5px 10px", borderRadius: "6px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)", textDecoration: "none" }}>
                        Preview ↗
                      </a>
                      <button onClick={() => setDriverLookup(null)}
                        style={{ fontSize: "12px", padding: "5px 10px", borderRadius: "6px", border: "none", background: "transparent", cursor: "pointer", color: "var(--color-text-muted)" }}>
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {asset.notes && (
              <div style={{
                background: "var(--color-background-secondary)",
                border: "0.5px solid var(--color-border-tertiary)",
                borderRadius: "10px", padding: "20px",
              }}>
                <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: "8px" }}>Notes</div>
                <div style={{ fontSize: "14px", lineHeight: "1.6" }}>{asset.notes}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
