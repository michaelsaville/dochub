"use client"

import AppShell from "@/components/AppShell"
import { useState, useEffect } from "react"

type AssetType = { id: string; name: string; description: string | null; sortOrder: number }

const inp = {
  width: "100%", padding: "8px 12px", fontSize: "14px",
  border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px",
  background: "var(--color-background-primary)", color: "var(--color-text-primary)",
  boxSizing: "border-box" as const,
}
const lbl = { fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }

const DEFAULT_TYPES = [
  { name: "Computer / Desktop", sortOrder: 1 }, { name: "Laptop", sortOrder: 2 },
  { name: "Server", sortOrder: 3 }, { name: "NAS", sortOrder: 4 },
  { name: "Router", sortOrder: 5 }, { name: "Network Switch", sortOrder: 6 },
  { name: "Access Point", sortOrder: 7 }, { name: "Firewall", sortOrder: 8 },
  { name: "Printer", sortOrder: 9 }, { name: "Tablet", sortOrder: 10 },
  { name: "Phone System", sortOrder: 11 }, { name: "Phone Endpoint", sortOrder: 12 },
  { name: "UPS", sortOrder: 13 }, { name: "Website", sortOrder: 14 },
  { name: "VPN", sortOrder: 15 }, { name: "Other", sortOrder: 99 },
]

const SOURCE_LABELS: Record<string, string> = {
  SYNCRO: "Syncro", UNIFI: "Unifi", MERAKI: "Meraki",
  HPINSTANTON: "HP Instant On", SONICWALL: "SonicWall",
  ITFLOW: "ITFlow", PAX8: "Pax8", PULSEWAY: "Pulseway",
}
const SOURCE_DOMAINS: Record<string, string> = {
  SYNCRO: "syncromsp.com", UNIFI: "ui.com", MERAKI: "meraki.com",
  HPINSTANTON: "arubainstanton.com", SONICWALL: "sonicwall.com",
  ITFLOW: "itflow.org", PAX8: "pax8.com", PULSEWAY: "pulseway.com",
}

type Section = "platform" | "asset-types" | "data-sources" | "syncro" | "unifi" | "meraki" | "hpinstanton" | "sonicwall"

const NAV: { id: Section; label: string; group?: string }[] = [
  { id: "platform", label: "Platform" },
  { id: "asset-types", label: "Asset Types" },
  { id: "data-sources", label: "Data Sources" },
  { id: "syncro", label: "SyncroMSP", group: "Integrations" },
  { id: "unifi", label: "Ubiquiti / Unifi", group: "Integrations" },
  { id: "meraki", label: "Cisco Meraki", group: "Integrations" },
  { id: "hpinstanton", label: "HP Instant On", group: "Integrations" },
  { id: "sonicwall", label: "SonicWall", group: "Integrations" },
]

function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "10px", padding: "20px", marginBottom: "16px" }}>
      <div style={{ fontSize: "15px", fontWeight: 500, marginBottom: description ? "4px" : "16px" }}>{title}</div>
      {description && <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginBottom: "16px" }}>{description}</div>}
      {children}
    </div>
  )
}

