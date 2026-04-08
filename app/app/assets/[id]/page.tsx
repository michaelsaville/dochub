"use client"

import AppShell from "@/components/AppShell"
import { useState, useEffect, useRef } from "react"
import { QRCodeCanvas } from "qrcode.react"
import { useParams, useRouter } from "next/navigation"

type Credential = {
  id: string
  label: string
  username: string | null
  url: string | null
  hasPassword: boolean
}

type AssetInterface = {
  id: string
  name: string
  macAddress: string | null
  ipAddress: string | null
  isPrimary: boolean
  notes: string | null
  vlan: { id: string; vlanNumber: number; name: string; color: string } | null
  switchPort: {
    id: string
    portNumber: number
    label: string | null
    networkDevice: { id: string; name: string }
  } | null
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

  const [interfaces, setInterfaces] = useState<AssetInterface[]>([])
  const [loadingIfaces, setLoadingIfaces] = useState(false)
  const [showAddIface, setShowAddIface] = useState(false)
  const [ifaceForm, setIfaceForm] = useState({ name: "eth0", macAddress: "", ipAddress: "", notes: "" })
  const [savingIface, setSavingIface] = useState(false)
  const [editingIface, setEditingIface] = useState<string | null>(null)
  const [ifaceEditForm, setIfaceEditForm] = useState<any>({})

  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, string>>({})
  const [revealingId, setRevealingId] = useState<string | null>(null)

  const [driverLookup, setDriverLookup] = useState<{ url: string; source: "manufacturer" | "search" } | null>(null)
  const [driverLooking, setDriverLooking] = useState(false)
  const [driverSaving, setDriverSaving] = useState(false)
  const [driverEditUrl, setDriverEditUrl] = useState("")
  const [driverEditing, setDriverEditing] = useState(false)
  const [showQR, setShowQR] = useState(false)
  const qrRef = useRef<HTMLDivElement>(null)

  function printLabel() {
    const canvas = qrRef.current?.querySelector("canvas") as HTMLCanvasElement | null
    if (!canvas || !asset) return
    const qrDataUrl = canvas.toDataURL("image/png")
    const name = asset.friendlyName || asset.name
    const lines = [
      asset.make || asset.model ? [asset.make, asset.model].filter(Boolean).join(" ") : null,
      asset.serial ? `S/N: ${asset.serial}` : null,
      asset.assetTag ? `Tag: ${asset.assetTag}` : null,
      asset.location?.name ? `Location: ${asset.location.name}` : null,
      `Client: ${asset.location?.client?.name ?? ""}`,
    ].filter(Boolean) as string[]

    const win = window.open("", "_blank", "width=560,height=420")
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head><title>Asset Label</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#fff;padding:20px}
        .label{display:flex;align-items:center;gap:20px;padding:20px 24px;border:1.5px solid #111;border-radius:6px}
        .qr img{width:150px;height:150px;display:block}
        .name{font-size:17px;font-weight:700;margin-bottom:8px;line-height:1.2}
        .line{font-size:12px;color:#444;margin-bottom:3px;font-family:monospace}
        @media print{body{min-height:auto;padding:0}@page{margin:0.4cm;size:14cm 7cm}}
      </style>
    </head><body>
      <div class="label">
        <div class="qr"><img src="${qrDataUrl}"/></div>
        <div class="info">
          <div class="name">${name}</div>
          ${lines.map(l => `<div class="line">${l}</div>`).join("")}
        </div>
      </div>
      <script>window.onload=function(){window.print();setTimeout(function(){window.close()},500)}</script>
    </body></html>`)
    win.document.close()
  }

  useEffect(() => {
    if (id) {
      fetch("/api/assets/" + id)
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(setAsset)
        .catch(() => router.back())
        .finally(() => setLoading(false))
      fetchInterfaces()
    }
  }, [id])

  async function fetchInterfaces() {
    setLoadingIfaces(true)
    try {
      const res = await fetch(`/api/assets/${id}/interfaces`)
      if (res.ok) setInterfaces(await res.json())
    } finally {
      setLoadingIfaces(false)
    }
  }

  async function addInterface() {
    if (!ifaceForm.name.trim()) return
    setSavingIface(true)
    try {
      const res = await fetch(`/api/assets/${id}/interfaces`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...ifaceForm, isPrimary: interfaces.length === 0 }),
      })
      if (res.ok) {
        const iface = await res.json()
        setInterfaces(prev => [...prev, iface])
        setIfaceForm({ name: "eth0", macAddress: "", ipAddress: "", notes: "" })
        setShowAddIface(false)
      }
    } finally {
      setSavingIface(false)
    }
  }

  async function updateInterface(ifaceId: string) {
    setSavingIface(true)
    try {
      const res = await fetch(`/api/assets/${id}/interfaces/${ifaceId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ifaceEditForm),
      })
      if (res.ok) {
        const updated = await res.json()
        setInterfaces(prev => prev.map(i => i.id === ifaceId ? updated : i))
        setEditingIface(null)
      }
    } finally {
      setSavingIface(false)
    }
  }

  async function deleteInterface(ifaceId: string) {
    if (!confirm("Remove this interface?")) return
    const res = await fetch(`/api/assets/${id}/interfaces/${ifaceId}`, { method: "DELETE" })
    if (res.ok) setInterfaces(prev => prev.filter(i => i.id !== ifaceId))
  }

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
          <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
            <button
              onClick={() => setShowQR(v => !v)}
              title="QR code / print label"
              style={{ fontSize: "13px", padding: "7px 14px", borderRadius: "7px", border: "0.5px solid var(--color-border-secondary)", background: showQR ? "var(--color-background-secondary)" : "var(--color-background-primary)", color: "var(--color-text-secondary)", cursor: "pointer" }}
            >
              QR
            </button>
            <button
              onClick={() => router.push(`/clients/${asset.location.client.id}?tab=Assets&edit=${asset.id}`)}
              style={{ fontSize: "13px", padding: "7px 14px", borderRadius: "7px", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-secondary)", cursor: "pointer" }}
            >
              Edit
            </button>
          </div>
        </div>

        {/* QR panel */}
        {showQR && (
          <div style={{ display: "flex", alignItems: "center", gap: "20px", padding: "16px 20px", marginBottom: "20px", background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "10px" }}>
            <div ref={qrRef} style={{ flexShrink: 0, background: "#fff", padding: "8px", borderRadius: "6px" }}>
              <QRCodeCanvas
                value={`https://dochub.pcc2k.com/assets/${asset.id}`}
                size={120}
                bgColor="#ffffff"
                fgColor="#000000"
                level="M"
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "13px", fontWeight: 500, marginBottom: "4px" }}>{asset.friendlyName || asset.name}</div>
              {(asset.make || asset.model) && <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginBottom: "2px" }}>{[asset.make, asset.model].filter(Boolean).join(" ")}</div>}
              {asset.serial && <div style={{ fontSize: "12px", color: "var(--color-text-muted)", fontFamily: "monospace" }}>S/N: {asset.serial}</div>}
              <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "4px", fontFamily: "monospace", wordBreak: "break-all" }}>
                dochub.pcc2k.com/assets/{asset.id}
              </div>
            </div>
            <button
              onClick={printLabel}
              style={{ fontSize: "13px", fontWeight: 500, padding: "8px 16px", borderRadius: "7px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer", flexShrink: 0 }}
            >
              Print label
            </button>
          </div>
        )}

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

            {/* Network Interfaces */}
            <div style={card}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                <div style={cardTitle}>Network Interfaces</div>
                <button onClick={() => setShowAddIface(v => !v)} style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "5px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>
                  {showAddIface ? "Cancel" : "+ Add"}
                </button>
              </div>
              {showAddIface && (
                <div style={{ marginBottom: "12px", padding: "10px", background: "var(--color-background-primary)", borderRadius: "7px", border: "0.5px solid var(--color-border-tertiary)" }}>
                  {[
                    { key: "name", label: "Name", placeholder: "eth0" },
                    { key: "ipAddress", label: "IP address", placeholder: "192.168.1.10" },
                    { key: "macAddress", label: "MAC address", placeholder: "aa:bb:cc:dd:ee:ff" },
                    { key: "notes", label: "Notes", placeholder: "" },
                  ].map(({ key, label, placeholder }) => (
                    <div key={key} style={{ marginBottom: "6px" }}>
                      <label style={{ fontSize: "11px", color: "var(--color-text-muted)", display: "block", marginBottom: "2px" }}>{label}</label>
                      <input value={(ifaceForm as any)[key]} onChange={e => setIfaceForm(f => ({ ...f, [key]: e.target.value }))} placeholder={placeholder}
                        style={{ width: "100%", padding: "5px 8px", fontSize: "12px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "6px", background: "var(--color-background-secondary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }} />
                    </div>
                  ))}
                  <button onClick={addInterface} disabled={savingIface || !ifaceForm.name.trim()}
                    style={{ fontSize: "12px", fontWeight: 500, padding: "4px 12px", borderRadius: "6px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>
                    {savingIface ? "Saving..." : "Save"}
                  </button>
                </div>
              )}
              {loadingIfaces ? (
                <div style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>Loading...</div>
              ) : interfaces.length === 0 ? (
                <div style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>No interfaces recorded.</div>
              ) : (
                interfaces.map((iface, i) => editingIface === iface.id ? (
                  <div key={iface.id} style={{ padding: "8px", background: "var(--color-background-primary)", borderRadius: "7px", border: "0.5px solid var(--color-border-secondary)", marginBottom: "8px" }}>
                    {[
                      { key: "name", label: "Name" },
                      { key: "ipAddress", label: "IP address" },
                      { key: "macAddress", label: "MAC address" },
                      { key: "notes", label: "Notes" },
                    ].map(({ key, label }) => (
                      <div key={key} style={{ marginBottom: "5px" }}>
                        <label style={{ fontSize: "11px", color: "var(--color-text-muted)", display: "block", marginBottom: "2px" }}>{label}</label>
                        <input value={ifaceEditForm[key] ?? ""} onChange={e => setIfaceEditForm((f: any) => ({ ...f, [key]: e.target.value }))}
                          style={{ width: "100%", padding: "5px 8px", fontSize: "12px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "6px", background: "var(--color-background-secondary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }} />
                      </div>
                    ))}
                    <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
                      <button onClick={() => updateInterface(iface.id)} disabled={savingIface}
                        style={{ fontSize: "11px", padding: "3px 10px", borderRadius: "5px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>Save</button>
                      <button onClick={() => setEditingIface(null)}
                        style={{ fontSize: "11px", padding: "3px 8px", borderRadius: "5px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div key={iface.id} style={{ paddingBottom: "10px", marginBottom: "10px", borderBottom: i < interfaces.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ fontSize: "13px", fontWeight: 500 }}>{iface.name}</span>
                        {iface.isPrimary && <span style={{ fontSize: "10px", padding: "1px 5px", borderRadius: "3px", background: "var(--color-background-hover)", color: "var(--color-text-muted)" }}>primary</span>}
                      </div>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button onClick={() => { setEditingIface(iface.id); setIfaceEditForm({ name: iface.name, ipAddress: iface.ipAddress ?? "", macAddress: iface.macAddress ?? "", notes: iface.notes ?? "" }) }}
                          style={{ fontSize: "11px", background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)", padding: 0 }}>Edit</button>
                        <button onClick={() => deleteInterface(iface.id)}
                          style={{ fontSize: "11px", background: "none", border: "none", cursor: "pointer", color: "var(--color-text-danger, #ef4444)", padding: 0 }}>×</button>
                      </div>
                    </div>
                    {iface.ipAddress && (
                      <div style={{ fontSize: "12px", fontFamily: "monospace", color: "var(--color-text-secondary)" }}>{iface.ipAddress}</div>
                    )}
                    {iface.macAddress && (
                      <div style={{ fontSize: "11px", fontFamily: "monospace", color: "var(--color-text-muted)" }}>{iface.macAddress}</div>
                    )}
                    {iface.vlan && (
                      <div style={{ display: "flex", alignItems: "center", gap: "5px", marginTop: "3px" }}>
                        <div style={{ width: "8px", height: "8px", borderRadius: "2px", background: iface.vlan.color, flexShrink: 0 }} />
                        <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>VLAN {iface.vlan.vlanNumber} – {iface.vlan.name}</span>
                      </div>
                    )}
                    {iface.switchPort && (
                      <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "2px" }}>
                        {iface.switchPort.networkDevice.name} · Port {iface.switchPort.portNumber}{iface.switchPort.label ? ` (${iface.switchPort.label})` : ""}
                      </div>
                    )}
                    {iface.notes && (
                      <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "2px", fontStyle: "italic" }}>{iface.notes}</div>
                    )}
                  </div>
                ))
              )}
            </div>

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
