"use client"

import AppShell from "@/components/AppShell"
import { useState, useEffect } from "react"
import { useTheme, themes } from "@/components/ThemeProvider"

type AssetType = { id: string; name: string; description: string | null; sortOrder: number }

const inputStyle = {
  width: "100%", padding: "8px 12px", fontSize: "14px",
  border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px",
  background: "var(--color-background-primary)", color: "var(--color-text-primary)",
  boxSizing: "border-box" as const,
}
const labelStyle = { fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }

const DEFAULT_TYPES = [
  { name: "Computer / Desktop", sortOrder: 1 },
  { name: "Laptop", sortOrder: 2 },
  { name: "Server", sortOrder: 3 },
  { name: "NAS", sortOrder: 4 },
  { name: "Router", sortOrder: 5 },
  { name: "Network Switch", sortOrder: 6 },
  { name: "Access Point", sortOrder: 7 },
  { name: "Firewall", sortOrder: 8 },
  { name: "Printer", sortOrder: 9 },
  { name: "Tablet", sortOrder: 10 },
  { name: "Phone System", sortOrder: 11 },
  { name: "Phone Endpoint", sortOrder: 12 },
  { name: "UPS", sortOrder: 13 },
  { name: "Website", sortOrder: 14 },
  { name: "VPN", sortOrder: 15 },
  { name: "Other", sortOrder: 99 },
]

const SOURCE_LABELS: Record<string, string> = {
  SYNCRO:   "Syncro",
  UNIFI:    "Unifi",
  ITFLOW:   "ITFlow",
  PAX8:     "Pax8",
  PULSEWAY: "Pulseway",
}

