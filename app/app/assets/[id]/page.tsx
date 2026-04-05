"use client"

import AppShell from "@/components/AppShell"
import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"

type Credential = {
  id: string
  label: string
  username: string | null
  url: string | null
  hasPassword: boolean
}

type Asset = {
  id: string
  name: string
  friendlyName: string | null
  category: string
  make: string | null
  model: string | null
  serial: string | null
  assetTag: string | null
  macAddress: string | null
  ipAddress: string | null
  vlan: string | null
  switchPort: string | null
  room: string | null
  status: string
  managementUrl: string | null
  splashtopUrl: string | null
  driverUrl: string | null
  rdpEnabled: boolean
  rdpHost: string | null
  rdpPort: number | null
  vncEnabled: boolean
  vncHost: string | null
  vncPort: number | null
  warrantyExpiry: string | null
  purchaseDate: string | null
  notes: string | null
  syncroAssetId: string | null
  dataSource: string
  assetType: { id: string; name: string } | null
  location: {
    id: string
    name: string
    address: string | null
    city: string | null
    state: string | null
    ispName: string | null
    wanIp: string | null
    client: { id: string; name: string }
  }
  primaryUser: {
    id: string
    name: string
    email: string | null
    phone: string | null
    m365Upn: string | null
    jobTitle: string | null
  } | null
  contact: {
    id: string
    name: string
    role: string | null
    email: string | null
    phone: string | null
  } | null
  credentials: Credential[]
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

const card: React.CSSProperties = {
  background: "var(--color-background-secondary)",
  border: "0.5px solid var(--color-border-tertiary)",
  borderRadius: "10px",
  padding: "16px",
  marginBottom: "12px",
}

const cardTitle: React.CSSProperties = {
  fontSize: "11px", fontWeight: 600, color: "var(--color-text-muted)",
  textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "12px",
}

const fieldRow: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", gap: "16px",
  padding: "5px 0", borderBottom: "0.5px solid var(--color-border-tertiary)",
}

const fieldLabel: React.CSSProperties = {
  fontSize: "12px", color: "var(--color-text-muted)", flexShrink: 0,
}

const fieldValue: React.CSSProperties = {
  fontSize: "13px", color: "var(--color-text-primary)", textAlign: "right", wordBreak: "break-all",
}

function ActionButton({ href, download, label, variant = "default" }: {
  href: string; download?: boolean; label: string; variant?: "default" | "primary"
}) {
  return (
    <a
      href={href}
      {...(download ? {} : { target: "_blank", rel: "noopener noreferrer" })}
      style={{
        display: "inline-flex", alignItems: "center",
        fontSize: "13px", fontWeight: 500, padding: "7px 14px",
        borderRadius: "7px", textDecoration: "none", whiteSpace: "nowrap",
        ...(variant === "primary"
          ? { background: "var(--color-text-primary)", color: "var(--color-background-primary)", border: "none" }
          : { background: "var(--color-background-primary)", color: "var(--color-text-secondary)", border: "0.5px solid var(--color-border-secondary)" }),
      }}
    >
      {label}
    </a>
  )
}

