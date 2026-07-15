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
  { key: "personId",        label: "Person" },
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

type Section = "platform" | "appearance" | "asset-types" | "data-sources" | "data-management" | "sync-status" | "security" | "syncro" | "unifi" | "meraki" | "sonicwall" | "pax8" | "api-keys" | "alerts" | "teams" | "synology" | "my-vault"

const NAV: { id: Section; label: string; group?: string }[] = [
  { id: "platform", label: "Platform" },
  { id: "appearance", label: "Appearance" },
  { id: "asset-types", label: "Asset Types" },
  { id: "data-sources", label: "Data Sources" },
  { id: "data-management", label: "Data Management" },
  { id: "sync-status", label: "Sync Status" },
  { id: "security", label: "Security" },
  { id: "api-keys", label: "API Keys" },
  { id: "my-vault", label: "My Vault", group: "Personal" },
  { id: "alerts", label: "Email Alerts", group: "Notifications" },
  { id: "teams",    label: "Microsoft Teams", group: "Notifications" },
  { id: "synology", label: "Synology",        group: "Integrations" },
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
    <div style={{ marginTop: "12px", padding: "12px 16px", borderRadius: "8px", background: result.success ? (hasErrors ? "rgba(245,158,11,0.08)" : "rgba(34,197,94,0.08)") : "rgba(239,68,68,0.08)", border: `0.5px solid ${result.success ? (hasErrors ? "#ffb34744" : "#00d4aa44") : "#ff4d6d44"}`, fontSize: "13px" }}>
      {result.success ? (
        <div>
          <div style={{ fontWeight: 500, color: hasErrors ? "#ffb347" : "#00d4aa", marginBottom: "4px" }}>
            {allFailed ? "Sync failed — see errors below" : hasErrors ? "Sync complete with errors" : "Sync complete"}
          </div>
          {!allFailed && (
            <div style={{ color: "var(--color-text-secondary)", marginBottom: hasErrors ? "8px" : 0 }}>
              {result.devices != null && `${result.devices} devices`}
              {result.cameras != null && ` · ${result.cameras} cameras`}
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
                <div key={i} style={{ fontSize: "12px", color: "#ffb347", fontFamily: "monospace", wordBreak: "break-all" }}>{e}</div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div>
          <div style={{ fontWeight: 500, color: "#ff4d6d", marginBottom: "4px" }}>Sync failed</div>
          <div style={{ fontSize: "12px", color: "#ff4d6d", fontFamily: "monospace", wordBreak: "break-all" }}>{result.error}</div>
        </div>
      )}
    </div>
  )
}

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState<Section>(() => {
    if (typeof window === "undefined") return "platform"
    const q = new URLSearchParams(window.location.search).get("section")
    const valid: Section[] = ["platform","appearance","asset-types","data-sources","data-management","sync-status","security","syncro","unifi","meraki","sonicwall","pax8","api-keys","alerts","teams","synology","my-vault"]
    return (q && valid.includes(q as Section)) ? (q as Section) : "platform"
  })
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
    SYNCRO: "#3d6fff", UNIFI: "#8b5cf6", MERAKI: "#00bcf2", HPINSTANTON: "#01a982",
    SONICWALL: "#f97316", ITFLOW: "#f97316", PAX8: "#00d4aa", PULSEWAY: "#ec4899",
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
  const [sendingTeamsTest, setSendingTeamsTest] = useState(false)
  const [teamsTestResult, setTeamsTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  async function sendTeamsTest() {
    const url = cfg("teams:webhook_url")
    if (!url) { setTeamsTestResult({ ok: false, message: "Enter a webhook URL first" }); return }
    setSendingTeamsTest(true)
    setTeamsTestResult(null)
    try {
      const res = await fetch("/api/integrations/teams/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookUrl: url }),
      })
      const data = await res.json()
      setTeamsTestResult(data.ok ? { ok: true, message: "Test card posted to Teams." } : { ok: false, message: data.error ?? "Failed" })
    } catch (e: any) {
      setTeamsTestResult({ ok: false, message: e.message })
    } finally { setSendingTeamsTest(false) }
  }

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
                        <button onClick={removeLogo} style={{ fontSize: "13px", padding: "6px 14px", borderRadius: "8px", border: "none", background: "transparent", cursor: "pointer", color: "var(--color-text-danger, #ff4d6d)", textAlign: "left" }}>
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
              <SectionCard title="Email Alerts" description="Send a nightly expiration digest via Resend. Covers selected categories expiring within the configured window.">
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
                  <div>
                    <label style={lbl}>Warning threshold (days)</label>
                    <input
                      type="number"
                      min="1"
                      value={cfg("alerts:threshold:warn", "30")}
                      onChange={e => setCfg("alerts:threshold:warn", e.target.value)}
                      style={{ ...inp, width: "100px" }}
                    />
                    <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "4px" }}>Items expiring within this many days appear in the digest.</div>
                  </div>
                  <div>
                    <label style={lbl}>Critical threshold (days)</label>
                    <input
                      type="number"
                      min="1"
                      value={cfg("alerts:threshold:critical", "7")}
                      onChange={e => setCfg("alerts:threshold:critical", e.target.value)}
                      style={{ ...inp, width: "100px" }}
                    />
                    <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "4px" }}>Items within this window are marked critical (red) in the email.</div>
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={lbl}>Categories to include</label>
                    <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginTop: "6px" }}>
                      {[
                        { key: "alerts:categories:ssl",         label: "SSL certs"   },
                        { key: "alerts:categories:domains",     label: "Domains"     },
                        { key: "alerts:categories:warranties",  label: "Warranties"  },
                        { key: "alerts:categories:credentials", label: "Credentials" },
                        { key: "alerts:categories:licenses",    label: "Licenses"    },
                        { key: "alerts:categories:vpncerts",    label: "VPN certs"   },
                        { key: "alerts:categories:circuits",    label: "Circuits"    },
                      ].map(({ key, label }) => (
                        <label key={key} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={cfg(key, "true") !== "false"}
                            onChange={e => setCfg(key, e.target.checked ? "true" : "false")}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                  <button
                    onClick={() => saveIntegration([
                      "integration:alerts:email", "integration:alerts:from", "integration:resend:apiKey",
                      "alerts:threshold:warn", "alerts:threshold:critical",
                      "alerts:categories:ssl", "alerts:categories:domains", "alerts:categories:warranties",
                      "alerts:categories:credentials", "alerts:categories:licenses",
                      "alerts:categories:vpncerts", "alerts:categories:circuits",
                    ])}
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
                    <span style={{ fontSize: "13px", color: testEmailResult.ok ? "#00d4aa" : "var(--color-text-danger)" }}>
                      {testEmailResult.message}
                    </span>
                  )}
                </div>
                <div style={{ marginTop: "16px", padding: "12px 14px", background: "var(--color-background-primary)", borderRadius: "8px", border: "0.5px solid var(--color-border-tertiary)", fontSize: "13px", color: "var(--color-text-secondary)" }}>
                  The nightly digest runs automatically as part of the <code style={{ fontFamily: "monospace", fontSize: "12px" }}>/api/cron/sync</code> job. It only sends if there are items within the warning window.
                </div>

                <SectionCard
                  title="Push channels"
                  description="Optional ntfy + Pushover delivery alongside email. Configure either or both — the nightly digest fans out to whichever is set."
                >
                  <div style={{ display: "grid", gap: "12px", marginBottom: "16px" }}>
                    <div>
                      <label style={lbl}>ntfy URL (optional, default https://ntfy.sh)</label>
                      <input
                        value={cfg("push:ntfy:url")}
                        onChange={e => setCfg("push:ntfy:url", e.target.value)}
                        placeholder="https://ntfy.pcc2k.com"
                        style={inp}
                      />
                    </div>
                    <div>
                      <label style={lbl}>ntfy topic</label>
                      <input
                        value={cfg("push:ntfy:topic")}
                        onChange={e => setCfg("push:ntfy:topic", e.target.value)}
                        placeholder="dochub-alerts"
                        style={inp}
                      />
                    </div>
                    <div>
                      <label style={lbl}>Pushover application token</label>
                      <input
                        type="password"
                        value={cfg("push:pushover:appToken")}
                        onChange={e => setCfg("push:pushover:appToken", e.target.value)}
                        placeholder="atoken..."
                        style={inp}
                      />
                    </div>
                    <div>
                      <label style={lbl}>Pushover user key</label>
                      <input
                        type="password"
                        value={cfg("push:pushover:userKey")}
                        onChange={e => setCfg("push:pushover:userKey", e.target.value)}
                        placeholder="ukey..."
                        style={inp}
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => saveIntegration([
                      "push:ntfy:url", "push:ntfy:topic",
                      "push:pushover:appToken", "push:pushover:userKey",
                    ])}
                    disabled={savingIntegration}
                    style={{ fontSize: "14px", fontWeight: 500, padding: "8px 16px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer", opacity: savingIntegration ? 0.6 : 1 }}
                  >
                    {savingIntegration ? "Saving..." : "Save"}
                  </button>
                  <div style={{ marginTop: "12px", fontSize: "12px", color: "var(--color-text-muted)" }}>
                    Tip: TicketHub also uses ntfy. Sharing a topic (e.g. <code>tickethub</code>) sends both apps&apos; alerts to the same subscriber list.
                  </div>
                </SectionCard>
              </SectionCard>
            )}

            {activeSection === "teams" && (
              <SectionCard title="Microsoft Teams" description="Post alarm notifications and nightly expiration digests to a Teams channel via incoming webhook.">
                <div style={{ display: "grid", gap: "12px", marginBottom: "16px" }}>
                  <div>
                    <label style={lbl}>Incoming webhook URL</label>
                    <input
                      value={cfg("teams:webhook_url")}
                      onChange={e => setCfg("teams:webhook_url", e.target.value)}
                      placeholder="https://prod-xx.westus.logic.azure.com/..."
                      style={inp}
                    />
                    <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "4px" }}>
                      In Teams: go to the channel → Workflows → Post to a channel when a webhook request is received.
                    </div>
                  </div>
                  <div>
                    <label style={lbl}>Minimum severity for real-time alarm notifications</label>
                    <select
                      value={cfg("teams:min_severity", "CRITICAL")}
                      onChange={e => setCfg("teams:min_severity", e.target.value)}
                      style={inp}
                    >
                      <option value="CRITICAL">Critical only</option>
                      <option value="WARNING">Warning and above</option>
                      <option value="INFO">All alarms</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                  <button
                    onClick={() => saveIntegration(["teams:webhook_url", "teams:min_severity"])}
                    disabled={savingIntegration}
                    style={{ fontSize: "14px", fontWeight: 500, padding: "8px 16px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer", opacity: savingIntegration ? 0.6 : 1 }}
                  >
                    {savingIntegration ? "Saving..." : "Save"}
                  </button>
                  <button
                    onClick={sendTeamsTest}
                    disabled={sendingTeamsTest}
                    style={{ fontSize: "14px", padding: "8px 16px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: sendingTeamsTest ? "not-allowed" : "pointer", color: "var(--color-text-secondary)", opacity: sendingTeamsTest ? 0.6 : 1 }}
                  >
                    {sendingTeamsTest ? "Sending..." : "Send test card"}
                  </button>
                  {teamsTestResult && (
                    <span style={{ fontSize: "13px", color: teamsTestResult.ok ? "#00d4aa" : "var(--color-text-danger)" }}>
                      {teamsTestResult.message}
                    </span>
                  )}
                </div>
                <div style={{ marginTop: "16px", padding: "12px 14px", background: "var(--color-background-primary)", borderRadius: "8px", border: "0.5px solid var(--color-border-tertiary)", fontSize: "13px", color: "var(--color-text-secondary)" }}>
                  Real-time notifications fire on every new alarm matching the severity filter. The nightly expiration digest also posts to Teams alongside the email.
                </div>
              </SectionCard>
            )}

            {activeSection === "synology" && (
              <SectionCard title="Synology DSM" description="Per-NAS backup monitoring. Credentials are configured on individual NAS assets, not here.">
                <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: 1.7, marginBottom: "20px" }}>
                  Synology backup monitoring is configured per-asset. To enable it on a NAS:
                  <ol style={{ margin: "12px 0 0 18px", padding: 0 }}>
                    <li>Open the NAS asset page (Clients → Assets → select the NAS)</li>
                    <li>Scroll to the <strong>Synology Backups</strong> section</li>
                    <li>Enter the DSM credentials and hit Save</li>
                    <li>Hit <strong>Sync now</strong> to pull backup job status immediately</li>
                  </ol>
                </div>
                <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "8px", padding: "16px", fontSize: "13px" }}>
                  <div style={{ fontWeight: 500, marginBottom: "10px" }}>DSM account setup checklist</div>
                  {[
                    "Control Panel → User & Group → Create a dedicated read-only user (e.g. dochub)",
                    "Applications tab → ensure DSM access is allowed for that user",
                    "Disable 2FA for this account — the API login will fail if 2FA is enabled",
                    "Note the NAS IP and DSM port (default HTTP: 5000, HTTPS: 5001)",
                    "Test login: http://nas-ip:5000/webapi/auth.cgi?api=SYNO.API.Auth&version=3&method=login&account=dochub&passwd=yourpass&session=test&format=sid",
                    "You should get back: {\"data\":{\"sid\":\"...\"},\"success\":true}",
                  ].map((step, i) => (
                    <div key={i} style={{ display: "flex", gap: "10px", padding: "6px 0", borderBottom: i < 5 ? "0.5px solid var(--color-border-tertiary)" : "none" }}>
                      <span style={{ color: "var(--color-accent, #3d6fff)", fontWeight: 600, flexShrink: 0, fontSize: "12px", marginTop: "1px" }}>{i + 1}</span>
                      <span style={{ color: "var(--color-text-secondary)", fontFamily: i >= 4 ? "monospace" : "inherit", fontSize: i >= 4 ? "11px" : "13px" }}>{step}</span>
                    </div>
                  ))}
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
                      <div style={{ fontSize: "14px", color: "#00d4aa", marginBottom: "8px" }}>Migration complete — {migrationResult.migrated} device(s) migrated.</div>
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
                        <button onClick={runMigration} disabled={runningMigration} style={{ fontSize: "13px", fontWeight: 500, padding: "6px 14px", borderRadius: "8px", border: "none", background: "#ff4d6d", color: "white", cursor: "pointer" }}>
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
                        Moving all records from <span style={{ color: "#ff4d6d" }}>{mergePreview.source}</span> → <span style={{ color: "#00d4aa" }}>{mergePreview.target}</span>
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
                          style={{ fontSize: "14px", fontWeight: 500, padding: "8px 18px", borderRadius: "8px", border: "none", background: "#ff4d6d", color: "white", cursor: "pointer" }}
                        >
                          Merge clients
                        </button>
                      ) : (
                        <div style={{ padding: "12px 16px", background: "rgba(239,68,68,0.08)", border: "0.5px solid #ff4d6d66", borderRadius: "8px" }}>
                          <div style={{ fontSize: "14px", fontWeight: 500, color: "#ff4d6d", marginBottom: "8px" }}>
                            Are you sure? This cannot be undone.
                          </div>
                          <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginBottom: "12px" }}>
                            <strong>{mergePreview.source}</strong> will be marked inactive and all its records will be permanently reassigned to <strong>{mergePreview.target}</strong>.
                          </div>
                          <div style={{ display: "flex", gap: "8px" }}>
                            <button
                              onClick={executeMerge}
                              disabled={mergeDoing}
                              style={{ fontSize: "14px", fontWeight: 500, padding: "7px 18px", borderRadius: "8px", border: "none", background: "#ff4d6d", color: "white", cursor: "pointer", opacity: mergeDoing ? 0.6 : 1 }}
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
                    <div style={{ marginTop: "12px", padding: "12px 16px", borderRadius: "8px", background: mergeResult.success ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)", border: `0.5px solid ${mergeResult.success ? "#00d4aa44" : "#ff4d6d44"}`, fontSize: "13px" }}>
                      {mergeResult.success ? (
                        <div>
                          <div style={{ fontWeight: 500, color: "#00d4aa", marginBottom: "4px" }}>Merge complete</div>
                          <div style={{ color: "var(--color-text-secondary)" }}>All records from <strong>{mergeResult.source}</strong> have been moved to <strong>{mergeResult.target}</strong>. The source client has been marked inactive.</div>
                        </div>
                      ) : (
                        <div style={{ color: "#ff4d6d" }}>Error: {mergeResult.error}</div>
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

            {activeSection === "sync-status" && (
              <SyncStatusPanel />
            )}

            {activeSection === "security" && (
              <SecurityPanel />
            )}

            {activeSection === "api-keys" && (
              <>
                <SectionCard title="Browser Extension" description="Install the DocHub Chrome extension for credential search, autofill, TOTP codes, and password generation.">
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <a
                      href="/dochub-extension.zip"
                      download
                      style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 500, padding: "8px 16px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", textDecoration: "none", cursor: "pointer" }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      Download extension (.zip)
                    </a>
                    <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>v2.0.0</span>
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "10px", lineHeight: "1.6" }}>
                    To install: unzip, open <span style={{ fontFamily: "monospace" }}>chrome://extensions</span>, enable Developer mode, click &quot;Load unpacked&quot;, and select the unzipped folder. Then generate an API key below and paste it into the extension popup.
                  </div>
                </SectionCard>

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

            {activeSection === "my-vault" && (
              <MyVaultSection />
            )}

          </div>
        </div>
      </div>
    </AppShell>
  )
}

