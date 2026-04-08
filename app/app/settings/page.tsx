"use client"

import AppShell from "@/components/AppShell"
import { useState, useEffect } from "react"
import { THEMES, useTheme, type ThemeId } from "@/components/ThemeProvider"

type AssetTypeTemplate = {
  standardFields: string[]
  showSwitchPanel: boolean
  showCameraPhoto: boolean
  customFieldDefs: { key: string; label: string; type: string; required: boolean }[]
}
type AssetType = { id: string; name: string; description: string | null; sortOrder: number; template: AssetTypeTemplate | null }

const ALL_STANDARD_FIELDS = [
  { key: "friendlyName",    label: "Friendly Name" },
  { key: "make",            label: "Make" },
  { key: "model",           label: "Model" },
  { key: "serial",          label: "Serial Number" },
  { key: "assetTag",        label: "Asset Tag" },
  { key: "ipAddress",       label: "IP Address" },
  { key: "macAddress",      label: "MAC Address" },
  { key: "vlan",            label: "VLAN" },
  { key: "switchPort",      label: "Switch Port" },
  { key: "managementUrl",   label: "Management URL" },
  { key: "splashtopUrl",    label: "Splashtop URL" },
  { key: "driverUrl",       label: "Driver URL" },
  { key: "rdpEnabled",      label: "RDP" },
  { key: "vncEnabled",      label: "VNC" },
  { key: "firmwareVersion", label: "Firmware Version" },
  { key: "portCount",       label: "Port Count" },
  { key: "os",              label: "Operating System" },
  { key: "ram",             label: "RAM" },
  { key: "cpu",             label: "CPU / Processor" },
  { key: "storageCapacity", label: "Storage Capacity" },
  { key: "purchaseDate",    label: "Purchase Date" },
  { key: "warrantyExpiry",  label: "Warranty Expiry" },
  { key: "room",            label: "Room / Location" },
  { key: "primaryUserId",   label: "Primary User" },
  { key: "contactId",       label: "Contact" },
  { key: "notes",           label: "Notes" },
]

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
  SONICWALL: "SonicWall",
  ITFLOW: "ITFlow", PAX8: "Pax8", PULSEWAY: "Pulseway",
}
const SOURCE_DOMAINS: Record<string, string> = {
  SYNCRO: "syncromsp.com", UNIFI: "ui.com", MERAKI: "meraki.com",
  SONICWALL: "sonicwall.com",
  ITFLOW: "itflow.org", PAX8: "pax8.com", PULSEWAY: "pulseway.com",
}

type Section = "platform" | "appearance" | "asset-types" | "data-sources" | "data-management" | "syncro" | "unifi" | "meraki" | "sonicwall" | "pax8" | "api-keys" | "alerts"