export default function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const [domainThreshold, setDomainThresholdState] = useState(30)
  const [savingThreshold, setSavingThreshold] = useState(false)
  const [thresholdInput, setThresholdInput] = useState("30")
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<any>(null)

  const [assetTypes, setAssetTypes] = useState<AssetType[]>([])
  const [loadingTypes, setLoadingTypes] = useState(true)
  const [showAddType, setShowAddType] = useState(false)
  const [typeForm, setTypeForm] = useState({ name: "", description: "", sortOrder: "" })
  const [savingType, setSavingType] = useState(false)
  const [editingType, setEditingType] = useState<string | null>(null)
  const [typeEditForm, setTypeEditForm] = useState<any>({})
  const [seedingDefaults, setSeedingDefaults] = useState(false)

  const [sourceColors, setSourceColors] = useState<Record<string, string>>({
    SYNCRO: "#3b82f6", UNIFI: "#8b5cf6", ITFLOW: "#f97316", PAX8: "#10b981", PULSEWAY: "#ec4899",
  })
  const [savingColors, setSavingColors] = useState(false)

  useEffect(() => {
    fetchAssetTypes()
    fetch("/api/settings/domain-threshold")
      .then(r => r.json())
      .then(d => { setDomainThresholdState(d.days); setThresholdInput(String(d.days)) })
      .catch(() => {})
    fetch("/api/settings/source-colors")
      .then(r => r.json())
      .then(d => setSourceColors(d))
      .catch(() => {})
  }, [])

  async function saveSourceColors() {
    setSavingColors(true)
    try {
      const res = await fetch("/api/settings/source-colors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sourceColors),
      })
      if (res.ok) setSourceColors(await res.json())
    } catch {}
    finally { setSavingColors(false) }
  }

  async function saveThreshold() {
    setSavingThreshold(true)
    try {
      const res = await fetch("/api/settings/domain-threshold", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: thresholdInput }),
      })
      if (res.ok) {
        const data = await res.json()
        setDomainThresholdState(data.days)
        setThresholdInput(String(data.days))
      }
    } catch {}
    finally { setSavingThreshold(false) }
  }

  async function fetchAssetTypes() {
    setLoadingTypes(true)
    try {
      const res = await fetch("/api/asset-types")
      setAssetTypes(await res.json())
    } catch {}
    finally { setLoadingTypes(false) }
  }

  async function saveType() {
    if (!typeForm.name.trim()) return
    setSavingType(true)
    try {
      const res = await fetch("/api/asset-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(typeForm),
      })
      if (res.ok) {
        const newType = await res.json()
        setAssetTypes(t => [...t, newType].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)))
        setTypeForm({ name: "", description: "", sortOrder: "" })
        setShowAddType(false)
      }
    } catch {}
    finally { setSavingType(false) }
  }

  async function updateType(typeId: string) {
    try {
      const res = await fetch(`/api/asset-types/${typeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(typeEditForm),
      })
      if (res.ok) {
        const updated = await res.json()
        setAssetTypes(t => t.map(x => x.id === typeId ? updated : x)
          .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)))
        setEditingType(null)
      }
    } catch {}
  }

  async function deleteType(typeId: string) {
    if (!confirm("Remove this asset type? It will no longer appear in dropdowns, but existing assets keep their type.")) return
    try {
      await fetch(`/api/asset-types/${typeId}`, { method: "DELETE" })
      setAssetTypes(t => t.filter(x => x.id !== typeId))
    } catch {}
  }

  async function seedDefaults() {
    setSeedingDefaults(true)
    try {
      const existing = new Set(assetTypes.map(t => t.name.toLowerCase()))
      const toCreate = DEFAULT_TYPES.filter(d => !existing.has(d.name.toLowerCase()))
      const created: AssetType[] = []
      for (const t of toCreate) {
        const res = await fetch("/api/asset-types", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(t),
        })
        if (res.ok) created.push(await res.json())
      }
      setAssetTypes(prev =>
        [...prev, ...created].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      )
    } catch {}
    finally { setSeedingDefaults(false) }
  }

  async function runSync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch("/api/sync/syncro", { method: "POST" })
      const data = await res.json()
      setSyncResult(data)
    } catch (e) {
      setSyncResult({ success: false, error: "Network error" })
    } finally {
      setSyncing(false)
    }
  }

  return (
    <AppShell>
      <div style={{ padding: "32px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 500, marginBottom: "4px" }}>Settings</h1>
        <p style={{ fontSize: "14px", color: "var(--color-text-secondary)", marginBottom: "32px" }}>
          Platform configuration and integrations
        </p>

        <div style={{ maxWidth: "680px" }}>
          {/* Appearance */}
          <div style={{
            background: "var(--color-background-secondary)",
            border: "0.5px solid var(--color-border-tertiary)",
            borderRadius: "10px", padding: "20px", marginBottom: "16px",
          }}>
            <div style={{ fontSize: "15px", fontWeight: 500, marginBottom: "4px" }}>Appearance</div>
            <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>
              DocHub uses the PCC dark theme. Single dark mode — no light mode.
            </div>
          </div>

          {/* Asset Types */}
          <div style={{
            background: "var(--color-background-secondary)",
            border: "0.5px solid var(--color-border-tertiary)",
            borderRadius: "10px", padding: "20px", marginBottom: "16px",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "4px" }}>
              <div style={{ fontSize: "15px", fontWeight: 500 }}>Asset Types</div>
              <div style={{ display: "flex", gap: "8px" }}>
                {assetTypes.length === 0 && !loadingTypes && (
                  <button
                    onClick={seedDefaults} disabled={seedingDefaults}
                    style={{ fontSize: "13px", padding: "6px 12px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: "pointer", color: "var(--color-text-secondary)" }}
                  >
                    {seedingDefaults ? "Adding..." : "Add defaults"}
                  </button>
                )}
                <button
                  onClick={() => setShowAddType(true)}
                  style={{ fontSize: "13px", padding: "6px 12px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: "pointer", color: "var(--color-text-primary)" }}
                >
                  Add type
                </button>
              </div>
            </div>
            <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginBottom: "16px" }}>
              Custom asset types used when creating or editing assets manually.
            </div>

            {showAddType && (
              <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", padding: "16px", marginBottom: "12px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px", gap: "10px", marginBottom: "10px" }}>
                  <div style={{ gridColumn: "1 / 3" }}>
                    <label style={labelStyle}>Name *</label>
                    <input value={typeForm.name} onChange={e => setTypeForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} placeholder="e.g. Router" />
                  </div>
                  <div>
                    <label style={labelStyle}>Order</label>
                    <input value={typeForm.sortOrder} onChange={e => setTypeForm(f => ({ ...f, sortOrder: e.target.value }))} style={inputStyle} placeholder="0" type="number" />
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={labelStyle}>Description</label>
                    <input value={typeForm.description} onChange={e => setTypeForm(f => ({ ...f, description: e.target.value }))} style={inputStyle} placeholder="Optional description" />
                  </div>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button onClick={saveType} disabled={savingType} style={{ fontSize: "13px", fontWeight: 500, padding: "6px 14px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>
                    {savingType ? "Saving..." : "Save"}
                  </button>
                  <button onClick={() => setShowAddType(false)} style={{ fontSize: "13px", padding: "6px 14px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>Cancel</button>
                </div>
              </div>
            )}

            {loadingTypes ? (
              <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>Loading...</div>
            ) : assetTypes.length === 0 && !showAddType ? (
              <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>No asset types yet. Add defaults or create your own.</div>
            ) : (
              <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "8px", overflow: "hidden" }}>
                {assetTypes.map((type, i) => editingType === type.id ? (
                  <div key={type.id} style={{ padding: "12px 14px", borderBottom: i < assetTypes.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none", background: "var(--color-background-primary)" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px", gap: "8px", marginBottom: "8px" }}>
                      <div style={{ gridColumn: "1 / 3" }}>
                        <label style={labelStyle}>Name</label>
                        <input value={typeEditForm.name ?? ""} onChange={e => setTypeEditForm((f: any) => ({ ...f, name: e.target.value }))} style={inputStyle} />
                      </div>
                      <div>
                        <label style={labelStyle}>Order</label>
                        <input type="number" value={typeEditForm.sortOrder ?? 0} onChange={e => setTypeEditForm((f: any) => ({ ...f, sortOrder: e.target.value }))} style={inputStyle} />
                      </div>
                      <div style={{ gridColumn: "1 / -1" }}>
                        <label style={labelStyle}>Description</label>
                        <input value={typeEditForm.description ?? ""} onChange={e => setTypeEditForm((f: any) => ({ ...f, description: e.target.value }))} style={inputStyle} />
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button onClick={() => updateType(type.id)} style={{ fontSize: "12px", fontWeight: 500, padding: "5px 12px", borderRadius: "6px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>Save</button>
                      <button onClick={() => setEditingType(null)} style={{ fontSize: "12px", padding: "5px 12px", borderRadius: "6px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div key={type.id} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 14px",
                    borderBottom: i < assetTypes.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none",
                    background: "var(--color-background-primary)",
                  }}>
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
          </div>

          {/* Domain Monitoring */}
          <div style={{
            background: "var(--color-background-secondary)",
            border: "0.5px solid var(--color-border-tertiary)",
            borderRadius: "10px", padding: "20px", marginBottom: "16px",
          }}>
            <div style={{ fontSize: "15px", fontWeight: 500, marginBottom: "4px" }}>Domain Monitoring</div>
            <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginBottom: "16px" }}>
              Raise an alarm when a client domain expires within the threshold period.
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: "12px" }}>
              <div style={{ width: "120px" }}>
                <label style={labelStyle}>Alert threshold (days)</label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={thresholdInput}
                  onChange={e => setThresholdInput(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <button
                onClick={saveThreshold}
                disabled={savingThreshold}
                style={{ fontSize: "14px", fontWeight: 500, padding: "8px 16px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer", opacity: savingThreshold ? 0.6 : 1, marginBottom: "0" }}
              >
                {savingThreshold ? "Saving..." : "Save"}
              </button>
            </div>
            <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "10px" }}>
              Currently: alert when a domain expires within <strong style={{ color: "var(--color-text-secondary)" }}>{domainThreshold} days</strong>.
              Cron endpoint: <code style={{ fontFamily: "monospace" }}>GET /api/cron/domains</code>
            </div>
          </div>

          {/* Data Source Badge Colors */}
          <div style={{
            background: "var(--color-background-secondary)",
            border: "0.5px solid var(--color-border-tertiary)",
            borderRadius: "10px", padding: "20px", marginBottom: "16px",
          }}>
            <div style={{ fontSize: "15px", fontWeight: 500, marginBottom: "4px" }}>Data Source Badge Colors</div>
            <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginBottom: "16px" }}>
              Color of the source badge shown on assets, credentials, licenses, and network devices.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "16px" }}>
              {Object.entries(SOURCE_LABELS).map(([key, label]) => {
                const color = sourceColors[key] ?? "#64748b"
                return (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <input
                      type="color"
                      value={color}
                      onChange={e => setSourceColors(c => ({ ...c, [key]: e.target.value }))}
                      style={{ width: "36px", height: "28px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "6px", cursor: "pointer", padding: "1px 2px", background: "var(--color-background-primary)" }}
                    />
                    <span style={{ fontSize: "13px", color: "var(--color-text-primary)", width: "72px" }}>{label}</span>
                    <span style={{ fontSize: "11px", padding: "2px 7px", borderRadius: "4px", background: color + "18", color, border: `1px solid ${color}44`, fontWeight: 600 }}>
                      {label}
                    </span>
                    <span style={{ fontSize: "12px", color: "var(--color-text-muted)", fontFamily: "monospace" }}>{color}</span>
                  </div>
                )
              })}
            </div>
            <button
              onClick={saveSourceColors}
              disabled={savingColors}
              style={{ fontSize: "14px", fontWeight: 500, padding: "8px 16px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: savingColors ? "not-allowed" : "pointer", opacity: savingColors ? 0.6 : 1 }}
            >
              {savingColors ? "Saving..." : "Save colors"}
            </button>
          </div>

          {/* SyncroMSP */}
          <div style={{
            background: "var(--color-background-secondary)",
            border: "0.5px solid var(--color-border-tertiary)",
            borderRadius: "10px", padding: "20px", marginBottom: "16px",
          }}>
            <div style={{ fontSize: "15px", fontWeight: 500, marginBottom: "4px" }}>SyncroMSP</div>
            <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginBottom: "16px" }}>
              Import all customers and assets from Syncro. Existing records will be updated.
            </div>

            <button
              onClick={runSync}
              disabled={syncing}
              style={{
                fontSize: "14px", fontWeight: 500, padding: "8px 16px",
                borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)",
                background: "var(--color-background-primary)", cursor: syncing ? "not-allowed" : "pointer",
                color: "var(--color-text-primary)", opacity: syncing ? 0.6 : 1,
              }}
            >
              {syncing ? "Syncing... this may take a minute" : "Run Syncro sync"}
            </button>

            {syncResult && (
              <div style={{
                marginTop: "16px", padding: "12px 16px", borderRadius: "8px",
                background: syncResult.success ? "var(--color-background-success)" : "var(--color-background-danger)",
                border: `0.5px solid ${syncResult.success ? "var(--color-border-success)" : "var(--color-border-danger)"}`,
                fontSize: "13px",
              }}>
                {syncResult.success ? (
                  <div>
                    <div style={{ fontWeight: 500, color: "var(--color-text-success)", marginBottom: "4px" }}>Sync complete</div>
                    <div style={{ color: "var(--color-text-success)" }}>{syncResult.clients} clients · {syncResult.assets} assets synced</div>
                    {syncResult.errors?.length > 0 && (
                      <div style={{ marginTop: "8px", color: "var(--color-text-warning)", fontSize: "12px" }}>{syncResult.errors.length} errors — check logs</div>
                    )}
                  </div>
                ) : (
                  <div style={{ color: "var(--color-text-danger)" }}>Error: {syncResult.error}</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