// ─── My Vault Section ───────────────────────────────────────────────────────

type PasskeyEntry = { id: string; name: string; lastUsedAt: string | null; createdAt: string }
type VaultEntry = { id: string; label: string; username: string | null; url: string | null; hasSecureNotes: boolean; hasTotp: boolean; createdAt: string; updatedAt: string }
type RevealedEntry = { password: string | null; totpCode: string | null; totpSecret: string | null; secureNotes: string | null }
type NoteEntry = { id: string; title: string; category: string; tags: string[]; isFavorite: boolean; expiryDate: string | null; hasBody: boolean; createdAt: string; updatedAt: string }
type NoteCategory = "LICENSE_KEY" | "RECOVERY_CODES" | "BIOS_FIRMWARE" | "API_TOKEN" | "SOFTWARE_LICENSE" | "SSH_KEY" | "PROCEDURE" | "GENERIC"

const NOTE_CATEGORIES: { value: NoteCategory; label: string }[] = [
  { value: "LICENSE_KEY", label: "License key" },
  { value: "RECOVERY_CODES", label: "Recovery codes" },
  { value: "BIOS_FIRMWARE", label: "BIOS / Firmware" },
  { value: "API_TOKEN", label: "API token" },
  { value: "SOFTWARE_LICENSE", label: "Software license" },
  { value: "SSH_KEY", label: "SSH key" },
  { value: "PROCEDURE", label: "Procedure" },
  { value: "GENERIC", label: "Generic" },
]

