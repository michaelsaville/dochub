"use client"

import AppShell from "@/components/AppShell"
import { useState, useEffect } from "react"

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

export default function SettingsPage() {
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

  useEffect(() => { fetchAssetTypes() }, [])

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
