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
  type: string
  macAddress: string | null
  ipAddress: string | null
  isPrimary: boolean
  notes: string | null
  tailscaleIp: string | null
  tailscaleHostname: string | null
  tailscaleDeviceId: string | null
  tailscaleIsExitNode: boolean
  tailscaleIsSubnetRouter: boolean
  tailscaleSubnets: string | null
  tailscaleTags: string | null
  tailscaleLastSeen: string | null
  tailscaleOs: string | null
  tailscaleVersion: string | null
  credentialId: string | null
  credential: { id: string; label: string; username: string | null } | null
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
  person: {
    id: string
    name: string
    email: string | null
    phone: string | null
    m365Upn: string | null
    jobTitle: string | null
    role: string | null
  } | null
  credentials: Credential[]
  linkedPhoneSystems: { id: string; name: string; type: string; clientId: string }[]
  linkedCameraSystems: { id: string; name: string; type: string; clientId: string }[]
  networkDevice: {
    id: string; name: string; type: string; ipAddress: string | null; portCount: number | null
    switchPorts: {
      id: string; portNumber: number; label: string | null
      isUplink: boolean; isPoe: boolean; notes: string | null
      vlan: { id: string; vlanNumber: number; name: string; color: string } | null
      asset: { id: string; name: string; friendlyName: string | null } | null
    }[]
  } | null
  cameraSystemsFull: {
    id: string; name: string; type: string
    cameras: {
      id: string; name: string; location: string | null; make: string | null
      model: string | null; ipAddress: string | null; resolution: string | null
      type: string; recordingSchedule: string | null; coverageNotes: string | null
    }[]
  }[]
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
  const [ifaceForm, setIfaceForm] = useState({
    name: "eth0", type: "ETHERNET", macAddress: "", ipAddress: "", notes: "",
    tailscaleIp: "", tailscaleHostname: "", tailscaleDeviceId: "",
    tailscaleIsExitNode: false, tailscaleIsSubnetRouter: false,
    tailscaleSubnets: "", tailscaleTags: "", tailscaleOs: "", tailscaleVersion: "",
  })
  const [savingIface, setSavingIface] = useState(false)
  const [editingIface, setEditingIface] = useState<string | null>(null)
  const [ifaceEditForm, setIfaceEditForm] = useState<any>({})

  // Asset links
  const [assetLinks, setAssetLinks] = useState<any[]>([])
  const [linkedDocuments, setLinkedDocuments] = useState<any[]>([])
  const [linkedLicenses, setLinkedLicenses] = useState<any[]>([])
  const [linkedApplications, setLinkedApplications] = useState<any[]>([])
  const [tickethubTickets, setTickethubTickets] = useState<any[]>([])
  const [showAddLink, setShowAddLink] = useState(false)
  const [linkForm, setLinkForm] = useState({ linkedAssetId: "", relationType: "RELATED", notes: "" })
  const [savingLink, setSavingLink] = useState(false)
  const [assetSearchResults, setAssetSearchResults] = useState<any[]>([])
  const [assetSearchQuery, setAssetSearchQuery] = useState("")
  const [loadingAssetSearch, setLoadingAssetSearch] = useState(false)

  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, string>>({})
  const [revealingId, setRevealingId] = useState<string | null>(null)

  // Synology
  const [synologyConfig, setSynologyConfig] = useState<any>(null)
  const [loadingSynology, setLoadingSynology] = useState(false)
  const [synologyForm, setSynologyForm] = useState({ port: "5001", useHttps: true, skipSslVerify: true, username: "", password: "" })
  const [savingSynology, setSavingSynology] = useState(false)
  const [synologySyncing, setSynologySyncing] = useState(false)
  const [synologySyncResult, setSynologySyncResult] = useState<any>(null)
  const [showSynologyForm, setShowSynologyForm] = useState(false)

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
        .then(d => { setAsset(d); if (d.assetType?.name === "NAS") fetchSynology() })
        .catch(() => router.back())
        .finally(() => setLoading(false))
      fetchInterfaces()
      fetchAssetLinks()
      // Fetch linked TicketHub tickets (cross-schema)
      fetch(`/api/assets/${id}/tickets`)
        .then(r => r.ok ? r.json() : [])
        .then(d => setTickethubTickets(Array.isArray(d) ? d : []))
        .catch(() => {})
    }
  }, [id])

  async function fetchSynology() {
    setLoadingSynology(true)
    try {
      const res = await fetch(`/api/assets/${id}/synology`)
      const data = await res.json()
      setSynologyConfig(data)
      if (data) setSynologyForm(f => ({ ...f, port: String(data.port), useHttps: data.useHttps, skipSslVerify: data.skipSslVerify, username: data.username }))
    } finally { setLoadingSynology(false) }
  }

  async function saveSynology() {
    setSavingSynology(true)
    try {
      const res = await fetch(`/api/assets/${id}/synology`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...synologyForm, port: parseInt(synologyForm.port) }),
      })
      if (res.ok) { setSynologyConfig(await res.json()); setShowSynologyForm(false) }
    } finally { setSavingSynology(false) }
  }

  async function syncSynology() {
    setSynologySyncing(true)
    setSynologySyncResult(null)
    try {
      const res = await fetch(`/api/assets/${id}/synology/sync`, { method: "POST" })
      const data = await res.json()
      setSynologySyncResult(data)
      if (data.success) fetchSynology()
    } finally { setSynologySyncing(false) }
  }

  async function deleteSynology() {
    if (!confirm("Remove Synology config and all backup job data?")) return
    await fetch(`/api/assets/${id}/synology`, { method: "DELETE" })
    setSynologyConfig(null)
    setSynologySyncResult(null)
  }

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
        setIfaceForm({
          name: "eth0", type: "ETHERNET", macAddress: "", ipAddress: "", notes: "",
          tailscaleIp: "", tailscaleHostname: "", tailscaleDeviceId: "",
          tailscaleIsExitNode: false, tailscaleIsSubnetRouter: false,
          tailscaleSubnets: "", tailscaleTags: "", tailscaleOs: "", tailscaleVersion: "",
        })
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

  async function fetchAssetLinks() {
    try {
      const res = await fetch(`/api/assets/${id}/links`)
      if (res.ok) {
        const data = await res.json()
        setAssetLinks(data.links || [])
        setLinkedDocuments(data.documents || [])
        setLinkedLicenses(data.licenses || [])
        setLinkedApplications(data.applications || [])
      }
    } catch {}
  }

  async function searchAssets(query: string) {
    setAssetSearchQuery(query)
    if (!query.trim() || !asset) return
    setLoadingAssetSearch(true)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
      if (res.ok) {
        const data = await res.json()
        const clientId = asset.location.client.id
        const filtered = (data.assets || []).filter((a: any) =>
          a.id !== id && a.location?.client?.id === clientId
        )
        setAssetSearchResults(filtered)
      }
    } catch {}
    finally { setLoadingAssetSearch(false) }
  }

  async function addAssetLink() {
    if (!linkForm.linkedAssetId || !linkForm.relationType) return
    setSavingLink(true)
    try {
      const res = await fetch(`/api/assets/${id}/links`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(linkForm),
      })
      if (res.ok) {
        await fetchAssetLinks()
        setLinkForm({ linkedAssetId: "", relationType: "RELATED", notes: "" })
        setAssetSearchQuery("")
        setAssetSearchResults([])
        setShowAddLink(false)
      }
    } finally { setSavingLink(false) }
  }

  async function removeAssetLink(linkId: string) {
    if (!confirm("Remove this link?")) return
    const res = await fetch(`/api/assets/${id}/links/${linkId}`, { method: "DELETE" })
    if (res.ok) setAssetLinks(prev => prev.filter(l => l.id !== linkId))
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
                  <div style={{ marginBottom: "6px" }}>
                    <label style={{ fontSize: "11px", color: "var(--color-text-muted)", display: "block", marginBottom: "2px" }}>Type</label>
                    <select value={ifaceForm.type} onChange={e => {
                      const t = e.target.value
                      setIfaceForm(f => ({ ...f, type: t, name: t === "TAILSCALE" ? "Tailscale" : t === "WIFI" ? "Wi-Fi" : t === "VPN" ? "VPN" : "eth0" }))
                    }} style={{ width: "100%", padding: "5px 8px", fontSize: "12px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "6px", background: "var(--color-background-secondary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }}>
                      <option value="ETHERNET">Ethernet</option>
                      <option value="TAILSCALE">Tailscale</option>
                      <option value="WIFI">Wi-Fi</option>
                      <option value="VPN">VPN</option>
                    </select>
                  </div>
                  {[
                    { key: "name", label: "Name", placeholder: ifaceForm.type === "TAILSCALE" ? "Tailscale" : "eth0" },
                    { key: "ipAddress", label: "IP address", placeholder: "192.168.1.10" },
                    { key: "macAddress", label: "MAC address", placeholder: "aa:bb:cc:dd:ee:ff" },
                  ].map(({ key, label, placeholder }) => (
                    <div key={key} style={{ marginBottom: "6px" }}>
                      <label style={{ fontSize: "11px", color: "var(--color-text-muted)", display: "block", marginBottom: "2px" }}>{label}</label>
                      <input value={(ifaceForm as any)[key]} onChange={e => setIfaceForm(f => ({ ...f, [key]: e.target.value }))} placeholder={placeholder}
                        style={{ width: "100%", padding: "5px 8px", fontSize: "12px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "6px", background: "var(--color-background-secondary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }} />
                    </div>
                  ))}
                  {ifaceForm.type === "TAILSCALE" && (
                    <>
                      {[
                        { key: "tailscaleIp", label: "Tailscale IP", placeholder: "100.x.x.x" },
                        { key: "tailscaleHostname", label: "Tailscale hostname", placeholder: "server-01" },
                        { key: "tailscaleDeviceId", label: "Device ID", placeholder: "nXXXXXXXXXXXCNTRL" },
                        { key: "tailscaleOs", label: "OS", placeholder: "Linux, Windows, macOS..." },
                        { key: "tailscaleVersion", label: "Client version", placeholder: "1.72.1" },
                        { key: "tailscaleSubnets", label: "Advertised subnets", placeholder: "192.168.1.0/24, 10.0.0.0/8" },
                        { key: "tailscaleTags", label: "ACL tags", placeholder: "tag:server, tag:prod" },
                      ].map(({ key, label, placeholder }) => (
                        <div key={key} style={{ marginBottom: "6px" }}>
                          <label style={{ fontSize: "11px", color: "var(--color-text-muted)", display: "block", marginBottom: "2px" }}>{label}</label>
                          <input value={(ifaceForm as any)[key]} onChange={e => setIfaceForm(f => ({ ...f, [key]: e.target.value }))} placeholder={placeholder}
                            style={{ width: "100%", padding: "5px 8px", fontSize: "12px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "6px", background: "var(--color-background-secondary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }} />
                        </div>
                      ))}
                      <div style={{ display: "flex", gap: "12px", marginBottom: "6px" }}>
                        <label style={{ fontSize: "11px", color: "var(--color-text-muted)", display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }}>
                          <input type="checkbox" checked={ifaceForm.tailscaleIsExitNode} onChange={e => setIfaceForm(f => ({ ...f, tailscaleIsExitNode: e.target.checked }))} />
                          Exit node
                        </label>
                        <label style={{ fontSize: "11px", color: "var(--color-text-muted)", display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }}>
                          <input type="checkbox" checked={ifaceForm.tailscaleIsSubnetRouter} onChange={e => setIfaceForm(f => ({ ...f, tailscaleIsSubnetRouter: e.target.checked }))} />
                          Subnet router
                        </label>
                      </div>
                    </>
                  )}
                  <div style={{ marginBottom: "6px" }}>
                    <label style={{ fontSize: "11px", color: "var(--color-text-muted)", display: "block", marginBottom: "2px" }}>Notes</label>
                    <input value={ifaceForm.notes} onChange={e => setIfaceForm(f => ({ ...f, notes: e.target.value }))} placeholder=""
                      style={{ width: "100%", padding: "5px 8px", fontSize: "12px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "6px", background: "var(--color-background-secondary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }} />
                  </div>
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
                        {iface.type !== "ETHERNET" && <span style={{ fontSize: "10px", padding: "1px 5px", borderRadius: "3px", background: iface.type === "TAILSCALE" ? "rgba(74,144,226,0.15)" : "var(--color-background-hover)", color: iface.type === "TAILSCALE" ? "#4A90E2" : "var(--color-text-muted)" }}>{iface.type.toLowerCase()}</span>}
                      </div>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button onClick={() => { setEditingIface(iface.id); setIfaceEditForm({ name: iface.name, ipAddress: iface.ipAddress ?? "", macAddress: iface.macAddress ?? "", notes: iface.notes ?? "", tailscaleIp: iface.tailscaleIp ?? "", tailscaleHostname: iface.tailscaleHostname ?? "", tailscaleDeviceId: iface.tailscaleDeviceId ?? "", tailscaleIsExitNode: iface.tailscaleIsExitNode, tailscaleIsSubnetRouter: iface.tailscaleIsSubnetRouter, tailscaleSubnets: iface.tailscaleSubnets ?? "", tailscaleTags: iface.tailscaleTags ?? "", tailscaleOs: iface.tailscaleOs ?? "", tailscaleVersion: iface.tailscaleVersion ?? "" }) }}
                          style={{ fontSize: "11px", background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)", padding: 0 }}>Edit</button>
                        <button onClick={() => deleteInterface(iface.id)}
                          style={{ fontSize: "11px", background: "none", border: "none", cursor: "pointer", color: "var(--color-text-danger, #ef4444)", padding: 0 }}>×</button>
                      </div>
                    </div>
                    {iface.ipAddress && (
                      <div style={{ fontSize: "12px", fontFamily: "monospace", color: "var(--color-text-secondary)" }}>{iface.ipAddress}</div>
                    )}
                    {iface.type === "TAILSCALE" && iface.tailscaleIp && (
                      <div style={{ fontSize: "12px", fontFamily: "monospace", color: "#4A90E2" }}>{iface.tailscaleIp}{iface.tailscaleHostname ? ` (${iface.tailscaleHostname})` : ""}</div>
                    )}
                    {iface.macAddress && (
                      <div style={{ fontSize: "11px", fontFamily: "monospace", color: "var(--color-text-muted)" }}>{iface.macAddress}</div>
                    )}
                    {iface.type === "TAILSCALE" && (
                      <div style={{ marginTop: "3px", display: "flex", flexWrap: "wrap", gap: "4px" }}>
                        {iface.tailscaleIsExitNode && <span style={{ fontSize: "10px", padding: "1px 5px", borderRadius: "3px", background: "rgba(52,199,89,0.15)", color: "#34C759" }}>exit node</span>}
                        {iface.tailscaleIsSubnetRouter && <span style={{ fontSize: "10px", padding: "1px 5px", borderRadius: "3px", background: "rgba(255,159,10,0.15)", color: "#FF9F0A" }}>subnet router</span>}
                        {iface.tailscaleOs && <span style={{ fontSize: "10px", padding: "1px 5px", borderRadius: "3px", background: "var(--color-background-hover)", color: "var(--color-text-muted)" }}>{iface.tailscaleOs}</span>}
                        {iface.tailscaleVersion && <span style={{ fontSize: "10px", padding: "1px 5px", borderRadius: "3px", background: "var(--color-background-hover)", color: "var(--color-text-muted)" }}>v{iface.tailscaleVersion}</span>}
                      </div>
                    )}
                    {iface.type === "TAILSCALE" && iface.tailscaleSubnets && (
                      <div style={{ fontSize: "11px", fontFamily: "monospace", color: "var(--color-text-muted)", marginTop: "2px" }}>Subnets: {iface.tailscaleSubnets}</div>
                    )}
                    {iface.type === "TAILSCALE" && iface.tailscaleTags && (
                      <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "2px" }}>Tags: {iface.tailscaleTags}</div>
                    )}
                    {iface.credential && (
                      <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "2px" }}>Login: {iface.credential.label}{iface.credential.username ? ` (${iface.credential.username})` : ""}</div>
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
            {asset.person && (
              <div style={card}>
                <div style={cardTitle}>Primary User</div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                  <div style={{
                    width: "34px", height: "34px", borderRadius: "50%", flexShrink: 0,
                    background: "var(--color-background-hover)", border: "0.5px solid var(--color-border-tertiary)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "14px", fontWeight: 600, color: "var(--color-text-secondary)",
                  }}>
                    {asset.person.name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "14px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{asset.person.name}</div>
                    {asset.person.jobTitle && <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "1px" }}>{asset.person.jobTitle}</div>}
                  </div>
                </div>
                {[
                  { icon: "✉", value: asset.person.email, href: asset.person.email ? `mailto:${asset.person.email}` : null },
                  { icon: "☎", value: asset.person.phone, href: asset.person.phone ? `tel:${asset.person.phone}` : null },
                  { icon: "⊞", value: asset.person.m365Upn, mono: true },
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

            {/* Synology Backups — NAS assets only */}
            {asset.assetType?.name === "NAS" && (
              <div style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <div style={cardTitle}>Synology Backups</div>
                  <div style={{ display: "flex", gap: "6px" }}>
                    {synologyConfig && (
                      <button onClick={syncSynology} disabled={synologySyncing} style={{ fontSize: "12px", padding: "3px 10px", borderRadius: "6px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>
                        {synologySyncing ? "Syncing…" : "Sync now"}
                      </button>
                    )}
                    <button onClick={() => setShowSynologyForm(v => !v)} style={{ fontSize: "12px", padding: "3px 10px", borderRadius: "6px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>
                      {showSynologyForm ? "Cancel" : synologyConfig ? "Edit" : "Configure"}
                    </button>
                    {synologyConfig && !showSynologyForm && (
                      <button onClick={deleteSynology} style={{ fontSize: "12px", padding: "3px 10px", borderRadius: "6px", border: "none", background: "transparent", cursor: "pointer", color: "var(--color-text-danger)" }}>Remove</button>
                    )}
                  </div>
                </div>

                {showSynologyForm && (
                  <div style={{ marginBottom: "14px", padding: "14px", background: "var(--color-background-primary)", borderRadius: "8px", border: "0.5px solid var(--color-border-tertiary)" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
                      {[
                        { label: "Port", key: "port", type: "number", placeholder: "5001" },
                        { label: "Username", key: "username", type: "text", placeholder: "dochub" },
                        { label: "Password", key: "password", type: "password", placeholder: synologyConfig ? "Leave blank to keep current" : "DSM password" },
                      ].map(({ label, key, type, placeholder }) => (
                        <div key={key}>
                          <label style={{ fontSize: "12px", color: "var(--color-text-secondary)", display: "block", marginBottom: "3px" }}>{label}</label>
                          <input type={type} placeholder={placeholder} value={(synologyForm as any)[key]} onChange={e => setSynologyForm(f => ({ ...f, [key]: e.target.value }))}
                            style={{ width: "100%", padding: "6px 10px", fontSize: "13px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "7px", background: "var(--color-background-secondary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }} />
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: "16px", marginBottom: "12px" }}>
                      {[
                        { label: "Use HTTPS", key: "useHttps" },
                        { label: "Skip SSL verification (self-signed cert)", key: "skipSslVerify" },
                      ].map(({ label, key }) => (
                        <label key={key} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", cursor: "pointer" }}>
                          <input type="checkbox" checked={(synologyForm as any)[key]} onChange={e => setSynologyForm(f => ({ ...f, [key]: e.target.checked }))} />
                          {label}
                        </label>
                      ))}
                    </div>
                    <button onClick={saveSynology} disabled={savingSynology} style={{ fontSize: "13px", fontWeight: 500, padding: "6px 14px", borderRadius: "7px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>
                      {savingSynology ? "Saving…" : "Save"}
                    </button>
                  </div>
                )}

                {loadingSynology ? (
                  <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>Loading…</div>
                ) : !synologyConfig ? (
                  <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>No Synology config. Hit Configure to add DSM credentials.</div>
                ) : (
                  <>
                    <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", marginBottom: "10px" }}>
                      {synologyConfig.lastSyncedAt ? `Last synced ${new Date(synologyConfig.lastSyncedAt).toLocaleString()}` : "Never synced — hit Sync now"}
                    </div>
                    {synologySyncResult && (
                      <div style={{ fontSize: "12px", marginBottom: "10px", color: synologySyncResult.success ? "#22c55e" : "#ef4444" }}>
                        {synologySyncResult.success ? `Synced — ${synologySyncResult.jobs} job(s) found` : `Error: ${synologySyncResult.error}`}
                      </div>
                    )}
                    {synologyConfig.backupJobs?.length === 0 ? (
                      <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>No backup jobs found. Try syncing.</div>
                    ) : (
                      <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "8px", overflow: "hidden" }}>
                        {synologyConfig.backupJobs?.map((job: any, i: number) => {
                          const resultColor: Record<string, string> = { success: "#22c55e", error: "#ef4444", warning: "#f59e0b", running: "#3d6fff", unfinished: "#94a3b8", none: "#94a3b8" }
                          const color = resultColor[job.lastResult] ?? "#94a3b8"
                          return (
                            <div key={job.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 12px", borderBottom: i < synologyConfig.backupJobs.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none", background: "var(--color-background-primary)" }}>
                              <div>
                                <div style={{ fontSize: "13px", fontWeight: 500 }}>{job.name}</div>
                                <div style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>{job.type === "hyper_backup" ? "Hyper Backup" : "Active Backup"}{job.destination ? ` → ${job.destination}` : ""}</div>
                              </div>
                              <div style={{ textAlign: "right" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "5px", justifyContent: "flex-end" }}>
                                  <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: color }} />
                                  <span style={{ fontSize: "12px", fontWeight: 500, color }}>{job.lastResult ?? "unknown"}</span>
                                </div>
                                {job.lastRunAt && <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", marginTop: "2px" }}>{new Date(job.lastRunAt).toLocaleDateString()}</div>}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </>
                )}
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

            {/* Linked Systems */}
            {((asset.linkedPhoneSystems?.length ?? 0) > 0 || (asset.linkedCameraSystems?.length ?? 0) > 0) && (
              <div style={card}>
                <div style={cardTitle}>Linked Systems</div>
                {asset.linkedPhoneSystems?.map(sys => (
                  <a
                    key={sys.id}
                    href={`/clients/${sys.clientId}?tab=Phone+System`}
                    style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 0", borderBottom: "0.5px solid var(--color-border-tertiary)", textDecoration: "none" }}
                  >
                    <span style={{ fontSize: "12px", color: "var(--color-text-muted)", flexShrink: 0 }}>☎</span>
                    <div>
                      <div style={{ fontSize: "13px", color: "var(--color-accent)" }}>{sys.name}</div>
                      <div style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>Phone System</div>
                    </div>
                  </a>
                ))}
                {asset.linkedCameraSystems?.map(sys => (
                  <a
                    key={sys.id}
                    href={`/clients/${sys.clientId}?tab=Cameras`}
                    style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 0", borderBottom: "0.5px solid var(--color-border-tertiary)", textDecoration: "none" }}
                  >
                    <span style={{ fontSize: "12px", color: "var(--color-text-muted)", flexShrink: 0 }}>📷</span>
                    <div>
                      <div style={{ fontSize: "13px", color: "var(--color-accent)" }}>{sys.name}</div>
                      <div style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>Camera System</div>
                    </div>
                  </a>
                ))}
              </div>
            )}

            {/* Linked Assets */}
            <div style={card}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                <div style={cardTitle}>Linked Assets</div>
                <button onClick={() => setShowAddLink(v => !v)} style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "5px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>
                  {showAddLink ? "Cancel" : "+ Link"}
                </button>
              </div>

              {showAddLink && (
                <div style={{ marginBottom: "12px", padding: "10px", background: "var(--color-background-primary)", borderRadius: "7px", border: "0.5px solid var(--color-border-tertiary)" }}>
                  <div style={{ marginBottom: "6px" }}>
                    <label style={{ fontSize: "11px", color: "var(--color-text-muted)", display: "block", marginBottom: "2px" }}>Search asset</label>
                    <input
                      value={assetSearchQuery}
                      onChange={e => {
                        const v = e.target.value
                        setAssetSearchQuery(v)
                        if (v.length >= 2) searchAssets(v)
                        else setAssetSearchResults([])
                      }}
                      placeholder="Type to search..."
                      style={{ width: "100%", padding: "5px 8px", fontSize: "12px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "6px", background: "var(--color-background-secondary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }}
                    />
                    {assetSearchResults.length > 0 && (
                      <div style={{ maxHeight: "150px", overflowY: "auto", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "6px", marginTop: "4px", background: "var(--color-background-secondary)" }}>
                        {assetSearchResults.map((a: any) => (
                          <div
                            key={a.id}
                            onClick={() => {
                              setLinkForm(f => ({ ...f, linkedAssetId: a.id }))
                              setAssetSearchQuery(a.friendlyName || a.name)
                              setAssetSearchResults([])
                            }}
                            style={{
                              padding: "6px 8px", cursor: "pointer", fontSize: "12px",
                              borderBottom: "0.5px solid var(--color-border-tertiary)",
                              background: linkForm.linkedAssetId === a.id ? "var(--color-background-hover)" : "transparent",
                            }}
                          >
                            <div style={{ fontWeight: 500 }}>{a.friendlyName || a.name}</div>
                            {a.make || a.model ? <div style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>{[a.make, a.model].filter(Boolean).join(" ")}</div> : null}
                          </div>
                        ))}
                      </div>
                    )}
                    {loadingAssetSearch && <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "2px" }}>Searching...</div>}
                  </div>
                  <div style={{ marginBottom: "6px" }}>
                    <label style={{ fontSize: "11px", color: "var(--color-text-muted)", display: "block", marginBottom: "2px" }}>Relation type</label>
                    <select
                      value={linkForm.relationType}
                      onChange={e => setLinkForm(f => ({ ...f, relationType: e.target.value }))}
                      style={{ width: "100%", padding: "5px 8px", fontSize: "12px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "6px", background: "var(--color-background-secondary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }}
                    >
                      <option value="POWERS">Powers</option>
                      <option value="RECORDS_TO">Records to</option>
                      <option value="CONNECTS_TO">Connects to</option>
                      <option value="HOSTS">Hosts</option>
                      <option value="MONITORS">Monitors</option>
                      <option value="BACKS_UP">Backs up</option>
                      <option value="REPLACED_BY">Replaced by</option>
                      <option value="RELATED">Related</option>
                    </select>
                  </div>
                  <div style={{ marginBottom: "6px" }}>
                    <label style={{ fontSize: "11px", color: "var(--color-text-muted)", display: "block", marginBottom: "2px" }}>Notes (optional)</label>
                    <input
                      value={linkForm.notes}
                      onChange={e => setLinkForm(f => ({ ...f, notes: e.target.value }))}
                      placeholder=""
                      style={{ width: "100%", padding: "5px 8px", fontSize: "12px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "6px", background: "var(--color-background-secondary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }}
                    />
                  </div>
                  <button onClick={addAssetLink} disabled={savingLink || !linkForm.linkedAssetId}
                    style={{ fontSize: "12px", fontWeight: 500, padding: "4px 12px", borderRadius: "6px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>
                    {savingLink ? "Saving..." : "Save"}
                  </button>
                </div>
              )}

              {assetLinks.length === 0 && !showAddLink ? (
                <div style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>No linked assets.</div>
              ) : (
                assetLinks.map((link: any, i: number) => {
                  const isFrom = link.assetId === id
                  const other = isFrom ? link.linkedAsset : link.asset
                  const relationLabels: Record<string, [string, string]> = {
                    POWERS: ["Powers", "Powered by"],
                    RECORDS_TO: ["Records to", "Recorded by"],
                    CONNECTS_TO: ["Connects to", "Connected from"],
                    HOSTS: ["Hosts", "Hosted on"],
                    MONITORS: ["Monitors", "Monitored by"],
                    BACKS_UP: ["Backs up", "Backed up by"],
                    REPLACED_BY: ["Replaced by", "Replaces"],
                    RELATED: ["Related to", "Related to"],
                  }
                  const labels = relationLabels[link.relationType] || ["Linked", "Linked"]
                  const label = isFrom ? labels[0] : labels[1]
                  const arrow = isFrom ? " \u2192 " : " \u2190 "

                  return (
                    <div key={link.id} style={{ paddingBottom: "8px", marginBottom: "8px", borderBottom: i < assetLinks.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap" }}>
                            <span style={{ fontSize: "10px", padding: "1px 6px", borderRadius: "3px", background: "var(--color-background-hover)", color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>{label}</span>
                            <a href={`/assets/${other.id}`} style={{ fontSize: "13px", color: "var(--color-accent)", textDecoration: "none", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {other.friendlyName || other.name}
                            </a>
                          </div>
                          {other.ipAddress && (
                            <div style={{ fontSize: "11px", fontFamily: "monospace", color: "var(--color-text-muted)", marginTop: "1px" }}>{other.ipAddress}</div>
                          )}
                          {link.notes && (
                            <div style={{ fontSize: "11px", color: "var(--color-text-muted)", fontStyle: "italic", marginTop: "1px" }}>{link.notes}</div>
                          )}
                        </div>
                        <button onClick={() => removeAssetLink(link.id)}
                          style={{ fontSize: "11px", background: "none", border: "none", cursor: "pointer", color: "var(--color-text-danger, #ef4444)", padding: 0, flexShrink: 0 }}>
                          x
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Documents linked to this asset */}
            {linkedDocuments.length > 0 && (
              <div style={card}>
                <div style={cardTitle}>Documents</div>
                {linkedDocuments.map((doc: any, i: number) => (
                  <div key={doc.id} style={{ paddingBottom: "8px", marginBottom: "8px", borderBottom: i < linkedDocuments.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none" }}>
                    <a href={`/clients/${doc.clientId}?tab=Documents`} style={{ fontSize: "13px", color: "var(--color-accent)", textDecoration: "none", fontWeight: 500 }}>
                      {doc.title}
                    </a>
                    {doc.category && <div style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>{doc.category}</div>}
                  </div>
                ))}
              </div>
            )}

            {/* Licenses linked to this asset */}
            {linkedLicenses.length > 0 && (
              <div style={card}>
                <div style={cardTitle}>Licenses</div>
                {linkedLicenses.map((lic: any, i: number) => (
                  <div key={lic.id} style={{ paddingBottom: "8px", marginBottom: "8px", borderBottom: i < linkedLicenses.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none" }}>
                    <div style={{ fontSize: "13px", fontWeight: 500 }}>{lic.name}</div>
                    {lic.vendor && <div style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>{lic.vendor}</div>}
                  </div>
                ))}
              </div>
            )}

            {/* Applications linked to this asset */}
            {linkedApplications.length > 0 && (
              <div style={card}>
                <div style={cardTitle}>Applications</div>
                {linkedApplications.map((app: any, i: number) => (
                  <div key={app.id} style={{ paddingBottom: "8px", marginBottom: "8px", borderBottom: i < linkedApplications.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none" }}>
                    <div style={{ fontSize: "13px", fontWeight: 500 }}>{app.name}</div>
                    {app.vendor && <div style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>{app.vendor}</div>}
                  </div>
                ))}
              </div>
            )}

            {/* Switch/Router: port table */}
            {asset.networkDevice && (
              <div style={card}>
                <div style={cardTitle}>Switch Ports ({asset.networkDevice.switchPorts.length}{asset.networkDevice.portCount ? ` / ${asset.networkDevice.portCount}` : ""})</div>
                {asset.networkDevice.switchPorts.length === 0 ? (
                  <div style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>No ports configured. Manage ports in the Network tab.</div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                      <thead>
                        <tr style={{ borderBottom: "0.5px solid var(--color-border-tertiary)", textAlign: "left" }}>
                          <th style={{ padding: "4px 8px", color: "var(--color-text-muted)", fontWeight: 500 }}>#</th>
                          <th style={{ padding: "4px 8px", color: "var(--color-text-muted)", fontWeight: 500 }}>Label</th>
                          <th style={{ padding: "4px 8px", color: "var(--color-text-muted)", fontWeight: 500 }}>VLAN</th>
                          <th style={{ padding: "4px 8px", color: "var(--color-text-muted)", fontWeight: 500 }}>PoE</th>
                          <th style={{ padding: "4px 8px", color: "var(--color-text-muted)", fontWeight: 500 }}>Uplink</th>
                          <th style={{ padding: "4px 8px", color: "var(--color-text-muted)", fontWeight: 500 }}>Connected To</th>
                        </tr>
                      </thead>
                      <tbody>
                        {asset.networkDevice.switchPorts.map((port: any) => (
                          <tr key={port.id} style={{ borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                            <td style={{ padding: "4px 8px", fontFamily: "monospace", color: "var(--color-text-secondary)" }}>{port.portNumber}</td>
                            <td style={{ padding: "4px 8px", color: "var(--color-text-primary)" }}>{port.label || "—"}</td>
                            <td style={{ padding: "4px 8px" }}>
                              {port.vlan ? (
                                <span style={{ fontSize: "10px", padding: "1px 6px", borderRadius: "4px", background: port.vlan.color + "22", color: port.vlan.color, fontWeight: 500 }}>
                                  {port.vlan.vlanNumber} {port.vlan.name}
                                </span>
                              ) : "—"}
                            </td>
                            <td style={{ padding: "4px 8px" }}>{port.isPoe ? "✓" : ""}</td>
                            <td style={{ padding: "4px 8px" }}>{port.isUplink ? "✓" : ""}</td>
                            <td style={{ padding: "4px 8px" }}>
                              {port.asset ? (
                                <a href={`/assets/${port.asset.id}`} style={{ color: "var(--color-accent)", textDecoration: "none", fontSize: "12px" }}>
                                  {port.asset.friendlyName || port.asset.name}
                                </a>
                              ) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* NVR/DVR: camera list */}
            {asset.cameraSystemsFull?.length > 0 && asset.cameraSystemsFull.some((s: any) => s.cameras?.length > 0) && (
              <div style={card}>
                <div style={cardTitle}>Cameras</div>
                {asset.cameraSystemsFull.map((sys: any) => (
                  <div key={sys.id}>
                    {asset.cameraSystemsFull.length > 1 && (
                      <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: "6px", marginTop: "4px" }}>{sys.name}</div>
                    )}
                    {sys.cameras.map((cam: any, i: number) => (
                      <div key={cam.id} style={{ paddingBottom: "8px", marginBottom: "8px", borderBottom: i < sys.cameras.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-primary)" }}>{cam.name}</span>
                          {cam.resolution && (
                            <span style={{ fontSize: "10px", padding: "1px 5px", borderRadius: "3px", background: "rgba(99,102,241,0.15)", color: "#6366f1" }}>
                              {cam.resolution}
                            </span>
                          )}
                          {cam.type && cam.type !== "IP_POE" && (
                            <span style={{ fontSize: "10px", padding: "1px 5px", borderRadius: "3px", background: "rgba(148,163,184,0.15)", color: "#94a3b8" }}>
                              {cam.type.replace(/_/g, " ")}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "2px", display: "flex", flexWrap: "wrap", gap: "8px" }}>
                          {cam.location && <span>{cam.location}</span>}
                          {cam.make && cam.model ? <span>{cam.make} {cam.model}</span> : cam.model && <span>{cam.model}</span>}
                          {cam.ipAddress && <span style={{ fontFamily: "monospace" }}>{cam.ipAddress}</span>}
                          {cam.recordingSchedule && <span>Rec: {cam.recordingSchedule.replace(/_/g, "/")}</span>}
                        </div>
                        {cam.coverageNotes && (
                          <div style={{ fontSize: "10px", color: "var(--color-text-muted)", fontStyle: "italic", marginTop: "3px" }}>
                            {cam.coverageNotes}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* TicketHub Tickets linked to this asset */}
            {tickethubTickets.length > 0 && (
              <div style={card}>
                <div style={cardTitle}>TicketHub Tickets</div>
                {tickethubTickets.map((t: any, i: number) => {
                  const statusColors: Record<string, string> = {
                    NEW: "#3b82f6", OPEN: "#2563eb", IN_PROGRESS: "#f59e0b",
                    WAITING_CUSTOMER: "#8b5cf6", WAITING_THIRD_PARTY: "#8b5cf6",
                    RESOLVED: "#10b981", CLOSED: "#6b7280", CANCELLED: "#374151",
                  }
                  const priorityColors: Record<string, string> = {
                    URGENT: "#ef4444", HIGH: "#f97316", MEDIUM: "#3b82f6", LOW: "#6b7280",
                  }
                  const tickethubUrl = (typeof window !== "undefined" ? "" : "") + (process.env.NEXT_PUBLIC_TICKETHUB_URL || "https://tickethub.pcc2k.com")
                  const isClosed = t.status === "CLOSED" || t.status === "CANCELLED" || t.status === "RESOLVED"

                  return (
                    <div key={t.id} style={{ paddingBottom: "8px", marginBottom: "8px", borderBottom: i < tickethubTickets.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none", opacity: isClosed ? 0.6 : 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ fontSize: "10px", fontFamily: "monospace", color: "var(--color-text-muted)" }}>#{t.ticketNumber}</span>
                        <span style={{ fontSize: "9px", padding: "1px 5px", borderRadius: "3px", background: (priorityColors[t.priority] || "#6b7280") + "22", color: priorityColors[t.priority] || "#6b7280", fontWeight: 600 }}>{t.priority}</span>
                        <span style={{ fontSize: "9px", padding: "1px 5px", borderRadius: "3px", background: (statusColors[t.status] || "#6b7280") + "22", color: statusColors[t.status] || "#6b7280" }}>{t.status.replace(/_/g, " ")}</span>
                      </div>
                      <a
                        href={`${tickethubUrl}/tickets/${t.id}`}
                        target="_blank"
                        rel="noopener"
                        style={{ fontSize: "13px", color: "var(--color-accent)", textDecoration: "none", fontWeight: 500, display: "block", marginTop: "2px" }}
                      >
                        {t.title}
                      </a>
                      <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "1px" }}>
                        {new Date(t.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        {t.closedAt && ` — closed ${new Date(t.closedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

          </div>
        </div>
      </div>
    </AppShell>
  )
}