const NAV: { id: Section; label: string; group?: string }[] = [
  { id: "platform", label: "Platform" },
  { id: "appearance", label: "Appearance" },
  { id: "asset-types", label: "Asset Types" },
  { id: "data-sources", label: "Data Sources" },
  { id: "data-management", label: "Data Management" },
  { id: "api-keys", label: "API Keys" },
  { id: "alerts", label: "Email Alerts", group: "Notifications" },
  { id: "syncro", label: "SyncroMSP", group: "Integrations" },
  { id: "unifi", label: "Ubiquiti / Unifi", group: "Integrations" },
  { id: "meraki", label: "Cisco Meraki", group: "Integrations" },
  { id: "sonicwall", label: "SonicWall", group: "Integrations" },
  { id: "pax8", label: "Pax8", group: "Integrations" },
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
  const hasErrors = result.errors?.length > 0
  const allFailed = result.success && result.errors?.length > 0 && result.devices === 0 && result.clients === 0 && result.assets === 0
  return (
    <div style={{ marginTop: "12px", padding: "12px 16px", borderRadius: "8px", background: result.success ? (hasErrors ? "rgba(245,158,11,0.08)" : "rgba(34,197,94,0.08)") : "rgba(239,68,68,0.08)", border: `0.5px solid ${result.success ? (hasErrors ? "#f59e0b44" : "#22c55e44") : "#ef444444"}`, fontSize: "13px" }}>
      {result.success ? (
        <div>
          <div style={{ fontWeight: 500, color: hasErrors ? "#f59e0b" : "#22c55e", marginBottom: "4px" }}>
            {allFailed ? "Sync failed — see errors below" : hasErrors ? "Sync complete with errors" : "Sync complete"}
          </div>
          {!allFailed && (
            <div style={{ color: "var(--color-text-secondary)", marginBottom: hasErrors ? "8px" : 0 }}>
              {result.devices != null && `${result.devices} devices`}
              {result.licenses != null && `${result.licenses} subscriptions`}
              {result.clients != null && ` · ${result.clients} clients`}
              {result.assets != null && ` · ${result.assets} assets`}
              {result.sites != null && ` · ${result.sites} sites`}
              {result.networks != null && ` · ${result.networks} networks`}
              {result.companies != null && ` · ${result.companies} companies`}
            </div>
          )}
          {hasErrors && (
            <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
              {result.errors.map((e: string, i: number) => (
                <div key={i} style={{ fontSize: "12px", color: "#f59e0b", fontFamily: "monospace", wordBreak: "break-all" }}>{e}</div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div>
          <div style={{ fontWeight: 500, color: "#ef4444", marginBottom: "4px" }}>Sync failed</div>
          <div style={{ fontSize: "12px", color: "#ef4444", fontFamily: "monospace", wordBreak: "break-all" }}>{result.error}</div>
        </div>
      )}
    </div>
  )
}

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState<Section>("platform")
  const { themeId, setThemeId } = useTheme()

  // --- API Keys ---
  type ApiKeyMeta = { id: string; name: string; lastUsedAt: string | null; createdAt: string }
  const [apiKeys, setApiKeys] = useState<ApiKeyMeta[]>([])
  const [newKeyName, setNewKeyName] = useState("")
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [apiKeyError, setApiKeyError] = useState<string | null>(null)
  const [keyLoading, setKeyLoading] = useState(false)

  const loadApiKeys = async () => {
    const res = await fetch("/api/v1/keys")
    if (res.ok) { const d = await res.json(); setApiKeys(d.keys) }
  }

  useEffect(() => { if (activeSection === "api-keys") loadApiKeys() }, [activeSection])

  const generateKey = async () => {
    if (!newKeyName.trim()) return
    setKeyLoading(true); setApiKeyError(null); setCreatedKey(null)
    const res = await fetch("/api/v1/keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newKeyName.trim() }) })
    setKeyLoading(false)
    if (res.ok) { const d = await res.json(); setCreatedKey(d.key); setNewKeyName(""); loadApiKeys() }
    else { const d = await res.json(); setApiKeyError(d.error ?? "Failed to generate key") }
  }

  const revokeKey = async (id: string) => {
    if (!confirm("Revoke this API key? Any apps using it will stop working.")) return
    await fetch(`/api/v1/keys/${id}`, { method: "DELETE" })
    loadApiKeys()
    if (createdKey) setCreatedKey(null)
  }

  // --- Platform ---
  const [domainThreshold, setDomainThreshold] = useState(30)
  const [thresholdInput, setThresholdInput] = useState("30")
  const [savingThreshold, setSavingThreshold] = useState(false)
  const [logoExists, setLogoExists] = useState(false)
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoVersion, setLogoVersion] = useState(0) // bump to force img reload

  // --- Asset Types ---
  const [assetTypes, setAssetTypes] = useState<AssetType[]>([])
  const [loadingTypes, setLoadingTypes] = useState(true)
  const [showAddType, setShowAddType] = useState(false)
  const [typeForm, setTypeForm] = useState({ name: "", description: "", sortOrder: "" })
  const [savingType, setSavingType] = useState(false)
  const [editingType, setEditingType] = useState<string | null>(null)
  const [typeEditForm, setTypeEditForm] = useState<any>({})
  const [seedingDefaults, setSeedingDefaults] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null)
  const [templateForm, setTemplateForm] = useState<AssetTypeTemplate>({ standardFields: [], showSwitchPanel: false, showCameraPhoto: false, customFieldDefs: [] })
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [migrationPreview, setMigrationPreview] = useState<any[] | null>(null)
  const [loadingMigration, setLoadingMigration] = useState(false)
  const [runningMigration, setRunningMigration] = useState(false)
  const [migrationResult, setMigrationResult] = useState<any | null>(null)

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

  // --- SonicWall ---
  const [sonicwallDevices, setSonicwallDevices] = useState<{ host: string; username: string; password: string; clientId: string; name: string }[]>([])
  const [sonicwallSyncing, setSonicwallSyncing] = useState(false)
  const [sonicwallSyncResult, setSonicwallSyncResult] = useState<any>(null)
  const [showAddSonicwall, setShowAddSonicwall] = useState(false)
  const [sonicwallForm, setSonicwallForm] = useState({ host: "", username: "", password: "", clientId: "", name: "" })

  // --- Pax8 ---
  const [pax8Companies, setPax8Companies] = useState<{ id: string; name: string }[]>([])
  const [loadingPax8Companies, setLoadingPax8Companies] = useState(false)
  const [pax8CompanyMap, setPax8CompanyMap] = useState<Record<string, string>>({})
  const [pax8Syncing, setPax8Syncing] = useState(false)
  const [pax8SyncResult, setPax8SyncResult] = useState<any>(null)

  // --- Email Alerts ---
  const [sendingTestEmail, setSendingTestEmail] = useState(false)
  const [testEmailResult, setTestEmailResult] = useState<{ ok: boolean; message: string } | null>(null)

  async function sendTestEmail() {
    setSendingTestEmail(true)
    setTestEmailResult(null)
    try {
      const res = await fetch("/api/cron/alerts", {
        headers: { authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET ?? ""}` },
      })
      const data = await res.json()
      if (res.ok) {
        setTestEmailResult({ ok: true, message: data.sent ? `Sent — ${data.total} item(s) in digest.` : `Not sent: ${data.reason}` })
      } else {
        setTestEmailResult({ ok: false, message: data.error ?? "Failed" })
      }
    } catch (e: any) {
      setTestEmailResult({ ok: false, message: e.message })
    } finally { setSendingTestEmail(false) }
  }

  // --- Shared clients list for mapping ---
  const [clientsList, setClientsList] = useState<{ id: string; name: string }[]>([])

  // --- Data Management / Merge ---
  const [mergeSourceId, setMergeSourceId] = useState("")
  const [mergeTargetId, setMergeTargetId] = useState("")
  const [mergePreview, setMergePreview] = useState<{ source: string; target: string; counts: Record<string, number> } | null>(null)
  const [mergePreviewing, setMergePreviewing] = useState(false)
  const [mergeDoing, setMergeDoing] = useState(false)
  const [mergeResult, setMergeResult] = useState<{ success: boolean; source?: string; target?: string; error?: string } | null>(null)
  const [mergeConfirm, setMergeConfirm] = useState(false)

  useEffect(() => {
    fetchAssetTypes()
    fetch("/api/settings/domain-threshold").then(r => r.json()).then(d => { setDomainThreshold(d.days); setThresholdInput(String(d.days)) }).catch(() => {})
    fetch("/api/settings/logo").then(r => setLogoExists(r.ok)).catch(() => {})
    fetch("/api/settings/source-colors").then(r => r.json()).then(setSourceColors).catch(() => {})
    fetch("/api/settings/integrations").then(r => r.json()).then((d: Record<string, string>) => {
      setIntegrationConfig(d)
      if (d["integration:unifi:siteMap"]) { try { setUnifiSiteMap(JSON.parse(d["integration:unifi:siteMap"])) } catch {} }
      if (d["integration:meraki:networkMap"]) { try { setMerakiNetworkMap(JSON.parse(d["integration:meraki:networkMap"])) } catch {} }
      if (d["integration:sonicwall:devices"]) { try { setSonicwallDevices(JSON.parse(d["integration:sonicwall:devices"])) } catch {} }
      if (d["integration:pax8:companyMap"]) { try { setPax8CompanyMap(JSON.parse(d["integration:pax8:companyMap"])) } catch {} }
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

  // Logo
  async function uploadLogo(file: File) {
    setLogoUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/settings/logo", { method: "POST", body: fd })
      if (res.ok) { setLogoExists(true); setLogoVersion(v => v + 1) }
    } finally { setLogoUploading(false) }
  }
  async function removeLogo() {
    await fetch("/api/settings/logo", { method: "DELETE" })
    setLogoExists(false)
    setLogoVersion(v => v + 1)
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
  async function fetchAssetTypes() { setLoadingTypes(true); try { const r = await fetch("/api/admin/seed-asset-types"); if (r.ok) setAssetTypes(await r.json()) } catch {} finally { setLoadingTypes(false) } }
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
      const r = await fetch("/api/admin/seed-asset-types", { method: "POST" })
      if (r.ok) await fetchAssetTypes()
    } finally { setSeedingDefaults(false) }
  }
  async function saveTemplate(assetTypeId: string) {
    setSavingTemplate(true)
    try {
      const r = await fetch(`/api/asset-types/${assetTypeId}/template`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(templateForm),
      })
      if (r.ok) {
        const updated = await r.json()
        setAssetTypes(prev => prev.map(t => t.id === assetTypeId ? { ...t, template: updated } : t))
        setEditingTemplate(null)
      }
    } finally { setSavingTemplate(false) }
  }
  async function loadMigrationPreview() {
    setLoadingMigration(true)
    try {
      const r = await fetch("/api/admin/migrate-network-devices")
      if (r.ok) { const d = await r.json(); setMigrationPreview(d.preview) }
    } finally { setLoadingMigration(false) }
  }
  async function runMigration() {
    if (!confirm(`Migrate ${migrationPreview?.length} network device(s) to assets? This cannot be undone.`)) return
    setRunningMigration(true)
    try {
      const r = await fetch("/api/admin/migrate-network-devices", { method: "POST" })
      if (r.ok) { const d = await r.json(); setMigrationResult(d); setMigrationPreview(null) }
    } finally { setRunningMigration(false) }
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
      const isCloud = cfg("integration:unifi:controllerType", "unifi_os") === "ui_cloud"
      const keysToSave = isCloud
        ? ["integration:unifi:controllerType", "integration:unifi:apiKey"]
        : ["integration:unifi:url", "integration:unifi:username", "integration:unifi:password", "integration:unifi:controllerType"]
      await saveIntegration(keysToSave)
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

  // Merge
  async function previewMerge() {
    if (!mergeSourceId || !mergeTargetId) return
    setMergePreviewing(true); setMergePreview(null); setMergeResult(null); setMergeConfirm(false)
    try {
      const res = await fetch("/api/clients/merge", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId: mergeSourceId, targetId: mergeTargetId, preview: true }),
      })
      const data = await res.json()
      if (!res.ok) { setMergeResult({ success: false, error: data.error }); return }
      setMergePreview(data)
    } finally { setMergePreviewing(false) }
  }

  async function executeMerge() {
    if (!mergeSourceId || !mergeTargetId) return
    setMergeDoing(true); setMergeResult(null)
    try {
      const res = await fetch("/api/clients/merge", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId: mergeSourceId, targetId: mergeTargetId, preview: false }),
      })
      const data = await res.json()
      if (res.ok) {
        setMergeResult({ success: true, source: data.source, target: data.target })
        setMergePreview(null); setMergeConfirm(false); setMergeSourceId(""); setMergeTargetId("")
        // Refresh clients list so the merged client disappears
        fetch("/api/clients").then(r => r.json()).then(d => setClientsList(d.map((c: any) => ({ id: c.id, name: c.name })))).catch(() => {})
      } else {
        setMergeResult({ success: false, error: data.error })
      }
    } finally { setMergeDoing(false) }
  }

  // Pax8
  async function loadPax8Companies() {
    setLoadingPax8Companies(true); setPax8Companies([])
    try {
      await saveIntegration(["integration:pax8:clientId", "integration:pax8:clientSecret"])
      const r = await fetch("/api/integrations/pax8/companies")
      const data = await r.json()
      if (!r.ok) { alert(data.error || "Failed to load Pax8 companies"); return }
      setPax8Companies(data)
    } finally { setLoadingPax8Companies(false) }
  }
  async function savePax8Mapping() {
    await saveIntegration([], { "integration:pax8:companyMap": JSON.stringify(pax8CompanyMap) })
    alert("Mapping saved")
  }
  async function runPax8Sync() {
    setPax8Syncing(true); setPax8SyncResult(null)
    try { const r = await fetch("/api/integrations/pax8/sync", { method: "POST" }); setPax8SyncResult(await r.json()) } finally { setPax8Syncing(false) }
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
                <SectionCard title="Company Logo" description="Shown in the sidebar and on printed reports. PNG or SVG recommended.">
                  {logoExists ? (
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "20px", flexWrap: "wrap" }}>
                      <img
                        src={`/api/settings/logo?v=${logoVersion}`}
                        alt="Company logo"
                        style={{ maxHeight: "80px", maxWidth: "240px", objectFit: "contain", borderRadius: "6px", border: "0.5px solid var(--color-border-tertiary)", padding: "8px", background: "var(--color-background-primary)" }}
                      />
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        <label style={{ fontSize: "13px", padding: "6px 14px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: "pointer", color: "var(--color-text-secondary)", display: "inline-block" }}>
                          {logoUploading ? "Uploading..." : "Replace logo"}
                          <input type="file" accept="image/*" style={{ display: "none" }} disabled={logoUploading} onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = "" }} />
                        </label>
                        <button onClick={removeLogo} style={{ fontSize: "13px", padding: "6px 14px", borderRadius: "8px", border: "none", background: "transparent", cursor: "pointer", color: "var(--color-text-danger, #ef4444)", textAlign: "left" }}>
                          Remove logo
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "13px", padding: "8px 16px", borderRadius: "8px", border: "0.5px dashed var(--color-border-secondary)", cursor: "pointer", color: "var(--color-text-secondary)" }}>
                      {logoUploading ? "Uploading..." : "+ Upload logo"}
                      <input type="file" accept="image/*" style={{ display: "none" }} disabled={logoUploading} onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = "" }} />
                    </label>
                  )}
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

            {/* ── Appearance ── */}
            {activeSection === "appearance" && (
              <SectionCard title="Appearance" description="Choose your theme. Saved in your browser — personal to you.">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "12px" }}>
                  {THEMES.map(theme => {
                    const selected = themeId === theme.id
                    return (
                      <button
                        key={theme.id}
                        onClick={() => setThemeId(theme.id as ThemeId)}
                        style={{
                          background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0,
                          borderRadius: "10px", outline: "none",
                        }}
                      >
                        <div style={{
                          borderRadius: "10px", overflow: "hidden",
                          border: selected ? `2px solid ${theme.previewAccent}` : "2px solid var(--color-border-secondary)",
                          transition: "border-color 0.15s",
                        }}>
                          {/* Preview area */}
                          <div style={{ background: theme.previewBg, padding: "14px 14px 10px", position: "relative" }}>
                            {/* Simulated sidebar + content */}
                            <div style={{ display: "flex", gap: "6px", height: "48px" }}>
                              <div style={{ width: "24px", background: theme.previewSurface, borderRadius: "4px", opacity: 0.9 }} />
                              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px" }}>
                                <div style={{ height: "8px", background: theme.previewSurface, borderRadius: "3px", width: "80%" }} />
                                <div style={{ height: "6px", background: theme.previewSurface, borderRadius: "3px", width: "60%", opacity: 0.6 }} />
                                <div style={{ height: "6px", background: theme.previewSurface, borderRadius: "3px", width: "70%", opacity: 0.4 }} />
                                <div style={{ height: "6px", background: theme.previewAccent, borderRadius: "3px", width: "45%", marginTop: "2px" }} />
                              </div>
                            </div>
                          </div>
                          {/* Label row */}
                          <div style={{
                            background: "var(--color-background-secondary)",
                            padding: "10px 12px",
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                          }}>
                            <div>
                              <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-primary)" }}>{theme.label}</div>
                              <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "1px" }}>{theme.description}</div>
                            </div>
                            {selected && (
                              <div style={{ width: "16px", height: "16px", borderRadius: "50%", background: theme.previewAccent, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <span style={{ color: "#fff", fontSize: "10px", fontWeight: 700 }}>✓</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </SectionCard>
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
                    {assetTypes.map((type, i) => (
                      <div key={type.id}>
                        {editingType === type.id ? (
                          <div style={{ padding: "12px 14px", borderBottom: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-primary)" }}>
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
                        ) : editingTemplate === type.id ? (
                          <div style={{ padding: "14px 16px", borderBottom: i < assetTypes.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none", background: "var(--color-background-primary)" }}>
                            <div style={{ fontSize: "13px", fontWeight: 500, marginBottom: "10px" }}>{type.name} — Template Fields</div>
                            <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginBottom: "10px" }}>Select which fields appear on this asset type's add/edit form:</div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", marginBottom: "12px" }}>
                              {ALL_STANDARD_FIELDS.map(f => (
                                <label key={f.key} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer" }}>
                                  <input type="checkbox"
                                    checked={templateForm.standardFields.includes(f.key)}
                                    onChange={e => setTemplateForm(tf => ({
                                      ...tf,
                                      standardFields: e.target.checked
                                        ? [...tf.standardFields, f.key]
                                        : tf.standardFields.filter(x => x !== f.key)
                                    }))} />
                                  {f.label}
                                </label>
                              ))}
                            </div>
                            <div style={{ display: "flex", gap: "16px", marginBottom: "12px" }}>
                              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer" }}>
                                <input type="checkbox" checked={templateForm.showSwitchPanel} onChange={e => setTemplateForm(tf => ({ ...tf, showSwitchPanel: e.target.checked }))} />
                                Show Switch Port Diagram
                              </label>
                              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer" }}>
                                <input type="checkbox" checked={templateForm.showCameraPhoto} onChange={e => setTemplateForm(tf => ({ ...tf, showCameraPhoto: e.target.checked }))} />
                                Show Camera FOV Photo
                              </label>
                            </div>
                            <div style={{ marginBottom: "12px" }}>
                              <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: "6px" }}>Custom Fields</div>
                              {templateForm.customFieldDefs.map((cd, ci) => (
                                <div key={ci} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px auto", gap: "6px", marginBottom: "6px", alignItems: "center" }}>
                                  <input value={cd.key} onChange={e => setTemplateForm(tf => ({ ...tf, customFieldDefs: tf.customFieldDefs.map((x, xi) => xi === ci ? { ...x, key: e.target.value } : x) }))} placeholder="field_key" style={{ ...inp, fontSize: "12px" }} />
                                  <input value={cd.label} onChange={e => setTemplateForm(tf => ({ ...tf, customFieldDefs: tf.customFieldDefs.map((x, xi) => xi === ci ? { ...x, label: e.target.value } : x) }))} placeholder="Display Label" style={{ ...inp, fontSize: "12px" }} />
                                  <select value={cd.type} onChange={e => setTemplateForm(tf => ({ ...tf, customFieldDefs: tf.customFieldDefs.map((x, xi) => xi === ci ? { ...x, type: e.target.value } : x) }))} style={{ ...inp, fontSize: "12px" }}>
                                    <option value="text">Text</option>
                                    <option value="number">Number</option>
                                    <option value="date">Date</option>
                                    <option value="url">URL</option>
                                  </select>
                                  <button onClick={() => setTemplateForm(tf => ({ ...tf, customFieldDefs: tf.customFieldDefs.filter((_, xi) => xi !== ci) }))} style={{ fontSize: "12px", color: "var(--color-text-danger)", background: "none", border: "none", cursor: "pointer", padding: "0 4px" }}>✕</button>
                                </div>
                              ))}
                              <button onClick={() => setTemplateForm(tf => ({ ...tf, customFieldDefs: [...tf.customFieldDefs, { key: "", label: "", type: "text", required: false }] }))}
                                style={{ fontSize: "12px", padding: "4px 10px", borderRadius: "6px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>
                                + Add custom field
                              </button>
                            </div>
                            <div style={{ display: "flex", gap: "8px" }}>
                              <button onClick={() => saveTemplate(type.id)} disabled={savingTemplate} style={{ fontSize: "12px", fontWeight: 500, padding: "5px 12px", borderRadius: "6px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>{savingTemplate ? "Saving..." : "Save template"}</button>
                              <button onClick={() => setEditingTemplate(null)} style={{ fontSize: "12px", padding: "5px 12px", borderRadius: "6px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div key={type.id} style={{ borderBottom: i < assetTypes.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none", background: "var(--color-background-primary)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px" }}>
                              <div>
                                <div style={{ fontSize: "14px" }}>{type.name}</div>
                                {type.description && <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "1px" }}>{type.description}</div>}
                                {type.template && (
                                  <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "3px" }}>
                                    {type.template.standardFields.length} fields configured
                                    {type.template.showSwitchPanel ? " · Switch panel" : ""}
                                    {type.template.customFieldDefs?.length ? ` · ${type.template.customFieldDefs.length} custom` : ""}
                                  </div>
                                )}
                              </div>
                              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                                <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>#{type.sortOrder}</span>
                                <button onClick={() => {
                                  setEditingTemplate(type.id)
                                  setTemplateForm({
                                    standardFields: type.template?.standardFields ?? [],
                                    showSwitchPanel: type.template?.showSwitchPanel ?? false,
                                    showCameraPhoto: type.template?.showCameraPhoto ?? false,
                                    customFieldDefs: (type.template?.customFieldDefs as any[]) ?? [],
                                  })
                                }} style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Template</button>
                                <button onClick={() => { setEditingType(type.id); setTypeEditForm({ ...type }) }} style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Edit</button>
                                <button onClick={() => deleteType(type.id)} style={{ fontSize: "12px", color: "var(--color-text-danger)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Remove</button>
                              </div>
                            </div>
                          </div>
                        )}
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
            {activeSection === "alerts" && (
              <SectionCard title="Email Alerts" description="Send a nightly expiration digest via Resend. Covers SSL, domains, warranties, credentials, and licenses expiring within 30 days.">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={lbl}>Alert recipient email</label>
                    <input
                      type="email"
                      value={cfg("integration:alerts:email")}
                      onChange={e => setCfg("integration:alerts:email", e.target.value)}
                      placeholder="michael@pcc2k.com"
                      style={inp}
                    />
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={lbl}>From address <span style={{ color: "var(--color-text-muted)", fontSize: "12px" }}>(must be a Resend-verified sender)</span></label>
                    <input
                      value={cfg("integration:alerts:from", "DocHub <noreply@dochub.pcc2k.com>")}
                      onChange={e => setCfg("integration:alerts:from", e.target.value)}
                      placeholder="DocHub <noreply@yourdomain.com>"
                      style={inp}
                    />
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={lbl}>Resend API key</label>
                    <input
                      type="password"
                      value={cfg("integration:resend:apiKey")}
                      onChange={e => setCfg("integration:resend:apiKey", e.target.value)}
                      placeholder="re_••••••••••••••••••••••••••••••••"
                      style={inp}
                    />
                    <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "4px" }}>
                      Get an API key at resend.com — free tier is 3,000 emails/month.
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                  <button
                    onClick={() => saveIntegration(["integration:alerts:email", "integration:alerts:from", "integration:resend:apiKey"])}
                    disabled={savingIntegration}
                    style={{ fontSize: "14px", fontWeight: 500, padding: "8px 16px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer", opacity: savingIntegration ? 0.6 : 1 }}
                  >
                    {savingIntegration ? "Saving..." : "Save"}
                  </button>
                  <button
                    onClick={sendTestEmail}
                    disabled={sendingTestEmail}
                    style={{ fontSize: "14px", padding: "8px 16px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: sendingTestEmail ? "not-allowed" : "pointer", color: "var(--color-text-secondary)", opacity: sendingTestEmail ? 0.6 : 1 }}
                  >
                    {sendingTestEmail ? "Sending..." : "Send test email now"}
                  </button>
                  {testEmailResult && (
                    <span style={{ fontSize: "13px", color: testEmailResult.ok ? "#10b981" : "var(--color-text-danger)" }}>
                      {testEmailResult.message}
                    </span>
                  )}
                </div>
                <div style={{ marginTop: "16px", padding: "12px 14px", background: "var(--color-background-primary)", borderRadius: "8px", border: "0.5px solid var(--color-border-tertiary)", fontSize: "13px", color: "var(--color-text-secondary)" }}>
                  The nightly digest runs automatically as part of the <code style={{ fontFamily: "monospace", fontSize: "12px" }}>/api/cron/sync</code> job. It only sends if there are items expiring within 30 days.
                </div>
              </SectionCard>
            )}

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
                <SectionCard title="Ubiquiti / Unifi — Credentials" description="Connect to a local UniFi controller or a UI.com cloud account.">
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label style={lbl}>Controller type</label>
                      <select value={cfg("integration:unifi:controllerType", "unifi_os")} onChange={e => setCfg("integration:unifi:controllerType", e.target.value)} style={inp}>
                        <option value="unifi_os">UniFi OS — local (UDM / UDR / Cloud Key Gen2+)</option>
                        <option value="network_application">Network Application — local (standalone, port 8443)</option>
                        <option value="ui_cloud">UI.com — cloud (unifi.ui.com)</option>
                      </select>
                    </div>
                    {cfg("integration:unifi:controllerType", "unifi_os") === "ui_cloud" ? (
                      <div style={{ gridColumn: "1 / -1" }}>
                        <label style={lbl}>API Key</label>
                        <input type="password" value={cfg("integration:unifi:apiKey")} onChange={e => setCfg("integration:unifi:apiKey", e.target.value)} placeholder="Generate in UI.com → Account → API Keys" style={inp} />
                      </div>
                    ) : (
                      <>
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
                      </>
                    )}
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

            {/* ── Pax8 ── */}
            {activeSection === "data-management" && (
              <>
                <SectionCard title="Migrate Network Devices to Assets" description="Convert legacy Network Device records into Assets with the correct type template. Switch port diagrams and links are preserved. This cannot be undone.">
                  {migrationResult ? (
                    <div>
                      <div style={{ fontSize: "14px", color: "#22c55e", marginBottom: "8px" }}>Migration complete — {migrationResult.migrated} device(s) migrated.</div>
                      {migrationResult.errors?.length > 0 && (
                        <div style={{ fontSize: "13px", color: "var(--color-text-danger)" }}>
                          {migrationResult.errors.length} error(s): {migrationResult.errors.map((e: any) => e.name).join(", ")}
                        </div>
                      )}
                      <button onClick={() => setMigrationResult(null)} style={{ marginTop: "10px", fontSize: "12px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Dismiss</button>
                    </div>
                  ) : migrationPreview ? (
                    <div>
                      <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginBottom: "10px" }}>{migrationPreview.length} device(s) will be converted:</div>
                      <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "8px", overflow: "hidden", marginBottom: "12px" }}>
                        {migrationPreview.map((d: any, i: number) => (
                          <div key={d.id} style={{ display: "grid", gridTemplateColumns: "1fr 120px 120px 60px", padding: "8px 12px", fontSize: "12px", borderBottom: i < migrationPreview.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none", background: "var(--color-background-primary)", alignItems: "center" }}>
                            <span style={{ fontWeight: 500 }}>{d.name}</span>
                            <span style={{ color: "var(--color-text-secondary)" }}>{d.type.replace(/_/g, " ")}</span>
                            <span style={{ color: "var(--color-text-secondary)" }}>→ {d.targetAssetType}</span>
                            {d.switchPorts > 0 && <span style={{ color: "var(--color-text-muted)" }}>{d.switchPorts} ports</span>}
                          </div>
                        ))}
                      </div>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button onClick={runMigration} disabled={runningMigration} style={{ fontSize: "13px", fontWeight: 500, padding: "6px 14px", borderRadius: "8px", border: "none", background: "#ef4444", color: "white", cursor: "pointer" }}>
                          {runningMigration ? "Migrating..." : `Migrate ${migrationPreview.length} device(s)`}
                        </button>
                        <button onClick={() => setMigrationPreview(null)} style={{ fontSize: "13px", padding: "6px 14px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={loadMigrationPreview} disabled={loadingMigration} style={{ fontSize: "13px", fontWeight: 500, padding: "8px 16px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: "pointer" }}>
                      {loadingMigration ? "Loading..." : "Preview migration"}
                    </button>
                  )}
                </SectionCard>

                <SectionCard title="ITFlow Import" description="Import clients, contacts, assets, passwords, and licenses from an ITFlow CSV export.">
                  <a href="/import" style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "13px", padding: "8px 16px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", textDecoration: "none", fontWeight: 500 }}>
                    Open Import Wizard →
                  </a>
                </SectionCard>
                <SectionCard
                  title="Merge Clients"
                  description="Move all records from a duplicate client into the correct client, then mark the duplicate inactive. This cannot be undone."
                >
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                    <div>
                      <label style={lbl}>Source (duplicate to remove)</label>
                      <select
                        value={mergeSourceId}
                        onChange={e => { setMergeSourceId(e.target.value); setMergePreview(null); setMergeConfirm(false); setMergeResult(null) }}
                        style={inp}
                      >
                        <option value="">— select client —</option>
                        {clientsList.filter(c => c.id !== mergeTargetId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Target (correct client to keep)</label>
                      <select
                        value={mergeTargetId}
                        onChange={e => { setMergeTargetId(e.target.value); setMergePreview(null); setMergeConfirm(false); setMergeResult(null) }}
                        style={inp}
                      >
                        <option value="">— select client —</option>
                        {clientsList.filter(c => c.id !== mergeSourceId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                  </div>

                  <button
                    onClick={previewMerge}
                    disabled={!mergeSourceId || !mergeTargetId || mergePreviewing}
                    style={{ fontSize: "14px", padding: "8px 16px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: "pointer", color: "var(--color-text-primary)", opacity: (!mergeSourceId || !mergeTargetId) ? 0.4 : 1 }}
                  >
                    {mergePreviewing ? "Checking..." : "Preview merge"}
                  </button>

                  {mergePreview && (
                    <div style={{ marginTop: "16px", padding: "16px", borderRadius: "8px", background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)" }}>
                      <div style={{ fontSize: "14px", fontWeight: 500, marginBottom: "12px" }}>
                        Moving all records from <span style={{ color: "#ef4444" }}>{mergePreview.source}</span> → <span style={{ color: "#22c55e" }}>{mergePreview.target}</span>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 24px", marginBottom: "14px" }}>
                        {Object.entries(mergePreview.counts).filter(([, v]) => v > 0).map(([key, val]) => (
                          <div key={key} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "0.5px solid var(--color-border-tertiary)", fontSize: "13px" }}>
                            <span style={{ color: "var(--color-text-secondary)", textTransform: "capitalize" }}>{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                            <span style={{ fontWeight: 500 }}>{val}</span>
                          </div>
                        ))}
                        {Object.values(mergePreview.counts).every(v => v === 0) && (
                          <div style={{ fontSize: "13px", color: "var(--color-text-muted)", gridColumn: "1 / -1" }}>Source client has no records to move.</div>
                        )}
                      </div>

                      {!mergeConfirm ? (
                        <button
                          onClick={() => setMergeConfirm(true)}
                          style={{ fontSize: "14px", fontWeight: 500, padding: "8px 18px", borderRadius: "8px", border: "none", background: "#ef4444", color: "white", cursor: "pointer" }}
                        >
                          Merge clients
                        </button>
                      ) : (
                        <div style={{ padding: "12px 16px", background: "rgba(239,68,68,0.08)", border: "0.5px solid #ef444466", borderRadius: "8px" }}>
                          <div style={{ fontSize: "14px", fontWeight: 500, color: "#ef4444", marginBottom: "8px" }}>
                            Are you sure? This cannot be undone.
                          </div>
                          <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginBottom: "12px" }}>
                            <strong>{mergePreview.source}</strong> will be marked inactive and all its records will be permanently reassigned to <strong>{mergePreview.target}</strong>.
                          </div>
                          <div style={{ display: "flex", gap: "8px" }}>
                            <button
                              onClick={executeMerge}
                              disabled={mergeDoing}
                              style={{ fontSize: "14px", fontWeight: 500, padding: "7px 18px", borderRadius: "8px", border: "none", background: "#ef4444", color: "white", cursor: "pointer", opacity: mergeDoing ? 0.6 : 1 }}
                            >
                              {mergeDoing ? "Merging..." : "Yes, merge now"}
                            </button>
                            <button
                              onClick={() => setMergeConfirm(false)}
                              style={{ fontSize: "14px", padding: "7px 14px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {mergeResult && (
                    <div style={{ marginTop: "12px", padding: "12px 16px", borderRadius: "8px", background: mergeResult.success ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)", border: `0.5px solid ${mergeResult.success ? "#22c55e44" : "#ef444444"}`, fontSize: "13px" }}>
                      {mergeResult.success ? (
                        <div>
                          <div style={{ fontWeight: 500, color: "#22c55e", marginBottom: "4px" }}>Merge complete</div>
                          <div style={{ color: "var(--color-text-secondary)" }}>All records from <strong>{mergeResult.source}</strong> have been moved to <strong>{mergeResult.target}</strong>. The source client has been marked inactive.</div>
                        </div>
                      ) : (
                        <div style={{ color: "#ef4444" }}>Error: {mergeResult.error}</div>
                      )}
                    </div>
                  )}
                </SectionCard>
              </>
            )}

            {activeSection === "pax8" && (
              <>
                <SectionCard title="Pax8 Credentials" description="OAuth2 client credentials from your Pax8 Partner Portal (Admin → API credentials).">
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                    <div>
                      <label style={lbl}>Client ID</label>
                      <input value={cfg("integration:pax8:clientId")} onChange={e => setCfg("integration:pax8:clientId", e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>Client Secret</label>
                      <input type="password" value={cfg("integration:pax8:clientSecret")} onChange={e => setCfg("integration:pax8:clientSecret", e.target.value)} style={inp} />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    {saveBtn(() => saveIntegration(["integration:pax8:clientId", "integration:pax8:clientSecret"]), savingIntegration)}
                    <button onClick={loadPax8Companies} disabled={loadingPax8Companies} style={{ fontSize: "14px", padding: "8px 16px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: loadingPax8Companies ? "not-allowed" : "pointer", color: "var(--color-text-primary)", opacity: loadingPax8Companies ? 0.6 : 1 }}>
                      {loadingPax8Companies ? "Loading..." : "Load companies"}
                    </button>
                  </div>
                </SectionCard>

                {pax8Companies.length > 0 && (
                  <SectionCard title="Company → Client Mapping" description="Map each Pax8 company to a client in DocHub. Subscriptions will be imported as licenses.">
                    <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "8px", overflow: "hidden", marginBottom: "12px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", padding: "8px 14px", background: "var(--color-background-hover)", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                        <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-secondary)" }}>Pax8 Company</div>
                        <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-secondary)" }}>DocHub Client</div>
                      </div>
                      {pax8Companies.map((company, i) => (
                        <div key={company.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", padding: "8px 14px", borderBottom: i < pax8Companies.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none", alignItems: "center", background: "var(--color-background-primary)" }}>
                          <div style={{ fontSize: "13px" }}>{company.name}</div>
                          <select value={pax8CompanyMap[company.id] ?? ""} onChange={e => setPax8CompanyMap(m => ({ ...m, [company.id]: e.target.value }))} style={{ ...inp, padding: "5px 10px", fontSize: "13px" }}>
                            <option value="">— skip —</option>
                            {clientsList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button onClick={savePax8Mapping} disabled={savingIntegration} style={{ fontSize: "13px", fontWeight: 500, padding: "6px 14px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>Save mapping</button>
                      <button onClick={runPax8Sync} disabled={pax8Syncing} style={{ fontSize: "13px", padding: "6px 14px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: pax8Syncing ? "not-allowed" : "pointer", color: "var(--color-text-primary)", opacity: pax8Syncing ? 0.6 : 1 }}>
                        {pax8Syncing ? "Syncing..." : "Run sync"}
                      </button>
                    </div>
                    <SyncResult result={pax8SyncResult} />
                  </SectionCard>
                )}

                {pax8Companies.length === 0 && pax8CompanyMap && Object.keys(pax8CompanyMap).length > 0 && (
                  <SectionCard title="Sync">
                    <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginBottom: "12px" }}>Company mapping is saved. Load companies above to modify, or run sync directly.</p>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button onClick={runPax8Sync} disabled={pax8Syncing} style={{ fontSize: "13px", fontWeight: 500, padding: "6px 14px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: pax8Syncing ? "not-allowed" : "pointer", opacity: pax8Syncing ? 0.6 : 1 }}>
                        {pax8Syncing ? "Syncing..." : "Run sync"}
                      </button>
                    </div>
                    <SyncResult result={pax8SyncResult} />
                  </SectionCard>
                )}

                <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "4px" }}>
                  Subscriptions are synced into each client&apos;s Subscriptions tab. Cancelled and terminated subscriptions are skipped. User assignments are preserved on re-sync.
                </div>
              </>
            )}

            {activeSection === "api-keys" && (
              <>
                <SectionCard title="API Keys" description="Generate keys for the DocHub REST API — used by browser extensions, scripts, or integrations. Keys are shown once at creation.">
                  <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
                    <input
                      value={newKeyName}
                      onChange={e => setNewKeyName(e.target.value)}
                      placeholder="Key name (e.g. Browser Extension)"
                      style={{ ...inp, flex: 1 }}
                      onKeyDown={e => e.key === "Enter" && generateKey()}
                    />
                    <button
                      onClick={generateKey}
                      disabled={keyLoading || !newKeyName.trim()}
                      style={{ fontSize: "13px", fontWeight: 500, padding: "6px 16px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: keyLoading || !newKeyName.trim() ? "not-allowed" : "pointer", opacity: keyLoading || !newKeyName.trim() ? 0.5 : 1, whiteSpace: "nowrap" }}
                    >
                      {keyLoading ? "Generating..." : "Generate key"}
                    </button>
                  </div>

                  {apiKeyError && <div style={{ fontSize: "13px", color: "var(--color-error, #e55)", marginBottom: "12px" }}>{apiKeyError}</div>}

                  {createdKey && (
                    <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", padding: "12px 14px", marginBottom: "16px" }}>
                      <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginBottom: "6px" }}>Copy this key now — it will not be shown again.</div>
                      <div style={{ fontFamily: "monospace", fontSize: "13px", wordBreak: "break-all", userSelect: "all", color: "var(--color-text-primary)" }}>{createdKey}</div>
                      <button onClick={() => { navigator.clipboard.writeText(createdKey); }} style={{ marginTop: "8px", fontSize: "12px", padding: "4px 10px", borderRadius: "6px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", color: "var(--color-text-secondary)", cursor: "pointer" }}>Copy</button>
                    </div>
                  )}

                  {apiKeys.length === 0 ? (
                    <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>No API keys yet.</div>
                  ) : (
                    <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "8px", overflow: "hidden" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 160px 80px", padding: "8px 14px", background: "var(--color-background-hover)", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                        {["Name", "Created", "Last used", ""].map((h, i) => (
                          <div key={i} style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-secondary)" }}>{h}</div>
                        ))}
                      </div>
                      {apiKeys.map((k, i) => (
                        <div key={k.id} style={{ display: "grid", gridTemplateColumns: "1fr 160px 160px 80px", padding: "10px 14px", borderBottom: i < apiKeys.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none", alignItems: "center", background: "var(--color-background-primary)" }}>
                          <div style={{ fontSize: "14px" }}>{k.name}</div>
                          <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{new Date(k.createdAt).toLocaleDateString()}</div>
                          <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : "Never"}</div>
                          <button onClick={() => revokeKey(k.id)} style={{ fontSize: "12px", padding: "4px 10px", borderRadius: "6px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", color: "var(--color-error, #e55)", cursor: "pointer" }}>Revoke</button>
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>

                <SectionCard title="API Reference" description="Base URL: https://dochub.pcc2k.com — authenticate with Authorization: Bearer <key>">
                  <div style={{ fontFamily: "monospace", fontSize: "12px", color: "var(--color-text-secondary)", lineHeight: "1.8" }}>
                    <div><span style={{ color: "var(--color-text-primary)" }}>GET</span>  /api/v1/credentials — list all credentials (no secrets)</div>
                    <div><span style={{ color: "var(--color-text-primary)" }}>GET</span>  /api/v1/credentials?clientId=&#123;id&#125; — filter by client</div>
                    <div><span style={{ color: "var(--color-text-primary)" }}>GET</span>  /api/v1/credentials/search?url=&#123;url&#125; — autofill match by hostname</div>
                    <div><span style={{ color: "var(--color-text-primary)" }}>GET</span>  /api/v1/credentials/&#123;id&#125;/reveal — decrypt password + TOTP</div>
                  </div>
                </SectionCard>
              </>
            )}

          </div>
        </div>
      </div>
    </AppShell>
  )
}