export default function AssetDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const [asset, setAsset] = useState<Asset | null>(null)
  const [loading, setLoading] = useState(true)

  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, string>>({})
  const [revealingId, setRevealingId] = useState<string | null>(null)

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

  async function revealPassword(credId: string) {
    if (revealedPasswords[credId] !== undefined) {
      setRevealedPasswords(p => { const n = { ...p }; delete n[credId]; return n })
      return
    }
    setRevealingId(credId)
    try {
      const res = await fetch(`/api/credentials/${credId}/reveal`)
      const data = await res.json()
      setRevealedPasswords(p => ({ ...p, [credId]: data.password ?? "" }))
    } catch {}
    finally { setRevealingId(null) }
  }

  async function findDrivers() {
    setDriverLooking(true); setDriverLookup(null)
    try {
      const res = await fetch(`/api/assets/${id}/driver-url`)
      if (res.ok) setDriverLookup(await res.json())
      else { const e = await res.json(); alert(e.error || "Could not look up drivers") }
    } finally { setDriverLooking(false) }
  }

  async function saveDriverUrl(url: string) {
    setDriverSaving(true)
    try {
      const res = await fetch(`/api/assets/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverUrl: url }),
      })
      if (res.ok) { setAsset(a => a ? { ...a, driverUrl: url } : a); setDriverLookup(null); setDriverEditing(false) }
    } finally { setDriverSaving(false) }
  }

  async function clearDriverUrl() {
    setDriverSaving(true)
    try {
      const res = await fetch(`/api/assets/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
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

  const displayName = asset.friendlyName || asset.name
  const hostname = asset.friendlyName ? asset.name : null
  const hasRemoteAccess = asset.splashtopUrl || asset.rdpEnabled || asset.vncEnabled || asset.managementUrl
  const vncTarget = `vnc://${asset.vncHost || asset.ipAddress}:${asset.vncPort ?? 5900}`
  const warrantyExpired = asset.warrantyExpiry && new Date(asset.warrantyExpiry) < new Date()

  return (
    <AppShell>
      <div style={{ padding: "28px 32px" }}>

        {/* Breadcrumb */}
        <div style={{ marginBottom: "16px", display: "flex", alignItems: "center", gap: "6px" }}>
          <span onClick={() => router.push("/clients")} style={{ fontSize: "13px", color: "var(--color-text-muted)", cursor: "pointer" }}>Clients</span>
          <span style={{ fontSize: "13px", color: "var(--color-text-muted)" }}>/</span>
          <span onClick={() => router.push("/clients/" + asset.location.client.id + "?tab=Assets")} style={{ fontSize: "13px", color: "var(--color-text-muted)", cursor: "pointer" }}>{asset.location.client.name}</span>
          <span style={{ fontSize: "13px", color: "var(--color-text-muted)" }}>/</span>
          <span style={{ fontSize: "13px", color: "var(--color-text-primary)" }}>{displayName}</span>
        </div>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "20px", gap: "16px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <h1 style={{ fontSize: "22px", fontWeight: 500, margin: 0 }}>{displayName}</h1>
              <span style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", color: statusColor[asset.status] ?? "#94a3b8" }}>
                <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: statusColor[asset.status] ?? "#94a3b8", display: "inline-block" }} />
                {asset.status.charAt(0) + asset.status.slice(1).toLowerCase()}
              </span>
              <span style={{ fontSize: "12px", padding: "2px 8px", borderRadius: "5px", background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", color: "var(--color-text-secondary)" }}>
                {asset.assetType?.name ?? categoryLabel[asset.category] ?? asset.category}
              </span>
            </div>
            {hostname && <div style={{ fontSize: "12px", color: "var(--color-text-muted)", fontFamily: "monospace", marginTop: "4px" }}>{hostname}</div>}
            {(asset.make || asset.model) && <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginTop: "2px" }}>{[asset.make, asset.model].filter(Boolean).join(" ")}</div>}
          </div>
          <button
            onClick={() => router.push(`/clients/${asset.location.client.id}?tab=Assets&edit=${asset.id}`)}
            style={{ fontSize: "13px", padding: "7px 14px", borderRadius: "7px", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-secondary)", cursor: "pointer", flexShrink: 0 }}
          >
            Edit
          </button>
        </div>

        {/* Quick-launch bar */}
        {hasRemoteAccess && (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "20px", padding: "12px 16px", background: "var(--color-background-secondary)", borderRadius: "10px", border: "0.5px solid var(--color-border-tertiary)" }}>
            <span style={{ fontSize: "12px", color: "var(--color-text-muted)", alignSelf: "center", marginRight: "4px" }}>Remote access</span>
            {asset.splashtopUrl && <ActionButton href={asset.splashtopUrl} label="Splashtop" variant="primary" />}
            {asset.rdpEnabled && <ActionButton href={`/api/assets/${asset.id}/rdp`} download label="RDP" />}
            {asset.vncEnabled && asset.ipAddress && <ActionButton href={vncTarget} label="VNC" />}
            {asset.managementUrl && <ActionButton href={asset.managementUrl} label="Management ↗" />}
          </div>
        )}

        {/* Two-column layout */}
        <div style={{ display: "flex", gap: "20px", alignItems: "flex-start" }}>

          {/* ── Left: main details ── */}
          <div style={{ flex: 1, minWidth: 0 }}>

            {/* Technical details */}
            <div style={card}>
              <div style={cardTitle}>Hardware</div>
              {[
                { label: "IP address", value: asset.ipAddress, mono: true },
                { label: "MAC address", value: asset.macAddress, mono: true },
                { label: "Serial", value: asset.serial, mono: true },
                { label: "Asset tag", value: asset.assetTag },
                { label: "VLAN", value: asset.vlan },
                { label: "Switch port", value: asset.switchPort, mono: true },
                { label: "Room", value: asset.room },
                { label: "Purchase date", value: asset.purchaseDate ? new Date(asset.purchaseDate).toLocaleDateString() : null },
                { label: "Warranty expiry", value: asset.warrantyExpiry ? new Date(asset.warrantyExpiry).toLocaleDateString() : null, warn: !!warrantyExpired },
                { label: "Data source", value: asset.dataSource },
                { label: "Syncro ID", value: asset.syncroAssetId },
              ].filter(f => f.value).map(({ label, value, mono, warn }) => (
                <div key={label} style={{ ...fieldRow }}>
                  <span style={fieldLabel}>{label}</span>
                  <span style={{ ...fieldValue, fontFamily: mono ? "monospace" : "inherit", color: warn ? "var(--color-text-danger)" : "var(--color-text-primary)" }}>
                    {value}
                  </span>
                </div>
              ))}
            </div>

            {/* Drivers & Support */}
            {(asset.make || asset.driverUrl) && (
              <div style={card}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                  <div style={cardTitle}>Drivers & Support</div>
                  {!driverEditing && (
                    <div style={{ display: "flex", gap: "8px" }}>
                      {!asset.driverUrl && (
                        <button onClick={findDrivers} disabled={driverLooking}
                          style={{ fontSize: "12px", padding: "3px 10px", borderRadius: "6px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>
                          {driverLooking ? "Looking up…" : "Auto-find"}
                        </button>
                      )}
                      {asset.driverUrl && (
                        <>
                          <button onClick={() => { setDriverEditUrl(asset.driverUrl ?? ""); setDriverEditing(true) }}
                            style={{ fontSize: "12px", padding: "3px 10px", borderRadius: "6px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>Edit</button>
                          <button onClick={clearDriverUrl} disabled={driverSaving}
                            style={{ fontSize: "12px", padding: "3px 10px", borderRadius: "6px", border: "none", background: "transparent", cursor: "pointer", color: "var(--color-text-danger)" }}>Clear</button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {asset.driverUrl && !driverEditing && (
                  <a href={asset.driverUrl} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: "13px", color: "var(--color-text-primary)", wordBreak: "break-all" }}>
                    {asset.make ? `${asset.make} driver & support page` : "Driver & support page"} ↗
                  </a>
                )}

                {driverEditing && (
                  <div>
                    <input value={driverEditUrl} onChange={e => setDriverEditUrl(e.target.value)} placeholder="https://…"
                      style={{ width: "100%", padding: "7px 10px", fontSize: "13px", borderRadius: "7px", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box", marginBottom: "8px" }} />
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button onClick={() => saveDriverUrl(driverEditUrl)} disabled={driverSaving || !driverEditUrl.trim()}
                        style={{ fontSize: "12px", padding: "5px 12px", borderRadius: "6px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>
                        {driverSaving ? "Saving…" : "Save"}
                      </button>
                      <button onClick={() => setDriverEditing(false)}
                        style={{ fontSize: "12px", padding: "5px 10px", borderRadius: "6px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>Cancel</button>
                    </div>
                  </div>
                )}

                {driverLookup && !driverEditing && (
                  <div style={{ marginTop: asset.driverUrl ? "12px" : 0 }}>
                    <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginBottom: "6px" }}>
                      {driverLookup.source === "manufacturer" ? "Found manufacturer page:" : "No direct page — Google search:"}
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
                        style={{ fontSize: "12px", padding: "5px 10px", borderRadius: "6px", border: "0.5px solid var(--color-border-secondary)", color: "var(--color-text-secondary)", textDecoration: "none" }}>
                        Preview ↗
                      </a>
                      <button onClick={() => setDriverLookup(null)}
                        style={{ fontSize: "12px", padding: "5px 10px", borderRadius: "6px", border: "none", background: "transparent", cursor: "pointer", color: "var(--color-text-muted)" }}>Dismiss</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Notes */}
            {asset.notes && (
              <div style={card}>
                <div style={cardTitle}>Notes</div>
                <div style={{ fontSize: "14px", lineHeight: "1.6", whiteSpace: "pre-wrap" }}>{asset.notes}</div>
              </div>
            )}
          </div>

          {/* ── Right: relations sidebar ── */}
          <div style={{ width: "272px", flexShrink: 0 }}>

            {/* Primary user */}
            {asset.primaryUser && (
              <div style={card}>
                <div style={cardTitle}>Primary User</div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                  <div style={{
                    width: "34px", height: "34px", borderRadius: "50%", flexShrink: 0,
                    background: "var(--color-background-hover)", border: "0.5px solid var(--color-border-tertiary)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "14px", fontWeight: 600, color: "var(--color-text-secondary)",
                  }}>
                    {asset.primaryUser.name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "14px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{asset.primaryUser.name}</div>
                    {asset.primaryUser.jobTitle && <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "1px" }}>{asset.primaryUser.jobTitle}</div>}
                  </div>
                </div>
                {[
                  { icon: "✉", value: asset.primaryUser.email, href: asset.primaryUser.email ? `mailto:${asset.primaryUser.email}` : null },
                  { icon: "☎", value: asset.primaryUser.phone, href: asset.primaryUser.phone ? `tel:${asset.primaryUser.phone}` : null },
                  { icon: "⊞", value: asset.primaryUser.m365Upn, mono: true },
                ].filter(f => f.value).map(({ icon, value, href, mono }) => (
                  <div key={icon} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "4px 0", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                    <span style={{ fontSize: "12px", color: "var(--color-text-muted)", width: "14px", flexShrink: 0 }}>{icon}</span>
                    {href ? (
                      <a href={href} style={{ fontSize: "12px", color: "var(--color-text-secondary)", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: mono ? "monospace" : "inherit" }}>
                        {value}
                      </a>
                    ) : (
                      <span style={{ fontSize: "12px", color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: mono ? "monospace" : "inherit" }}>{value}</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Credentials linked to this asset */}
            {asset.credentials.length > 0 && (
              <div style={card}>
                <div style={cardTitle}>Credentials</div>
                {asset.credentials.map((cred, i) => (
                  <div key={cred.id} style={{ paddingBottom: "10px", marginBottom: "10px", borderBottom: i < asset.credentials.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "6px" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: "13px", fontWeight: 500 }}>{cred.label}</div>
                        {cred.username && <div style={{ fontSize: "12px", color: "var(--color-text-muted)", fontFamily: "monospace", marginTop: "1px" }}>{cred.username}</div>}
                        {cred.url && (
                          <a href={cred.url} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: "11px", color: "var(--color-text-muted)", display: "block", marginTop: "1px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {cred.url}
                          </a>
                        )}
                      </div>
                      {cred.hasPassword && (
                        <button
                          onClick={() => revealPassword(cred.id)}
                          disabled={revealingId === cred.id}
                          style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "5px", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-secondary)", cursor: "pointer", flexShrink: 0 }}
                        >
                          {revealingId === cred.id ? "…" : revealedPasswords[cred.id] !== undefined ? "Hide" : "Reveal"}
                        </button>
                      )}
                    </div>
                    {revealedPasswords[cred.id] !== undefined && (
                      <div style={{ marginTop: "6px", padding: "6px 10px", borderRadius: "6px", background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", fontSize: "13px", fontFamily: "monospace", wordBreak: "break-all", userSelect: "all" }}>
                        {revealedPasswords[cred.id] || "(empty)"}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Location */}
            <div style={card}>
              <div style={cardTitle}>Location</div>
              <div style={{ fontSize: "13px", fontWeight: 500, marginBottom: "6px" }}>{asset.location.name}</div>
              {[
                { label: "Address", value: [asset.location.address, asset.location.city, asset.location.state].filter(Boolean).join(", ") || null },
                { label: "ISP", value: asset.location.ispName },
                { label: "WAN IP", value: asset.location.wanIp, mono: true },
              ].filter(f => f.value).map(({ label, value, mono }) => (
                <div key={label} style={{ ...fieldRow }}>
                  <span style={fieldLabel}>{label}</span>
                  <span style={{ ...fieldValue, fontFamily: mono ? "monospace" : "inherit", fontSize: "12px" }}>{value}</span>
                </div>
              ))}
            </div>

            {/* Contact */}
            {asset.contact && (
              <div style={card}>
                <div style={cardTitle}>Contact</div>
                <div style={{ fontSize: "13px", fontWeight: 500, marginBottom: "2px" }}>{asset.contact.name}</div>
                {asset.contact.role && <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginBottom: "8px" }}>{asset.contact.role}</div>}
                {[
                  { icon: "✉", value: asset.contact.email, href: asset.contact.email ? `mailto:${asset.contact.email}` : null },
                  { icon: "☎", value: asset.contact.phone, href: asset.contact.phone ? `tel:${asset.contact.phone}` : null },
                ].filter(f => f.value).map(({ icon, value, href }) => (
                  <div key={icon} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "4px 0", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                    <span style={{ fontSize: "12px", color: "var(--color-text-muted)", width: "14px" }}>{icon}</span>
                    {href ? (
                      <a href={href} style={{ fontSize: "12px", color: "var(--color-text-secondary)", textDecoration: "none" }}>{value}</a>
                    ) : (
                      <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{value}</span>
                    )}
                  </div>
                ))}
              </div>
            )}

          </div>
        </div>
      </div>
    </AppShell>
  )
}