function noteCategoryLabel(c: string): string {
  return NOTE_CATEGORIES.find(x => x.value === c)?.label ?? c
}

type SyncStatusRow = {
  key: string
  status: "OK" | "ERROR" | "DEGRADED" | "UNCONFIGURED"
  lastRunAt: string
  message: string | null
}

const INTEGRATION_LABELS: Record<string, string> = {
  syncro:       "SyncroMSP",
  domains:      "Domain / SSL monitor",
  alerts:       "Expiration alerts",
  synology:     "Synology backups",
  unifiLocal:   "UniFi (local controller)",
  uptime:       "HTTP uptime probes",
  backupVerify: "Backup verification",
  meraki:       "Cisco Meraki",
  pax8:         "Pax8 licenses",
  sonicwall:    "SonicWall firewalls",
  unifiCloud:   "UniFi (cloud / controller)",
}

const STATUS_STYLES: Record<SyncStatusRow["status"], { bg: string; fg: string; label: string }> = {
  OK:           { bg: "rgba(34,197,94,0.14)",  fg: "#16a34a", label: "OK" },
  ERROR:        { bg: "rgba(239,68,68,0.14)",  fg: "#dc2626", label: "ERROR" },
  DEGRADED:     { bg: "rgba(245,158,11,0.14)", fg: "#b45309", label: "DEGRADED" },
  UNCONFIGURED: { bg: "rgba(148,163,184,0.18)", fg: "#64748b", label: "UNCONFIGURED" },
}

function relativeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60) return "just now"
  const mins = Math.floor(secs / 60); if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60); if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function SyncStatusPanel() {
  const [rows, setRows] = useState<SyncStatusRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/sync-status")
      .then(r => r.ok ? r.json() : [])
      .then(setRows)
      .finally(() => setLoading(false))
  }, [])

  return (
    <SectionCard
      title="Integration Sync Status"
      description="Last run + last error per integration. Updated every nightly cron."
    >
      {loading ? (
        <p style={{ color: "var(--color-text-secondary)", fontSize: 14 }}>Loading...</p>
      ) : rows.length === 0 ? (
        <p style={{ color: "var(--color-text-secondary)", fontSize: 14 }}>
          No sync runs recorded yet. The next nightly cron will populate this list.
        </p>
      ) : (
        <div style={{
          border: "0.5px solid var(--color-border-tertiary)",
          borderRadius: 10, overflow: "hidden",
        }}>
          {rows.map((r, i) => {
            const s = STATUS_STYLES[r.status]
            return (
              <div key={r.key} style={{
                display: "grid",
                gridTemplateColumns: "1.5fr 100px 120px 1fr",
                gap: 12,
                padding: "12px 16px",
                alignItems: "center",
                borderBottom: i < rows.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none",
                background: "var(--color-background-primary)",
              }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>
                  {INTEGRATION_LABELS[r.key] ?? r.key}
                </div>
                <div>
                  <span style={{
                    fontSize: 10, fontWeight: 600,
                    padding: "2px 7px", borderRadius: 10,
                    background: s.bg, color: s.fg,
                  }}>{s.label}</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                  {relativeAgo(r.lastRunAt)}
                </div>
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                  {r.message || (r.status === "OK" ? "—" : "")}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </SectionCard>
  )
}

type StaffRow = { id: string; name: string | null; email: string; role: string; ipAllowlist: string[] }

function SecurityPanel() {
  const [enforced, setEnforced] = useState<boolean>(false)
  const [savingFlag, setSavingFlag] = useState(false)
  const [staff, setStaff] = useState<StaffRow[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch("/api/settings/integrations").then(r => r.json()),
      fetch("/api/staff").then(r => r.json()),
    ]).then(([cfg, st]) => {
      setEnforced(cfg["security:staff_ip_allowlist_enabled"] === "true")
      setStaff(st as StaffRow[])
      const d: Record<string, string> = {}
      for (const s of st) d[s.id] = (s.ipAllowlist ?? []).join("\n")
      setDrafts(d)
    }).finally(() => setLoaded(true))
  }, [])

  async function saveFlag(next: boolean) {
    setSavingFlag(true)
    setEnforced(next)
    try {
      await fetch("/api/settings/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ "security:staff_ip_allowlist_enabled": next ? "true" : "false" }),
      })
    } finally {
      setSavingFlag(false)
    }
  }

  async function saveAllowlist(id: string) {
    setSavingId(id)
    const list = drafts[id].split(/\r?\n/).map(s => s.trim()).filter(Boolean)
    try {
      const res = await fetch(`/api/staff/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ipAllowlist: list }),
      })
      if (res.ok) {
        const updated = await res.json()
        setStaff(prev => prev.map(s => s.id === id ? { ...s, ipAllowlist: updated.ipAllowlist } : s))
      }
    } finally {
      setSavingId(null)
    }
  }

  return (
    <SectionCard
      title="Staff IP allowlist"
      description="Restrict staff sign-in / API access to specific IP ranges. Tailscale CGNAT (100.64.0.0/10) is always allowed so a misconfigured list can be recovered from the tailnet."
    >
      <div style={{
        display: "flex", alignItems: "center", gap: "12px",
        padding: "12px 14px", borderRadius: 8,
        background: enforced ? "rgba(220,38,38,0.08)" : "var(--color-background-primary)",
        border: `0.5px solid ${enforced ? "rgba(220,38,38,0.3)" : "var(--color-border-tertiary)"}`,
        marginBottom: 16,
      }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flex: 1 }}>
          <input
            type="checkbox"
            checked={enforced}
            onChange={(e) => saveFlag(e.target.checked)}
            disabled={savingFlag}
          />
          <span style={{ fontSize: 14, fontWeight: 500 }}>
            Enforce IP allowlist on every staff request
          </span>
        </label>
        {enforced && (
          <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10, background: "rgba(220,38,38,0.16)", color: "#dc2626" }}>
            ENFORCED
          </span>
        )}
      </div>
      <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 16 }}>
        ⚠ Before flipping this on, confirm at least one entry on every active staff user covers their current IP — or that they can reach DocHub via Tailscale (always allowed). To recover a lockout: SSH to the host and run <code>UPDATE &quot;AppSetting&quot; SET value=&apos;false&apos; WHERE key=&apos;security:staff_ip_allowlist_enabled&apos;</code>.
      </div>

      {!loaded ? (
        <p style={{ color: "var(--color-text-secondary)", fontSize: 14 }}>Loading...</p>
      ) : (
        <div style={{
          border: "0.5px solid var(--color-border-tertiary)",
          borderRadius: 10, overflow: "hidden",
        }}>
          {staff.map((s, i) => (
            <div key={s.id} style={{
              padding: "12px 16px",
              borderBottom: i < staff.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none",
              background: "var(--color-background-primary)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{s.name || s.email}</div>
                  <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{s.email} · {s.role}</div>
                </div>
                <button
                  onClick={() => saveAllowlist(s.id)}
                  disabled={savingId === s.id}
                  style={{
                    fontSize: 12, padding: "5px 12px", borderRadius: 6,
                    border: "0.5px solid var(--color-border-secondary)",
                    background: "var(--color-text-primary)",
                    color: "var(--color-background-primary)",
                    cursor: "pointer",
                  }}
                >
                  {savingId === s.id ? "Saving..." : "Save"}
                </button>
              </div>
              <textarea
                value={drafts[s.id] ?? ""}
                onChange={(e) => setDrafts(prev => ({ ...prev, [s.id]: e.target.value }))}
                placeholder="One CIDR per line (e.g., 203.0.113.0/24, 198.51.100.5/32). Leave blank for tailnet-only."
                rows={3}
                style={{
                  width: "100%", padding: "8px 12px", fontSize: 13,
                  fontFamily: "var(--mono)",
                  border: "0.5px solid var(--color-border-secondary)", borderRadius: 6,
                  background: "var(--color-background-primary)", color: "var(--color-text-primary)",
                }}
              />
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

function MyVaultSection() {
  const [vaultUnlocked, setVaultUnlocked] = useState(false)
  const [vaultExpiresAt, setVaultExpiresAt] = useState<string | null>(null)
  const [passkeys, setPasskeys] = useState<PasskeyEntry[]>([])
  const [vaultItems, setVaultItems] = useState<VaultEntry[]>([])
  const [vaultNotes, setVaultNotes] = useState<NoteEntry[]>([])
  const [revealed, setRevealed] = useState<Record<string, RevealedEntry>>({})
  const [revealedNotes, setRevealedNotes] = useState<Record<string, string>>({})
  const [loadingAuth, setLoadingAuth] = useState(false)
  const [loadingRegister, setLoadingRegister] = useState(false)
  const [regName, setRegName] = useState("")
  const [showAddForm, setShowAddForm] = useState(false)
  const [showAddNoteForm, setShowAddNoteForm] = useState(false)
  const [addForm, setAddForm] = useState({ label: "", username: "", password: "", totp: "", url: "", secureNotes: "" })
  const [addNoteForm, setAddNoteForm] = useState({ title: "", category: "GENERIC" as NoteCategory, body: "", tags: "", expiryDate: "" })
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ label: "", username: "", password: "", totp: "", url: "", secureNotes: "" })
  const [editNoteId, setEditNoteId] = useState<string | null>(null)
  const [editNoteForm, setEditNoteForm] = useState({ title: "", category: "GENERIC" as NoteCategory, body: "", tags: "", expiryDate: "" })
  const [typeFilter, setTypeFilter] = useState<"all" | "credentials" | "notes">("all")
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null)
  const [totpSecondsLeft, setTotpSecondsLeft] = useState(30 - (Math.floor(Date.now() / 1000) % 30))

  useEffect(() => {
    loadSession()
    loadPasskeys()
  }, [])

  useEffect(() => {
    if (vaultUnlocked) { loadVaultItems(); loadVaultNotes() }
  }, [vaultUnlocked])

  useEffect(() => {
    const tick = () => {
      const s = 30 - (Math.floor(Date.now() / 1000) % 30)
      setTotpSecondsLeft(s)
      if (s === 30) {
        // Refresh all revealed TOTP codes at the boundary
        setRevealed(prev => {
          const updated = { ...prev }
          Object.keys(updated).forEach(id => {
            if (updated[id].totpSecret) {
              updated[id] = { ...updated[id], totpCode: computeTotp(updated[id].totpSecret!) }
            }
          })
          return updated
        })
      }
    }
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [])

  function computeTotp(secret: string): string {
    // Client-side TOTP for display refresh (same RFC 6238 logic)
    const epoch = Math.floor(Date.now() / 1000)
    const counter = Math.floor(epoch / 30)
    // We can't do HMAC-SHA1 purely in browser without crypto subtle — just show "refresh"
    // This will be replaced by re-fetching from server at the boundary
    return "——"
  }

  async function loadSession() {
    const r = await fetch("/api/personal-vault/session")
    if (r.ok) {
      const d = await r.json()
      setVaultUnlocked(d.unlocked)
      setVaultExpiresAt(d.expiresAt || null)
    }
  }

  async function loadPasskeys() {
    const r = await fetch("/api/passkey")
    if (r.ok) setPasskeys(await r.json())
  }

  async function loadVaultItems() {
    const r = await fetch("/api/personal-vault")
    if (r.ok) setVaultItems(await r.json())
  }

  async function loadVaultNotes() {
    const r = await fetch("/api/personal-vault/notes")
    if (r.ok) setVaultNotes(await r.json())
  }

  function flash(type: "ok" | "err", text: string) {
    setMsg({ type, text })
    setTimeout(() => setMsg(null), 4000)
  }

  async function registerPasskey() {
    if (!regName.trim()) { flash("err", "Enter a name for this passkey first"); return }
    if (!window.PublicKeyCredential) { flash("err", "WebAuthn not supported in this browser"); return }
    setLoadingRegister(true)
    try {
      const { startRegistration } = await import("@simplewebauthn/browser")
      const optRes = await fetch("/api/passkey/register/options", { method: "POST" })
      if (!optRes.ok) { flash("err", "Failed to get registration options"); return }
      const options = await optRes.json()
      const attestation = await startRegistration(options)
      const verRes = await fetch("/api/passkey/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: regName.trim(), ...attestation }),
      })
      if (!verRes.ok) { flash("err", "Registration verification failed"); return }
      flash("ok", "Passkey registered!")
      setRegName("")
      loadPasskeys()
    } catch (e: any) {
      flash("err", e.message || "Registration failed")
    } finally {
      setLoadingRegister(false)
    }
  }

  async function deletePasskey(id: string) {
    if (!confirm("Remove this passkey?")) return
    const r = await fetch(`/api/passkey/${id}`, { method: "DELETE" })
    if (r.ok) { loadPasskeys(); flash("ok", "Passkey removed") }
  }

  async function unlockVault() {
    if (!window.PublicKeyCredential) { flash("err", "WebAuthn not supported in this browser"); return }
    setLoadingAuth(true)
    try {
      const { startAuthentication } = await import("@simplewebauthn/browser")
      const optRes = await fetch("/api/passkey/auth/options", { method: "POST" })
      if (!optRes.ok) {
        const d = await optRes.json()
        flash("err", d.error || "Failed to start authentication")
        return
      }
      const options = await optRes.json()
      const assertion = await startAuthentication(options)
      const verRes = await fetch("/api/passkey/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(assertion),
      })
      if (!verRes.ok) { flash("err", "Authentication failed"); return }
      const d = await verRes.json()
      setVaultUnlocked(true)
      setVaultExpiresAt(d.expiresAt)
      flash("ok", "Vault unlocked for 15 minutes")
      loadVaultItems()
    } catch (e: any) {
      flash("err", e.message || "Authentication failed")
    } finally {
      setLoadingAuth(false)
    }
  }

  async function lockVault() {
    await fetch("/api/personal-vault/session", { method: "DELETE" })
    setVaultUnlocked(false)
    setVaultExpiresAt(null)
    setVaultItems([])
    setVaultNotes([])
    setRevealed({})
    setRevealedNotes({})
  }

  async function revealItem(id: string) {
    const r = await fetch(`/api/personal-vault/${id}/reveal`)
    if (!r.ok) { flash("err", "Could not reveal — is vault still unlocked?"); return }
    const d = await r.json()
    setRevealed(prev => ({ ...prev, [id]: d }))
  }

  async function revealNote(id: string) {
    const r = await fetch(`/api/personal-vault/notes/${id}/reveal`)
    if (!r.ok) { flash("err", "Could not reveal — is vault still unlocked?"); return }
    const d = await r.json()
    setRevealedNotes(prev => ({ ...prev, [id]: d.body }))
  }

  async function addItem() {
    if (!addForm.label.trim()) { flash("err", "Label is required"); return }
    const r = await fetch("/api/personal-vault", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(addForm),
    })
    if (!r.ok) { flash("err", "Failed to add"); return }
    setShowAddForm(false)
    setAddForm({ label: "", username: "", password: "", totp: "", url: "", secureNotes: "" })
    loadVaultItems()
    flash("ok", "Added")
  }

  async function addNote() {
    if (!addNoteForm.title.trim()) { flash("err", "Title is required"); return }
    if (!addNoteForm.body) { flash("err", "Body is required"); return }
    const tags = addNoteForm.tags.split(",").map(t => t.trim()).filter(Boolean)
    const r = await fetch("/api/personal-vault/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: addNoteForm.title,
        body: addNoteForm.body,
        category: addNoteForm.category,
        tags,
        expiryDate: addNoteForm.expiryDate || null,
      }),
    })
    if (!r.ok) { flash("err", "Failed to add note"); return }
    setShowAddNoteForm(false)
    setAddNoteForm({ title: "", category: "GENERIC", body: "", tags: "", expiryDate: "" })
    loadVaultNotes()
    flash("ok", "Note added")
  }

  async function saveEdit(id: string) {
    const r = await fetch(`/api/personal-vault/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    })
    if (!r.ok) { flash("err", "Failed to save"); return }
    setEditId(null)
    loadVaultItems()
    flash("ok", "Saved")
  }

  async function saveNoteEdit(id: string) {
    const tags = editNoteForm.tags.split(",").map(t => t.trim()).filter(Boolean)
    const payload: any = {
      title: editNoteForm.title,
      category: editNoteForm.category,
      tags,
      expiryDate: editNoteForm.expiryDate || null,
    }
    if (editNoteForm.body.length > 0) payload.body = editNoteForm.body
    const r = await fetch(`/api/personal-vault/notes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    if (!r.ok) { flash("err", "Failed to save"); return }
    setEditNoteId(null)
    // Clear cached reveal so a subsequent reveal fetches the new body
    setRevealedNotes(prev => { const n = { ...prev }; delete n[id]; return n })
    loadVaultNotes()
    flash("ok", "Note saved")
  }

  async function deleteItem(id: string) {
    if (!confirm("Delete this credential?")) return
    await fetch(`/api/personal-vault/${id}`, { method: "DELETE" })
    setVaultItems(prev => prev.filter(x => x.id !== id))
    flash("ok", "Deleted")
  }

  async function deleteNote(id: string) {
    if (!confirm("Delete this note? This cannot be undone.")) return
    await fetch(`/api/personal-vault/notes/${id}`, { method: "DELETE" })
    setVaultNotes(prev => prev.filter(x => x.id !== id))
    flash("ok", "Note deleted")
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => flash("ok", `${label} copied`))
  }

  function copyNoteAsMarkdown(title: string, body: string) {
    const md = `### ${title}\n\n\`\`\`\n${body}\n\`\`\``
    navigator.clipboard.writeText(md).then(() => flash("ok", "Markdown copied"))
  }

  function isExpiringSoon(iso: string | null): boolean {
    if (!iso) return false
    const t = new Date(iso).getTime()
    return t - Date.now() < 30 * 86_400_000 && t > Date.now()
  }
  function isExpired(iso: string | null): boolean {
    if (!iso) return false
    return new Date(iso).getTime() < Date.now()
  }

  const cardStyle: React.CSSProperties = {
    background: "var(--color-background-secondary)",
    border: "0.5px solid var(--color-border-tertiary)",
    borderRadius: "10px",
    padding: "20px",
    marginBottom: "16px",
  }
  const btnPrimary: React.CSSProperties = {
    padding: "7px 14px", fontSize: "13px", fontWeight: 500, borderRadius: "7px",
    background: "var(--color-brand)", color: "#fff", border: "none", cursor: "pointer",
  }
  const btnSecondary: React.CSSProperties = {
    padding: "7px 14px", fontSize: "13px", borderRadius: "7px",
    background: "transparent", color: "var(--color-text-secondary)",
    border: "0.5px solid var(--color-border-secondary)", cursor: "pointer",
  }
  const btnDanger: React.CSSProperties = {
    padding: "5px 10px", fontSize: "12px", borderRadius: "6px",
    background: "transparent", color: "#ff4d6d",
    border: "0.5px solid #ff4d6d", cursor: "pointer",
  }

  return (
    <>
      {msg && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 9999,
          padding: "10px 16px", borderRadius: "8px", fontSize: "13px",
          background: msg.type === "ok" ? "#166534" : "#7f1d1d",
          color: "#fff", boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        }}>{msg.text}</div>
      )}

      {/* Passkey Management */}
      <div style={cardStyle}>
        <div style={{ fontWeight: 600, fontSize: "15px", marginBottom: "4px" }}>Passkeys</div>
        <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginBottom: "16px" }}>
          Register a passkey (Face ID, Touch ID, Windows Hello, or hardware key) to unlock your personal vault.
        </div>

        {passkeys.length === 0 && (
          <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginBottom: "12px" }}>
            No passkeys registered yet.
          </div>
        )}

        {passkeys.map(pk => (
          <div key={pk.id} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, padding: "8px 12px", background: "var(--color-background-primary)", borderRadius: 8, border: "0.5px solid var(--color-border-secondary)" }}>
            <span style={{ fontSize: "18px" }}>🔑</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "13px", fontWeight: 500 }}>{pk.name}</div>
              <div style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>
                Last used: {pk.lastUsedAt ? new Date(pk.lastUsedAt).toLocaleDateString() : "Never"} · Added {new Date(pk.createdAt).toLocaleDateString()}
              </div>
            </div>
            <button style={btnDanger} onClick={() => deletePasskey(pk.id)}>Remove</button>
          </div>
        ))}

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <input
            value={regName}
            onChange={e => setRegName(e.target.value)}
            placeholder='Passkey name (e.g. "MacBook Touch ID")'
            style={{ ...inp, flex: 1, maxWidth: 300 }}
          />
          <button style={btnPrimary} onClick={registerPasskey} disabled={loadingRegister}>
            {loadingRegister ? "Registering…" : "Register Passkey"}
          </button>
        </div>
      </div>

      {/* Vault Lock/Unlock + mixed list of Credentials and Notes */}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: "15px" }}>Personal Vault</div>
            <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>
              {vaultUnlocked
                ? `Unlocked · expires ${vaultExpiresAt ? new Date(vaultExpiresAt).toLocaleTimeString() : "soon"}`
                : "Locked — authenticate with a passkey to access"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {!vaultUnlocked ? (
              <button style={btnPrimary} onClick={unlockVault} disabled={loadingAuth || passkeys.length === 0}>
                {loadingAuth ? "Authenticating…" : passkeys.length === 0 ? "Register a passkey first" : "Unlock Vault"}
              </button>
            ) : (
              <button style={btnSecondary} onClick={lockVault}>Lock</button>
            )}
          </div>
        </div>

        {vaultUnlocked && (
          <>
            {/* Type filter chips */}
            <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
              {(["all", "credentials", "notes"] as const).map(f => {
                const active = typeFilter === f
                return (
                  <button key={f} onClick={() => setTypeFilter(f)} style={{
                    fontSize: 11, padding: "4px 10px", borderRadius: 12,
                    background: active ? "var(--color-accent-muted)" : "var(--color-background-hover)",
                    color: active ? "var(--color-accent)" : "var(--color-text-secondary)",
                    border: "none", cursor: "pointer", textTransform: "capitalize",
                  }}>
                    {f === "all" ? "All" : f === "credentials" ? `Credentials (${vaultItems.length})` : `Notes (${vaultNotes.length})`}
                  </button>
                )
              })}
            </div>

            {/* Credentials */}
            {typeFilter !== "notes" && vaultItems.map(item => (
              <div key={item.id} style={{ marginBottom: 12, padding: "12px", background: "var(--color-background-primary)", borderRadius: 8, border: "0.5px solid var(--color-border-secondary)" }}>
                {editId === item.id ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <input placeholder="Label *" value={editForm.label} onChange={e => setEditForm(f => ({ ...f, label: e.target.value }))} style={inp} />
                    <input placeholder="Username" value={editForm.username} onChange={e => setEditForm(f => ({ ...f, username: e.target.value }))} style={inp} />
                    <input placeholder="Password (leave blank to keep existing)" type="password" value={editForm.password} onChange={e => setEditForm(f => ({ ...f, password: e.target.value }))} style={inp} />
                    <input placeholder="TOTP secret (leave blank to keep existing)" value={editForm.totp} onChange={e => setEditForm(f => ({ ...f, totp: e.target.value }))} style={inp} />
                    <input placeholder="URL" value={editForm.url} onChange={e => setEditForm(f => ({ ...f, url: e.target.value }))} style={inp} />
                    <textarea placeholder="Secure notes (encrypted)" value={editForm.secureNotes} onChange={e => setEditForm(f => ({ ...f, secureNotes: e.target.value }))} rows={4} style={{ ...inp, resize: "vertical", fontFamily: "var(--mono, ui-monospace, SFMono-Regular, Menlo, monospace)", fontSize: 12 }} />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button style={btnPrimary} onClick={() => saveEdit(item.id)}>Save</button>
                      <button style={btnSecondary} onClick={() => setEditId(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: "var(--color-accent-muted)", color: "var(--color-accent)" }}>Credential</span>
                        <div style={{ fontWeight: 500, fontSize: "14px" }}>{item.label}</div>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button style={btnSecondary} onClick={async () => {
                          // Pre-fetch existing secureNotes for editing
                          let existingNotes = ""
                          if (item.hasSecureNotes) {
                            const r = await fetch(`/api/personal-vault/${item.id}/reveal`)
                            if (r.ok) { const d = await r.json(); existingNotes = d.secureNotes || "" }
                          }
                          setEditId(item.id)
                          setEditForm({ label: item.label, username: item.username || "", password: "", totp: "", url: item.url || "", secureNotes: existingNotes })
                        }}>Edit</button>
                        <button style={btnDanger} onClick={() => deleteItem(item.id)}>Delete</button>
                      </div>
                    </div>
                    {item.username && <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: 2 }}>{item.username}</div>}
                    {item.url && <div style={{ fontSize: "12px", color: "var(--color-brand)", marginTop: 2 }}><a href={item.url} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>{item.url}</a></div>}
                    {item.hasSecureNotes && <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2, fontStyle: "italic" }}>has secure notes</div>}
                    <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" as const }}>
                      {!revealed[item.id] ? (
                        <button style={{ ...btnSecondary, fontSize: "12px", padding: "4px 10px" }} onClick={() => revealItem(item.id)}>Reveal</button>
                      ) : (
                        <>
                          {revealed[item.id].password && (
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <code style={{ fontSize: "12px", background: "var(--color-background-secondary)", padding: "2px 8px", borderRadius: 4 }}>{revealed[item.id].password}</code>
                              <button style={{ ...btnSecondary, fontSize: "11px", padding: "2px 8px" }} onClick={() => copyToClipboard(revealed[item.id].password!, "Password")}>Copy</button>
                            </div>
                          )}
                          {revealed[item.id].totpCode && (
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <code style={{ fontSize: "14px", fontWeight: 600, letterSpacing: "0.1em", color: totpSecondsLeft <= 5 ? "#ffb347" : "var(--color-text-primary)" }}>
                                {revealed[item.id].totpCode}
                              </code>
                              <span style={{ fontSize: "11px", color: totpSecondsLeft <= 5 ? "#ffb347" : "var(--color-text-secondary)" }}>{totpSecondsLeft}s</span>
                              <button style={{ ...btnSecondary, fontSize: "11px", padding: "2px 8px" }} onClick={() => copyToClipboard(revealed[item.id].totpCode!, "TOTP code")}>Copy</button>
                            </div>
                          )}
                          {revealed[item.id].secureNotes && (
                            <div style={{ width: "100%", marginTop: 6, padding: 8, background: "var(--color-background-secondary)", borderRadius: 4, fontFamily: "var(--mono, ui-monospace, SFMono-Regular, Menlo, monospace)", fontSize: 12, whiteSpace: "pre-wrap" as const }}>
                              {revealed[item.id].secureNotes}
                              <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
                                <button style={{ ...btnSecondary, fontSize: "11px", padding: "2px 8px" }} onClick={() => copyToClipboard(revealed[item.id].secureNotes!, "Notes")}>Copy</button>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Notes */}
            {typeFilter !== "credentials" && vaultNotes.map(n => (
              <div key={n.id} style={{ marginBottom: 12, padding: "12px", background: "var(--color-background-primary)", borderRadius: 8, border: "0.5px solid var(--color-border-secondary)" }}>
                {editNoteId === n.id ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <input placeholder="Title *" value={editNoteForm.title} onChange={e => setEditNoteForm(f => ({ ...f, title: e.target.value }))} style={inp} />
                    <select value={editNoteForm.category} onChange={e => setEditNoteForm(f => ({ ...f, category: e.target.value as NoteCategory }))} style={inp}>
                      {NOTE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                    <textarea placeholder="Body (leave blank to keep existing)" value={editNoteForm.body} onChange={e => setEditNoteForm(f => ({ ...f, body: e.target.value }))} rows={10} style={{ ...inp, resize: "vertical", fontFamily: "var(--mono, ui-monospace, SFMono-Regular, Menlo, monospace)", fontSize: 12 }} />
                    <input placeholder="Tags (comma-separated)" value={editNoteForm.tags} onChange={e => setEditNoteForm(f => ({ ...f, tags: e.target.value }))} style={inp} />
                    <input type="date" placeholder="Expires" value={editNoteForm.expiryDate} onChange={e => setEditNoteForm(f => ({ ...f, expiryDate: e.target.value }))} style={inp} />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button style={btnPrimary} onClick={() => saveNoteEdit(n.id)}>Save</button>
                      <button style={btnSecondary} onClick={() => setEditNoteId(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const }}>
                        <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: "var(--color-background-hover)", color: "var(--color-text-secondary)" }}>Note</span>
                        <div style={{ fontWeight: 500, fontSize: "14px" }}>{n.title}</div>
                        <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: "var(--color-background-hover)", color: "var(--color-text-muted)", fontStyle: "italic" }}>{noteCategoryLabel(n.category)}</span>
                        {isExpired(n.expiryDate) && <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: "var(--color-background-danger, rgba(239,68,68,0.14))", color: "var(--color-text-danger, #ff4d6d)" }}>Expired</span>}
                        {!isExpired(n.expiryDate) && isExpiringSoon(n.expiryDate) && <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: "var(--color-background-warning, rgba(245,158,11,0.14))", color: "var(--color-text-warning, #b45309)" }}>Expiring ≤30d</span>}
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button style={btnSecondary} onClick={() => {
                          setEditNoteId(n.id)
                          setEditNoteForm({
                            title: n.title,
                            category: n.category as NoteCategory,
                            body: "",
                            tags: n.tags.join(", "),
                            expiryDate: n.expiryDate ? n.expiryDate.slice(0, 10) : "",
                          })
                        }}>Edit</button>
                        <button style={btnDanger} onClick={() => deleteNote(n.id)}>Delete</button>
                      </div>
                    </div>
                    {n.tags.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 4, marginTop: 6 }}>
                        {n.tags.map(t => <span key={t} style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: "var(--color-background-hover)", color: "var(--color-text-secondary)" }}>{t}</span>)}
                      </div>
                    )}
                    <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" as const }}>
                      {!revealedNotes[n.id] ? (
                        <button style={{ ...btnSecondary, fontSize: "12px", padding: "4px 10px" }} onClick={() => revealNote(n.id)}>Reveal</button>
                      ) : (
                        <div style={{ width: "100%", padding: 8, background: "var(--color-background-secondary)", borderRadius: 4, fontFamily: "var(--mono, ui-monospace, SFMono-Regular, Menlo, monospace)", fontSize: 12, whiteSpace: "pre-wrap" as const }}>
                          {revealedNotes[n.id]}
                          <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
                            <button style={{ ...btnSecondary, fontSize: "11px", padding: "2px 8px" }} onClick={() => copyToClipboard(revealedNotes[n.id], "Body")}>Copy body</button>
                            <button style={{ ...btnSecondary, fontSize: "11px", padding: "2px 8px" }} onClick={() => copyNoteAsMarkdown(n.title, revealedNotes[n.id])}>Copy as markdown</button>
                            <button style={{ ...btnSecondary, fontSize: "11px", padding: "2px 8px" }} onClick={() => setRevealedNotes(prev => { const x = { ...prev }; delete x[n.id]; return x })}>Hide</button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Empty state */}
            {vaultItems.length === 0 && vaultNotes.length === 0 && !showAddForm && !showAddNoteForm && (
              <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginBottom: 12 }}>
                Your vault is empty. Save your first credential or note below.
              </div>
            )}

            {/* Add credential form */}
            {showAddForm && (
              <div style={{ padding: "12px", background: "var(--color-background-primary)", borderRadius: 8, border: "0.5px solid var(--color-border-secondary)", marginBottom: 12 }}>
                <div style={{ fontWeight: 500, fontSize: "13px", marginBottom: 10 }}>New Credential</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <input placeholder="Label *" value={addForm.label} onChange={e => setAddForm(f => ({ ...f, label: e.target.value }))} style={inp} />
                  <input placeholder="Username" value={addForm.username} onChange={e => setAddForm(f => ({ ...f, username: e.target.value }))} style={inp} />
                  <input placeholder="Password" type="password" value={addForm.password} onChange={e => setAddForm(f => ({ ...f, password: e.target.value }))} style={inp} />
                  <input placeholder="TOTP secret (base32)" value={addForm.totp} onChange={e => setAddForm(f => ({ ...f, totp: e.target.value }))} style={inp} />
                  <input placeholder="URL" value={addForm.url} onChange={e => setAddForm(f => ({ ...f, url: e.target.value }))} style={inp} />
                  <textarea placeholder="Secure notes (encrypted)" value={addForm.secureNotes} onChange={e => setAddForm(f => ({ ...f, secureNotes: e.target.value }))} rows={4} style={{ ...inp, resize: "vertical", fontFamily: "var(--mono, ui-monospace, SFMono-Regular, Menlo, monospace)", fontSize: 12 }} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button style={btnPrimary} onClick={addItem}>Add</button>
                    <button style={btnSecondary} onClick={() => setShowAddForm(false)}>Cancel</button>
                  </div>
                </div>
              </div>
            )}

            {/* Add note form */}
            {showAddNoteForm && (
              <div style={{ padding: "12px", background: "var(--color-background-primary)", borderRadius: 8, border: "0.5px solid var(--color-border-secondary)", marginBottom: 12 }}>
                <div style={{ fontWeight: 500, fontSize: "13px", marginBottom: 10 }}>New Secure Note</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <input placeholder="Title *" value={addNoteForm.title} onChange={e => setAddNoteForm(f => ({ ...f, title: e.target.value }))} style={inp} />
                  <select value={addNoteForm.category} onChange={e => setAddNoteForm(f => ({ ...f, category: e.target.value as NoteCategory }))} style={inp}>
                    {NOTE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                  <textarea placeholder="Body * (e.g. recovery codes, license keys, BIOS unlock procedure)" value={addNoteForm.body} onChange={e => setAddNoteForm(f => ({ ...f, body: e.target.value }))} rows={10} style={{ ...inp, resize: "vertical", fontFamily: "var(--mono, ui-monospace, SFMono-Regular, Menlo, monospace)", fontSize: 12 }} />
                  <input placeholder="Tags (comma-separated, optional)" value={addNoteForm.tags} onChange={e => setAddNoteForm(f => ({ ...f, tags: e.target.value }))} style={inp} />
                  <input type="date" value={addNoteForm.expiryDate} onChange={e => setAddNoteForm(f => ({ ...f, expiryDate: e.target.value }))} style={inp} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button style={btnPrimary} onClick={addNote}>Add Note</button>
                    <button style={btnSecondary} onClick={() => setShowAddNoteForm(false)}>Cancel</button>
                  </div>
                </div>
              </div>
            )}

            {/* Add buttons */}
            {!showAddForm && !showAddNoteForm && (
              <div style={{ display: "flex", gap: 8 }}>
                <button style={btnPrimary} onClick={() => setShowAddForm(true)}>+ Credential</button>
                <button style={btnSecondary} onClick={() => setShowAddNoteForm(true)}>+ Note</button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