function SyncResult({ result }: { result: any }) {
  if (!result) return null
  return (
    <div style={{ marginTop: "12px", padding: "12px 16px", borderRadius: "8px", background: result.success ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)", border: `0.5px solid ${result.success ? "#22c55e44" : "#ef444444"}`, fontSize: "13px" }}>
      {result.success ? (
        <div>
          <div style={{ fontWeight: 500, color: "#22c55e", marginBottom: "4px" }}>Sync complete</div>
          <div style={{ color: "var(--color-text-secondary)" }}>
            {result.devices != null && `${result.devices} devices`}
            {result.clients != null && ` · ${result.clients} clients`}
            {result.assets != null && ` · ${result.assets} assets`}
            {result.sites != null && ` · ${result.sites} sites`}
            {result.networks != null && ` · ${result.networks} networks`}
          </div>
          {result.errors?.length > 0 && <div style={{ marginTop: "6px", color: "#f59e0b", fontSize: "12px" }}>{result.errors.length} error(s) — check logs</div>}
        </div>
      ) : (
        <div style={{ color: "#ef4444" }}>Error: {result.error}</div>
      )}
    </div>
  )
}

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState<Section>("platform")

  // --- Platform ---
  const [domainThreshold, setDomainThreshold] = useState(30)
  const [thresholdInput, setThresholdInput] = useState("30")
  const [savingThreshold, setSavingThreshold] = useState(false)

  // --- Asset Types ---
  const [assetTypes, setAssetTypes] = useState<AssetType[]>([])
  const [loadingTypes, setLoadingTypes] = useState(true)
  const [showAddType, setShowAddType] = useState(false)
  const [typeForm, setTypeForm] = useState({ name: "", description: "", sortOrder: "" })
  const [savingType, setSavingType] = useState(false)
  const [editingType, setEditingType] = useState<string | null>(null)
  const [typeEditForm, setTypeEditForm] = useState<any>({})
  const [seedingDefaults, setSeedingDefaults] = useState(false)

  // --- Data Sources ---
  const [sourceColors, setSourceColors] = useState<Record<string, string>>({
    SYNCRO: "#3b82f6", UNIFI: "#8b5cf6", MERAKI: "#00bcf2", HPINSTANTON: "#01a982",
    SONICWALL: "#f97316", ITFLOW: "#f97316", PAX8: "#10b981", PULSEWAY: "#ec4899",
  })
  const [savingColors, setSavingColors] = useState(false)

  // --- SyncroMSP ---
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<any>(null)

  // --- Integration config (generic) ---
  const [integrationConfig, setIntegrationConfig] = useState<Record<string, string>>({})
  const [savingIntegration, setSavingIntegration] = useState(false)

  // --- Unifi ---
  const [unifiSites, setUnifiSites] = useState<{ id: string; name: string }[]>([])
  const [loadingUnifiSites, setLoadingUnifiSites] = useState(false)
  const [unifiSiteMap, setUnifiSiteMap] = useState<Record<string, string>>({})
  const [unifiSyncing, setUnifiSyncing] = useState(false)
  const [unifiSyncResult, setUnifiSyncResult] = useState<any>(null)

  // --- Meraki ---
  const [merakiNetworks, setMerakiNetworks] = useState<{ id: string; name: string }[]>([])
  const [merakiOrgs, setMerakiOrgs] = useState<{ id: string; name: string }[]>([])
  const [loadingMerakiNetworks, setLoadingMerakiNetworks] = useState(false)
  const [merakiNetworkMap, setMerakiNetworkMap] = useState<Record<string, string>>({})
  const [merakiSyncing, setMerakiSyncing] = useState(false)
  const [merakiSyncResult, setMerakiSyncResult] = useState<any>(null)

  // --- HP Instant On ---
  const [hpSites, setHpSites] = useState<{ id: string; name: string }[]>([])
  const [loadingHpSites, setLoadingHpSites] = useState(false)
  const [hpSiteMap, setHpSiteMap] = useState<Record<string, string>>({})
  const [hpSyncing, setHpSyncing] = useState(false)
  const [hpSyncResult, setHpSyncResult] = useState<any>(null)

  // --- SonicWall ---
  const [sonicwallDevices, setSonicwallDevices] = useState<{ host: string; username: string; password: string; clientId: string; name: string }[]>([])
  const [sonicwallSyncing, setSonicwallSyncing] = useState(false)
  const [sonicwallSyncResult, setSonicwallSyncResult] = useState<any>(null)
  const [showAddSonicwall, setShowAddSonicwall] = useState(false)
  const [sonicwallForm, setSonicwallForm] = useState({ host: "", username: "", password: "", clientId: "", name: "" })

  // --- Shared clients list for mapping ---
  const [clientsList, setClientsList] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    fetchAssetTypes()
    fetch("/api/settings/domain-threshold").then(r => r.json()).then(d => { setDomainThreshold(d.days); setThresholdInput(String(d.days)) }).catch(() => {})
    fetch("/api/settings/source-colors").then(r => r.json()).then(setSourceColors).catch(() => {})
    fetch("/api/settings/integrations").then(r => r.json()).then((d: Record<string, string>) => {
      setIntegrationConfig(d)
      if (d["integration:unifi:siteMap"]) { try { setUnifiSiteMap(JSON.parse(d["integration:unifi:siteMap"])) } catch {} }
      if (d["integration:meraki:networkMap"]) { try { setMerakiNetworkMap(JSON.parse(d["integration:meraki:networkMap"])) } catch {} }
      if (d["integration:hpinstanton:siteMap"]) { try { setHpSiteMap(JSON.parse(d["integration:hpinstanton:siteMap"])) } catch {} }
      if (d["integration:sonicwall:devices"]) { try { setSonicwallDevices(JSON.parse(d["integration:sonicwall:devices"])) } catch {} }
    }).catch(() => {})
    fetch("/api/clients").then(r => r.json()).then((cs: any[]) => setClientsList(cs.map(c => ({ id: c.id, name: c.name })))).catch(() => {})
  }, [])

  function cfg(key: string, fallback = "") { return integrationConfig[key] ?? fallback }
  function setCfg(key: string, value: string) { setIntegrationConfig(c => ({ ...c, [key]: value })) }

  async function saveIntegration(keys: string[], extraData?: Record<string, string>) {
    setSavingIntegration(true)
    try {
      const body: Record<string, string> = {}
      for (const k of keys) body[k] = integrationConfig[k] ?? ""
      if (extraData) Object.assign(body, extraData)
      await fetch("/api/settings/integrations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    } finally { setSavingIntegration(false) }
  }

  // Platform
  async function saveThreshold() {
    setSavingThreshold(true)
    try {
      const res = await fetch("/api/settings/domain-threshold", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ days: thresholdInput }) })
      if (res.ok) { const d = await res.json(); setDomainThreshold(d.days); setThresholdInput(String(d.days)) }
    } finally { setSavingThreshold(false) }
  }

  // Asset Types
  async function fetchAssetTypes() { setLoadingTypes(true); try { const r = await fetch("/api/asset-types"); setAssetTypes(await r.json()) } catch {} finally { setLoadingTypes(false) } }
  async function saveType() {
    if (!typeForm.name.trim()) return
    setSavingType(true)
    try {
      const r = await fetch("/api/asset-types", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(typeForm) })
      if (r.ok) { const t = await r.json(); setAssetTypes(prev => [...prev, t].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))); setTypeForm({ name: "", description: "", sortOrder: "" }); setShowAddType(false) }
    } finally { setSavingType(false) }
  }
  async function updateType(id: string) {
    try {
      const r = await fetch(`/api/asset-types/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(typeEditForm) })
      if (r.ok) { const updated = await r.json(); setAssetTypes(prev => prev.map(x => x.id === id ? updated : x).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))); setEditingType(null) }
    } catch {}
  }
  async function deleteType(id: string) {
    if (!confirm("Remove this asset type?")) return
    await fetch(`/api/asset-types/${id}`, { method: "DELETE" })
    setAssetTypes(prev => prev.filter(x => x.id !== id))
  }
  async function seedDefaults() {
    setSeedingDefaults(true)
    try {
      const existing = new Set(assetTypes.map(t => t.name.toLowerCase()))
      const created: AssetType[] = []
      for (const t of DEFAULT_TYPES.filter(d => !existing.has(d.name.toLowerCase()))) {
        const r = await fetch("/api/asset-types", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(t) })
        if (r.ok) created.push(await r.json())
      }
      setAssetTypes(prev => [...prev, ...created].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)))
    } finally { setSeedingDefaults(false) }
  }

  // Data Sources
  async function saveSourceColors() {
    setSavingColors(true)
    try { const r = await fetch("/api/settings/source-colors", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sourceColors) }); if (r.ok) setSourceColors(await r.json()) } finally { setSavingColors(false) }
  }

  // SyncroMSP
  async function runSyncroSync() {
    setSyncing(true); setSyncResult(null)
    try { const r = await fetch("/api/sync/syncro", { method: "POST" }); setSyncResult(await r.json()) } catch { setSyncResult({ success: false, error: "Network error" }) } finally { setSyncing(false) }
  }

  // Unifi
  async function loadUnifiSites() {
    setLoadingUnifiSites(true); setUnifiSites([])
    try {
      // Save credentials first
      await saveIntegration(["integration:unifi:url", "integration:unifi:username", "integration:unifi:password", "integration:unifi:controllerType"])
      const r = await fetch("/api/integrations/unifi/sites")
      const data = await r.json()
      if (!r.ok) { alert(data.error || "Failed to load sites"); return }
      setUnifiSites(data)
    } finally { setLoadingUnifiSites(false) }
  }
  async function saveUnifiMapping() {
    await saveIntegration([], { "integration:unifi:siteMap": JSON.stringify(unifiSiteMap) })
    alert("Mapping saved")
  }
  async function runUnifiSync() {
    setUnifiSyncing(true); setUnifiSyncResult(null)
    try { const r = await fetch("/api/integrations/unifi/sync", { method: "POST" }); setUnifiSyncResult(await r.json()) } finally { setUnifiSyncing(false) }
  }

  // Meraki
  async function loadMerakiNetworks() {
    setLoadingMerakiNetworks(true); setMerakiNetworks([]); setMerakiOrgs([])
    try {
      await saveIntegration(["integration:meraki:apiKey", "integration:meraki:orgId"])
      const r = await fetch("/api/integrations/meraki/networks")
      const data = await r.json()
      if (!r.ok) { alert(data.error || "Failed"); return }
      if (data.needsOrgSelection) { setMerakiOrgs(data.orgs) } else { setMerakiNetworks(data) }
    } finally { setLoadingMerakiNetworks(false) }
  }
  async function saveMerakiMapping() {
    await saveIntegration([], { "integration:meraki:networkMap": JSON.stringify(merakiNetworkMap) })
    alert("Mapping saved")
  }
  async function runMerakiSync() {
    setMerakiSyncing(true); setMerakiSyncResult(null)
    try { const r = await fetch("/api/integrations/meraki/sync", { method: "POST" }); setMerakiSyncResult(await r.json()) } finally { setMerakiSyncing(false) }
  }

  // HP Instant On
  async function loadHpSites() {
    setLoadingHpSites(true); setHpSites([])
    try {
      await saveIntegration(["integration:hpinstanton:bearerToken"])
      const r = await fetch("/api/integrations/hpinstanton/sites")
      const data = await r.json()
      if (!r.ok) { alert(data.error || "Failed"); return }
      setHpSites(data)
    } finally { setLoadingHpSites(false) }
  }
  async function saveHpMapping() {
    await saveIntegration([], { "integration:hpinstanton:siteMap": JSON.stringify(hpSiteMap) })
    alert("Mapping saved")
  }
  async function runHpSync() {
    setHpSyncing(true); setHpSyncResult(null)
    try { const r = await fetch("/api/integrations/hpinstanton/sync", { method: "POST" }); setHpSyncResult(await r.json()) } finally { setHpSyncing(false) }
  }

  // SonicWall
  function addSonicwallDevice() {
    if (!sonicwallForm.host.trim() || !sonicwallForm.username.trim() || !sonicwallForm.clientId) return
    const updated = [...sonicwallDevices, { ...sonicwallForm }]
    setSonicwallDevices(updated)
    setSonicwallForm({ host: "", username: "", password: "", clientId: "", name: "" })
    setShowAddSonicwall(false)
    saveIntegration([], { "integration:sonicwall:devices": JSON.stringify(updated) })
  }
  function removeSonicwallDevice(i: number) {
    const updated = sonicwallDevices.filter((_, idx) => idx !== i)
    setSonicwallDevices(updated)
    saveIntegration([], { "integration:sonicwall:devices": JSON.stringify(updated) })
  }
  async function runSonicwallSync() {
    setSonicwallSyncing(true); setSonicwallSyncResult(null)
    try { const r = await fetch("/api/integrations/sonicwall/sync", { method: "POST" }); setSonicwallSyncResult(await r.json()) } finally { setSonicwallSyncing(false) }
  }

  const saveBtn = (onClick: () => void, saving: boolean, label = "Save", savingLabel = "Saving...") => (
    <button onClick={onClick} disabled={saving} style={{ fontSize: "14px", fontWeight: 500, padding: "8px 16px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1 }}>
      {saving ? savingLabel : label}
    </button>
  )

  const currentGroup = NAV.find(n => n.id === activeSection)?.group

  return (
    <AppShell>
      <div style={{ padding: "32px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 500, marginBottom: "4px" }}>Settings</h1>
        <p style={{ fontSize: "14px", color: "var(--color-text-secondary)", marginBottom: "28px" }}>Platform configuration and integrations</p>

        <div style={{ display: "flex", gap: "32px", alignItems: "flex-start" }}>
          {/* Sidebar */}
          <div style={{ width: "190px", flexShrink: 0 }}>
            {(() => {
              let lastGroup: string | undefined = "__none__"
              return NAV.map(n => {
                const showGroupHeader = n.group !== lastGroup
                lastGroup = n.group
                return (
                  <div key={n.id}>
                    {showGroupHeader && n.group && (
                      <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", padding: "12px 0 4px" }}>
                        {n.group}
                      </div>
                    )}
                    <button
                      onClick={() => setActiveSection(n.id)}
                      style={{
                        display: "block", width: "100%", textAlign: "left",
                        padding: "7px 10px", borderRadius: "7px",
                        fontSize: "13px", border: "none", cursor: "pointer",
                        background: activeSection === n.id ? "var(--color-background-hover)" : "transparent",
                        color: activeSection === n.id ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                        fontWeight: activeSection === n.id ? 500 : 400,
                        marginBottom: "2px",
                      }}
                    >
                      {n.label}
                    </button>
                  </div>
                )
              })
            })()}
          </div>

          {/* Content */}
          <div style={{ flex: 1, minWidth: 0, maxWidth: "680px" }}>

            {/* ── Platform ── */}
            {activeSection === "platform" && (
              <>
                <SectionCard title="Appearance">
                  <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>DocHub uses the PCC dark theme. Single dark mode — no light mode.</div>
                </SectionCard>
                <SectionCard title="Domain Monitoring" description="Raise an alarm when a client domain expires within the threshold period.">
                  <div style={{ display: "flex", alignItems: "flex-end", gap: "12px" }}>
                    <div style={{ width: "140px" }}>
                      <label style={lbl}>Alert threshold (days)</label>
                      <input type="number" min={1} max={365} value={thresholdInput} onChange={e => setThresholdInput(e.target.value)} style={inp} />
                    </div>
                    {saveBtn(saveThreshold, savingThreshold)}
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "10px" }}>
                    Currently alerting when a domain expires within <strong style={{ color: "var(--color-text-secondary)" }}>{domainThreshold} days</strong>.
                    Cron: <code style={{ fontFamily: "monospace" }}>GET /api/cron/domains</code>
                  </div>
                </SectionCard>
              </>
            )}

            {/* ── Asset Types ── */}
            {activeSection === "asset-types" && (
              <SectionCard title="Asset Types" description="Custom asset types used when creating or editing assets manually.">
                <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
                  {assetTypes.length === 0 && !loadingTypes && (
                    <button onClick={seedDefaults} disabled={seedingDefaults} style={{ fontSize: "13px", padding: "6px 12px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: "pointer", color: "var(--color-text-secondary)" }}>
                      {seedingDefaults ? "Adding..." : "Add defaults"}
                    </button>
                  )}
                  <button onClick={() => setShowAddType(true)} style={{ fontSize: "13px", padding: "6px 12px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: "pointer" }}>
                    Add type
                  </button>
                </div>

                {showAddType && (
                  <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", padding: "16px", marginBottom: "12px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px", gap: "10px", marginBottom: "10px" }}>
                      <div style={{ gridColumn: "1 / 3" }}><label style={lbl}>Name *</label><input value={typeForm.name} onChange={e => setTypeForm(f => ({ ...f, name: e.target.value }))} style={inp} placeholder="e.g. Router" /></div>
                      <div><label style={lbl}>Order</label><input value={typeForm.sortOrder} onChange={e => setTypeForm(f => ({ ...f, sortOrder: e.target.value }))} style={inp} placeholder="0" type="number" /></div>
                      <div style={{ gridColumn: "1 / -1" }}><label style={lbl}>Description</label><input value={typeForm.description} onChange={e => setTypeForm(f => ({ ...f, description: e.target.value }))} style={inp} /></div>
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      {saveBtn(saveType, savingType, "Save", "Saving...")}
                      <button onClick={() => setShowAddType(false)} style={{ fontSize: "13px", padding: "6px 14px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>Cancel</button>
                    </div>
                  </div>
                )}

                {loadingTypes ? (
                  <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>Loading...</div>
                ) : assetTypes.length === 0 ? (
                  <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>No asset types yet.</div>
                ) : (
                  <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "8px", overflow: "hidden" }}>
                    {assetTypes.map((type, i) => editingType === type.id ? (
                      <div key={type.id} style={{ padding: "12px 14px", borderBottom: i < assetTypes.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none", background: "var(--color-background-primary)" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px", gap: "8px", marginBottom: "8px" }}>
                          <div style={{ gridColumn: "1 / 3" }}><label style={lbl}>Name</label><input value={typeEditForm.name ?? ""} onChange={e => setTypeEditForm((f: any) => ({ ...f, name: e.target.value }))} style={inp} /></div>
                          <div><label style={lbl}>Order</label><input type="number" value={typeEditForm.sortOrder ?? 0} onChange={e => setTypeEditForm((f: any) => ({ ...f, sortOrder: e.target.value }))} style={inp} /></div>
                          <div style={{ gridColumn: "1 / -1" }}><label style={lbl}>Description</label><input value={typeEditForm.description ?? ""} onChange={e => setTypeEditForm((f: any) => ({ ...f, description: e.target.value }))} style={inp} /></div>
                        </div>
                        <div style={{ display: "flex", gap: "8px" }}>
                          <button onClick={() => updateType(type.id)} style={{ fontSize: "12px", fontWeight: 500, padding: "5px 12px", borderRadius: "6px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>Save</button>
                          <button onClick={() => setEditingType(null)} style={{ fontSize: "12px", padding: "5px 12px", borderRadius: "6px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div key={type.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: i < assetTypes.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none", background: "var(--color-background-primary)" }}>
                        <div>
                          <div style={{ fontSize: "14px" }}>{type.name}</div>
                          {type.description && <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "1px" }}>{type.description}</div>}
                        </div>
                        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                          <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>#{type.sortOrder}</span>
                          <button onClick={() => { setEditingType(type.id); setTypeEditForm({ ...type }) }} style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Edit</button>
                          <button onClick={() => deleteType(type.id)} style={{ fontSize: "12px", color: "var(--color-text-danger)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Remove</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            )}

            {/* ── Data Sources ── */}
            {activeSection === "data-sources" && (
              <SectionCard title="Data Source Badge Colors" description="Color of the source badge shown on assets, credentials, licenses, and network devices.">
                <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginBottom: "16px" }}>
                  {Object.entries(SOURCE_LABELS).map(([key, label]) => {
                    const color = sourceColors[key] ?? "#64748b"
                    const domain = SOURCE_DOMAINS[key]
                    return (
                      <div key={key} style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "28px", height: "28px", borderRadius: "5px", border: `1px solid ${color}55`, background: "rgba(255,255,255,0.07)", overflow: "hidden", flexShrink: 0, boxShadow: `0 0 0 1px ${color}22` }}>
                          {domain
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`} width={20} height={20} alt={label} style={{ display: "block" }} />
                            : <span style={{ fontSize: "11px", fontWeight: 700, color }}>{label[0]}</span>}
                        </span>
                        <span style={{ fontSize: "13px", color: "var(--color-text-primary)", width: "110px" }}>{label}</span>
                        <input type="color" value={color} onChange={e => setSourceColors(c => ({ ...c, [key]: e.target.value }))} style={{ width: "36px", height: "28px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "6px", cursor: "pointer", padding: "1px 2px", background: "var(--color-background-primary)" }} />
                        <span style={{ fontSize: "11px", color: "var(--color-text-muted)", fontFamily: "monospace" }}>{color}</span>
                      </div>
                    )
                  })}
                </div>
                {saveBtn(saveSourceColors, savingColors, "Save colors")}
              </SectionCard>
            )}

            {/* ── SyncroMSP ── */}
            {activeSection === "syncro" && (
              <SectionCard title="SyncroMSP" description="Sync all customers, assets, and contacts from Syncro. Existing records will be updated. Credentials are configured via environment variables.">
                <button onClick={runSyncroSync} disabled={syncing} style={{ fontSize: "14px", fontWeight: 500, padding: "8px 16px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: syncing ? "not-allowed" : "pointer", color: "var(--color-text-primary)", opacity: syncing ? 0.6 : 1 }}>
                  {syncing ? "Syncing... this may take a minute" : "Run Syncro sync"}
                </button>
                <SyncResult result={syncResult} />
              </SectionCard>
            )}

            {/* ── Unifi ── */}
            {activeSection === "unifi" && (
              <>
                <SectionCard title="Ubiquiti / Unifi — Credentials" description="Connect to your Unifi Network Application or UniFi OS controller. Self-signed certificates are supported.">
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label style={lbl}>Controller URL</label>
                      <input value={cfg("integration:unifi:url")} onChange={e => setCfg("integration:unifi:url", e.target.value)} placeholder="https://192.168.1.1 or https://unifi.example.com:8443" style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>Username</label>
                      <input value={cfg("integration:unifi:username")} onChange={e => setCfg("integration:unifi:username", e.target.value)} style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>Password</label>
                      <input type="password" value={cfg("integration:unifi:password")} onChange={e => setCfg("integration:unifi:password", e.target.value)} style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>Controller type</label>
                      <select value={cfg("integration:unifi:controllerType", "unifi_os")} onChange={e => setCfg("integration:unifi:controllerType", e.target.value)} style={inp}>
                        <option value="unifi_os">UniFi OS (UDM / UDR / Cloud Key Gen2+)</option>
                        <option value="network_application">Network Application (standalone, port 8443)</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button onClick={loadUnifiSites} disabled={loadingUnifiSites} style={{ fontSize: "14px", fontWeight: 500, padding: "8px 16px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: loadingUnifiSites ? "not-allowed" : "pointer", color: "var(--color-text-primary)", opacity: loadingUnifiSites ? 0.6 : 1 }}>
                      {loadingUnifiSites ? "Connecting..." : "Load sites"}
                    </button>
                  </div>
                </SectionCard>

                {unifiSites.length > 0 && (
                  <SectionCard title="Site → Client Mapping" description="Map each Unifi site to a DocHub client. Only mapped sites will be synced.">
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "14px" }}>
                      {unifiSites.map(site => (
                        <div key={site.id} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                          <div style={{ width: "200px", flexShrink: 0 }}>
                            <div style={{ fontSize: "13px", fontWeight: 500 }}>{site.name}</div>
                            <div style={{ fontSize: "11px", color: "var(--color-text-muted)", fontFamily: "monospace" }}>{site.id}</div>
                          </div>
                          <select
                            value={unifiSiteMap[site.id] ?? ""}
                            onChange={e => setUnifiSiteMap(m => ({ ...m, [site.id]: e.target.value }))}
                            style={{ flex: 1, ...inp }}
                          >
                            <option value="">— skip this site —</option>
                            {clientsList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button onClick={saveUnifiMapping} style={{ fontSize: "14px", fontWeight: 500, padding: "8px 16px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>
                        Save mapping
                      </button>
                      <button onClick={runUnifiSync} disabled={unifiSyncing} style={{ fontSize: "14px", padding: "8px 16px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: unifiSyncing ? "not-allowed" : "pointer", color: "var(--color-text-primary)", opacity: unifiSyncing ? 0.6 : 1 }}>
                        {unifiSyncing ? "Syncing..." : "Run sync"}
                      </button>
                    </div>
                    <SyncResult result={unifiSyncResult} />
                  </SectionCard>
                )}

                {unifiSites.length === 0 && Object.keys(unifiSiteMap).length > 0 && (
                  <SectionCard title="Sync">
                    <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginBottom: "12px" }}>Site mapping is saved. Click to sync devices from all mapped sites.</p>
                    <button onClick={runUnifiSync} disabled={unifiSyncing} style={{ fontSize: "14px", padding: "8px 16px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: unifiSyncing ? "not-allowed" : "pointer", color: "var(--color-text-primary)", opacity: unifiSyncing ? 0.6 : 1 }}>
                      {unifiSyncing ? "Syncing..." : "Run Unifi sync"}
                    </button>
                    <SyncResult result={unifiSyncResult} />
                  </SectionCard>
                )}
              </>
            )}

            {/* ── Meraki ── */}
            {activeSection === "meraki" && (
              <>
                <SectionCard title="Cisco Meraki — Credentials" description="Connect using your Meraki Dashboard API key. Generate one at dashboard.meraki.com → Profile → API access.">
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label style={lbl}>API Key</label>
                      <input value={cfg("integration:meraki:apiKey")} onChange={e => setCfg("integration:meraki:apiKey", e.target.value)} placeholder="40-character hex string" style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>Organization ID <span style={{ fontWeight: 400, color: "var(--color-text-muted)" }}>(leave blank to list all)</span></label>
                      <input value={cfg("integration:meraki:orgId")} onChange={e => setCfg("integration:meraki:orgId", e.target.value)} placeholder="auto-detect" style={inp} />
                    </div>
                  </div>
                  <button onClick={loadMerakiNetworks} disabled={loadingMerakiNetworks} style={{ fontSize: "14px", fontWeight: 500, padding: "8px 16px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: loadingMerakiNetworks ? "not-allowed" : "pointer", color: "var(--color-text-primary)", opacity: loadingMerakiNetworks ? 0.6 : 1 }}>
                    {loadingMerakiNetworks ? "Connecting..." : "Load networks"}
                  </button>
                </SectionCard>

                {merakiOrgs.length > 0 && (
                  <SectionCard title="Select Organization">
                    <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginBottom: "12px" }}>Multiple organizations found. Select one and click Load networks again.</p>
                    <select value={cfg("integration:meraki:orgId")} onChange={e => setCfg("integration:meraki:orgId", e.target.value)} style={{ ...inp, maxWidth: "360px" }}>
                      <option value="">Select organization...</option>
                      {merakiOrgs.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </SectionCard>
                )}

                {merakiNetworks.length > 0 && (
                  <SectionCard title="Network → Client Mapping" description="Map each Meraki network to a DocHub client.">
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "14px" }}>
                      {merakiNetworks.map(net => (
                        <div key={net.id} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                          <div style={{ width: "200px", flexShrink: 0 }}>
                            <div style={{ fontSize: "13px", fontWeight: 500 }}>{net.name}</div>
                            <div style={{ fontSize: "11px", color: "var(--color-text-muted)", fontFamily: "monospace" }}>{net.id}</div>
                          </div>
                          <select value={merakiNetworkMap[net.id] ?? ""} onChange={e => setMerakiNetworkMap(m => ({ ...m, [net.id]: e.target.value }))} style={{ flex: 1, ...inp }}>
                            <option value="">— skip —</option>
                            {clientsList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button onClick={saveMerakiMapping} style={{ fontSize: "14px", fontWeight: 500, padding: "8px 16px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>Save mapping</button>
                      <button onClick={runMerakiSync} disabled={merakiSyncing} style={{ fontSize: "14px", padding: "8px 16px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: merakiSyncing ? "not-allowed" : "pointer", color: "var(--color-text-primary)", opacity: merakiSyncing ? 0.6 : 1 }}>
                        {merakiSyncing ? "Syncing..." : "Run sync"}
                      </button>
                    </div>
                    <SyncResult result={merakiSyncResult} />
                  </SectionCard>
                )}

                {merakiNetworks.length === 0 && Object.keys(merakiNetworkMap).length > 0 && (
                  <SectionCard title="Sync">
                    <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginBottom: "12px" }}>Network mapping is saved.</p>
                    <button onClick={runMerakiSync} disabled={merakiSyncing} style={{ fontSize: "14px", padding: "8px 16px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: "pointer", color: "var(--color-text-primary)" }}>
                      {merakiSyncing ? "Syncing..." : "Run Meraki sync"}
                    </button>
                    <SyncResult result={merakiSyncResult} />
                  </SectionCard>
                )}
              </>
            )}

            {/* ── HP Instant On ── */}
            {activeSection === "hpinstanton" && (
              <>
                <SectionCard title="HP Instant On — Bearer Token" description="Paste your HP Instant On API bearer token. Obtain it from the Instant On mobile app developer tools, or via the Aruba Instant On API portal at api.arubainstanton.com.">
                  <div style={{ marginBottom: "12px" }}>
                    <label style={lbl}>Bearer Token</label>
                    <input type="password" value={cfg("integration:hpinstanton:bearerToken")} onChange={e => setCfg("integration:hpinstanton:bearerToken", e.target.value)} placeholder="eyJ..." style={inp} />
                    <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "6px" }}>
                      The HP Instant On API uses OAuth2. To get a token: open the Instant On app → developer tools → copy the Bearer token from any API request.
                    </div>
                  </div>
                  <button onClick={loadHpSites} disabled={loadingHpSites} style={{ fontSize: "14px", fontWeight: 500, padding: "8px 16px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: loadingHpSites ? "not-allowed" : "pointer", color: "var(--color-text-primary)", opacity: loadingHpSites ? 0.6 : 1 }}>
                    {loadingHpSites ? "Connecting..." : "Load sites"}
                  </button>
                </SectionCard>

                {hpSites.length > 0 && (
                  <SectionCard title="Site → Client Mapping">
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "14px" }}>
                      {hpSites.map(site => (
                        <div key={site.id} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                          <div style={{ width: "200px", flexShrink: 0 }}>
                            <div style={{ fontSize: "13px", fontWeight: 500 }}>{site.name}</div>
                            <div style={{ fontSize: "11px", color: "var(--color-text-muted)", fontFamily: "monospace" }}>{site.id}</div>
                          </div>
                          <select value={hpSiteMap[site.id] ?? ""} onChange={e => setHpSiteMap(m => ({ ...m, [site.id]: e.target.value }))} style={{ flex: 1, ...inp }}>
                            <option value="">— skip —</option>
                            {clientsList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button onClick={saveHpMapping} style={{ fontSize: "14px", fontWeight: 500, padding: "8px 16px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>Save mapping</button>
                      <button onClick={runHpSync} disabled={hpSyncing} style={{ fontSize: "14px", padding: "8px 16px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: hpSyncing ? "not-allowed" : "pointer", color: "var(--color-text-primary)", opacity: hpSyncing ? 0.6 : 1 }}>
                        {hpSyncing ? "Syncing..." : "Run sync"}
                      </button>
                    </div>
                    <SyncResult result={hpSyncResult} />
                  </SectionCard>
                )}

                {hpSites.length === 0 && Object.keys(hpSiteMap).length > 0 && (
                  <SectionCard title="Sync">
                    <button onClick={runHpSync} disabled={hpSyncing} style={{ fontSize: "14px", padding: "8px 16px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: "pointer", color: "var(--color-text-primary)" }}>
                      {hpSyncing ? "Syncing..." : "Run HP Instant On sync"}
                    </button>
                    <SyncResult result={hpSyncResult} />
                  </SectionCard>
                )}
              </>
            )}

            {/* ── SonicWall ── */}
            {activeSection === "sonicwall" && (
              <SectionCard title="SonicWall" description="Connect to individual SonicWall appliances via the SonicOS REST API (firmware 6.5.4+). Each device is configured separately.">
                {sonicwallDevices.length > 0 && (
                  <div style={{ marginBottom: "16px" }}>
                    <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "8px", overflow: "hidden", marginBottom: "10px" }}>
                      {sonicwallDevices.map((d, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 14px", borderBottom: i < sonicwallDevices.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none", background: "var(--color-background-primary)" }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: "13px", fontWeight: 500 }}>{d.name || d.host}</div>
                            <div style={{ fontSize: "11px", color: "var(--color-text-muted)", fontFamily: "monospace" }}>{d.host} · {d.username}</div>
                            <div style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
                              Client: {clientsList.find(c => c.id === d.clientId)?.name ?? d.clientId}
                            </div>
                          </div>
                          <button onClick={() => removeSonicwallDevice(i)} style={{ fontSize: "12px", color: "var(--color-text-danger)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Remove</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {showAddSonicwall ? (
                  <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", padding: "16px", marginBottom: "12px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
                      <div style={{ gridColumn: "1 / -1" }}>
                        <label style={lbl}>Management URL</label>
                        <input value={sonicwallForm.host} onChange={e => setSonicwallForm(f => ({ ...f, host: e.target.value }))} placeholder="https://192.168.1.1" style={inp} />
                      </div>
                      <div>
                        <label style={lbl}>Username</label>
                        <input value={sonicwallForm.username} onChange={e => setSonicwallForm(f => ({ ...f, username: e.target.value }))} placeholder="admin" style={inp} />
                      </div>
                      <div>
                        <label style={lbl}>Password</label>
                        <input type="password" value={sonicwallForm.password} onChange={e => setSonicwallForm(f => ({ ...f, password: e.target.value }))} style={inp} />
                      </div>
                      <div>
                        <label style={lbl}>Friendly Name</label>
                        <input value={sonicwallForm.name} onChange={e => setSonicwallForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. ACME Firewall" style={inp} />
                      </div>
                      <div>
                        <label style={lbl}>Client</label>
                        <select value={sonicwallForm.clientId} onChange={e => setSonicwallForm(f => ({ ...f, clientId: e.target.value }))} style={inp}>
                          <option value="">Select client...</option>
                          {clientsList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button onClick={addSonicwallDevice} style={{ fontSize: "13px", fontWeight: 500, padding: "6px 14px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>Add device</button>
                      <button onClick={() => setShowAddSonicwall(false)} style={{ fontSize: "13px", padding: "6px 14px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: "8px", marginBottom: sonicwallDevices.length ? "0" : "0" }}>
                    <button onClick={() => setShowAddSonicwall(true)} style={{ fontSize: "13px", padding: "6px 12px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: "pointer", color: "var(--color-text-primary)" }}>
                      Add device
                    </button>
                    {sonicwallDevices.length > 0 && (
                      <button onClick={runSonicwallSync} disabled={sonicwallSyncing} style={{ fontSize: "13px", padding: "6px 12px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: sonicwallSyncing ? "not-allowed" : "pointer", color: "var(--color-text-primary)", opacity: sonicwallSyncing ? 0.6 : 1 }}>
                        {sonicwallSyncing ? "Syncing..." : "Run sync"}
                      </button>
                    )}
                  </div>
                )}
                <SyncResult result={sonicwallSyncResult} />
                <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "12px" }}>
                  Requires SonicOS 6.5.4+ with REST API enabled. Enable at Device → Administration → Management → REST API.
                </div>
              </SectionCard>
            )}

          </div>
        </div>
      </div>
    </AppShell>
  )
}
