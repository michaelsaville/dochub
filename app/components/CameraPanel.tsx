"use client"
import { useState } from "react"
import CredentialPicker from "@/components/CredentialPicker"

const inp: React.CSSProperties = { width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" }
const lbl: React.CSSProperties = { fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }
const card: React.CSSProperties = { background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: "10px", padding: "20px", marginBottom: "16px" }
const btn = (variant: "primary" | "danger" | "ghost"): React.CSSProperties => ({
  padding: "7px 14px", fontSize: "13px", borderRadius: "7px", cursor: "pointer", fontWeight: 500,
  border: variant === "ghost" ? "0.5px solid var(--color-border-secondary)" : "none",
  background: variant === "primary" ? "var(--color-accent)" : variant === "danger" ? "#ef444422" : "transparent",
  color: variant === "danger" ? "#ef4444" : variant === "primary" ? "#fff" : "var(--color-text-secondary)",
})

const SYSTEM_TYPES: Record<string, string> = {
  UNIFI_NVR: "Unifi Protect NVR",
  HIKVISION_DVR: "Hikvision DVR",
  DAHUA_DVR: "Dahua DVR",
  ANALOG_DVR: "Analog DVR",
  CLOUD_MANAGED: "Cloud Managed",
  OTHER: "Other",
}

const SYSTEM_COLORS: Record<string, string> = {
  UNIFI_NVR: "#8b5cf6",
  HIKVISION_DVR: "#ef4444",
  DAHUA_DVR: "#f59e0b",
  ANALOG_DVR: "#6b7280",
  CLOUD_MANAGED: "#06b6d4",
  OTHER: "#94a3b8",
}

const CAMERA_TYPES: Record<string, string> = {
  IP_POE: "IP/PoE",
  ANALOG: "Analog",
  WIRELESS: "Wireless",
  FISHEYE: "Fisheye",
  PTZ: "PTZ",
}

const RECORDING_SCHEDULES: Record<string, string> = {
  "24_7": "24/7 Continuous",
  MOTION: "Motion Only",
  SCHEDULE: "Scheduled",
  NONE: "Not Recording",
}

type Camera = {
  id: string
  name: string
  type: string
  make: string | null
  model: string | null
  ipAddress: string | null
  macAddress: string | null
  resolution: string | null
  location: string | null
  recordingSchedule: string | null
  coverageNotes: string | null
  photoStorageName: string | null
  unifiCameraId: string | null
  photoRefreshedAt: string | null
  isActive: boolean
  notes: string | null
  asset: { id: string; name: string; friendlyName: string | null } | null
}

type CameraSystem = {
  id: string
  name: string
  type: string
  managementUrl: string | null
  retentionDays: number | null
  storageNote: string | null
  isActive: boolean
  notes: string | null
  asset: { id: string; name: string; friendlyName: string | null } | null
  credential: { id: string; label: string } | null
  cameras: Camera[]
}

type Props = {
  systems: CameraSystem[]
  assets: { id: string; name: string; friendlyName: string | null; category: string; managementUrl?: string | null; ipAddress?: string | null }[]
  credentials: { id: string; label: string }[]
  clientId: string
  onSystemsChange: (systems: CameraSystem[]) => void
}

const emptySystem = { name: "", type: "UNIFI_NVR", assetId: "", credentialId: "", managementUrl: "", retentionDays: "", storageNote: "", notes: "" }
const emptyCamera = { name: "", type: "IP_POE", assetId: "", make: "", model: "", ipAddress: "", macAddress: "", resolution: "", location: "", recordingSchedule: "24_7", coverageNotes: "", unifiCameraId: "", notes: "" }

export default function CameraPanel({ systems, assets, credentials, clientId, onSystemsChange }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showAddSystem, setShowAddSystem] = useState(false)
  const [addingCamFor, setAddingCamFor] = useState<string | null>(null)
  const [editingSystemId, setEditingSystemId] = useState<string | null>(null)
  const [editingCamId, setEditingCamId] = useState<string | null>(null)
  const [systemForm, setSystemForm] = useState({ ...emptySystem })
  const [camForm, setCamForm] = useState({ ...emptyCamera })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [uploadingPhotoFor, setUploadingPhotoFor] = useState<string | null>(null)
  const [syncingUnifiId, setSyncingUnifiId] = useState<string | null>(null)
  const [syncResult, setSyncResult] = useState<Record<string, string>>({}) // systemId → message

  async function uploadCameraPhoto(camId: string, systemId: string, file: File) {
    setUploadingPhotoFor(camId)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch(`/api/cameras/${camId}/photo`, { method: "POST", body: fd })
      if (res.ok) {
        const data = await res.json()
        onSystemsChange(systems.map(s => s.id === systemId
          ? { ...s, cameras: s.cameras.map(c => c.id === camId ? { ...c, photoStorageName: data.photoStorageName } : c) }
          : s
        ))
      }
    } finally { setUploadingPhotoFor(null) }
  }

  async function removeCameraPhoto(camId: string, systemId: string) {
    await fetch(`/api/cameras/${camId}/photo`, { method: "DELETE" })
    onSystemsChange(systems.map(s => s.id === systemId
      ? { ...s, cameras: s.cameras.map(c => c.id === camId ? { ...c, photoStorageName: null } : c) }
      : s
    ))
  }

  async function syncUnifi(system: CameraSystem) {
    setSyncingUnifiId(system.id)
    setSyncResult(r => ({ ...r, [system.id]: "" }))
    try {
      const res = await fetch(`/api/camera-systems/${system.id}/sync-unifi`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        setSyncResult(r => ({ ...r, [system.id]: data.error || "Sync failed" }))
        return
      }
      setSyncResult(r => ({ ...r, [system.id]: `Synced ${data.synced}/${data.total} cameras` }))
      // Reload systems to get updated photoStorageName / photoRefreshedAt
      const sysRes = await fetch(`/api/clients/${clientId}/camera-systems`)
      if (sysRes.ok) onSystemsChange(await sysRes.json())
    } catch {
      setSyncResult(r => ({ ...r, [system.id]: "Network error" }))
    } finally {
      setSyncingUnifiId(null)
    }
  }

  function assetLabel(a: { name: string; friendlyName: string | null }) {
    return a.friendlyName ? `${a.friendlyName} (${a.name})` : a.name
  }

  // ── Systems ────────────────────────────────────────────────────────────────

  async function saveSystem() {
    setError(""); setSaving(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/camera-systems`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(systemForm),
      })
      if (!res.ok) { setError((await res.json()).error || "Failed"); return }
      const created = await res.json()
      onSystemsChange([...systems, created])
      setShowAddSystem(false)
      setSystemForm({ ...emptySystem })
      setExpandedId(created.id)
    } finally { setSaving(false) }
  }

  async function updateSystem(id: string) {
    setError(""); setSaving(true)
    try {
      const res = await fetch(`/api/camera-systems/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(systemForm),
      })
      if (!res.ok) { setError((await res.json()).error || "Failed"); return }
      const updated = await res.json()
      onSystemsChange(systems.map(s => s.id === id ? updated : s))
      setEditingSystemId(null)
    } finally { setSaving(false) }
  }

  async function deleteSystem(id: string) {
    if (!confirm("Delete this camera system and all its cameras?")) return
    const res = await fetch(`/api/camera-systems/${id}`, { method: "DELETE" })
    if (res.ok) onSystemsChange(systems.filter(s => s.id !== id))
  }

  function startEditSystem(s: CameraSystem) {
    setSystemForm({ name: s.name, type: s.type, assetId: s.asset?.id || "", credentialId: s.credential?.id || "", managementUrl: s.managementUrl || "", retentionDays: s.retentionDays?.toString() || "", storageNote: s.storageNote || "", notes: s.notes || "" })
    setEditingSystemId(s.id)
  }

  // ── Cameras ───────────────────────────────────────────────────────────────

  async function addCamera(systemId: string) {
    setError(""); setSaving(true)
    try {
      const res = await fetch(`/api/camera-systems/${systemId}/cameras`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(camForm),
      })
      if (!res.ok) { setError((await res.json()).error || "Failed"); return }
      const created = await res.json()
      onSystemsChange(systems.map(s => s.id === systemId ? { ...s, cameras: [...s.cameras, created].sort((a, b) => a.name.localeCompare(b.name)) } : s))
      setAddingCamFor(null)
      setCamForm({ ...emptyCamera })
    } finally { setSaving(false) }
  }

  async function updateCamera(camId: string, systemId: string) {
    setError(""); setSaving(true)
    try {
      const res = await fetch(`/api/cameras/${camId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(camForm),
      })
      if (!res.ok) { setError((await res.json()).error || "Failed"); return }
      const updated = await res.json()
      onSystemsChange(systems.map(s => s.id === systemId ? { ...s, cameras: s.cameras.map(c => c.id === camId ? updated : c) } : s))
      setEditingCamId(null)
    } finally { setSaving(false) }
  }

  async function deleteCamera(camId: string, systemId: string) {
    if (!confirm("Delete this camera?")) return
    const res = await fetch(`/api/cameras/${camId}`, { method: "DELETE" })
    if (res.ok) onSystemsChange(systems.map(s => s.id === systemId ? { ...s, cameras: s.cameras.filter(c => c.id !== camId) } : s))
  }

  function startEditCam(c: Camera) {
    setCamForm({ name: c.name, type: c.type, assetId: c.asset?.id || "", make: c.make || "", model: c.model || "", ipAddress: c.ipAddress || "", macAddress: c.macAddress || "", resolution: c.resolution || "", location: c.location || "", recordingSchedule: c.recordingSchedule || "24_7", coverageNotes: c.coverageNotes || "", unifiCameraId: c.unifiCameraId || "", notes: c.notes || "" })
    setEditingCamId(c.id)
  }

  // ── System Form ───────────────────────────────────────────────────────────
  // NOTE: plain render helper (not a nested component). Defining a component
  // inside another component gives it a new identity on every render, which
  // remounts its inputs/selects on each keystroke and kills focus.

  function renderSystemForm({ onSubmit, onCancel }: { onSubmit: () => void; onCancel: () => void }) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div>
            <label style={lbl}>Name *</label>
            <input style={inp} value={systemForm.name} onChange={e => setSystemForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Unifi Protect NVR" />
          </div>
          <div>
            <label style={lbl}>Type *</label>
            <select style={inp} value={systemForm.type} onChange={e => setSystemForm(f => ({ ...f, type: e.target.value }))}>
              {Object.entries(SYSTEM_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Management URL</label>
            <input style={inp} value={systemForm.managementUrl} onChange={e => setSystemForm(f => ({ ...f, managementUrl: e.target.value }))} placeholder="https://192.168.1.1" />
          </div>
          <div>
            <label style={lbl}>Retention (days)</label>
            <input style={inp} type="number" value={systemForm.retentionDays} onChange={e => setSystemForm(f => ({ ...f, retentionDays: e.target.value }))} placeholder="30" />
          </div>
          <div>
            <label style={lbl}>NVR/DVR Asset</label>
            <select style={inp} value={systemForm.assetId} onChange={e => {
              const a = assets.find(x => x.id === e.target.value)
              // Linking the NVR asset fills mgmt URL + system name from it (blank-only).
              setSystemForm(f => ({
                ...f,
                assetId: e.target.value,
                managementUrl: f.managementUrl || (a ? (a.managementUrl || (a.ipAddress ? `https://${a.ipAddress}` : "")) : ""),
                name: f.name || (a ? (a.friendlyName || a.name) : ""),
              }))
            }}>
              <option value="">— None —</option>
              {assets.map(a => <option key={a.id} value={a.id}>{assetLabel(a)}</option>)}
            </select>
          </div>
          <div>
            <CredentialPicker
              clientId={clientId}
              label="Admin Credential"
              value={systemForm.credentialId}
              onChange={v => setSystemForm(f => ({ ...f, credentialId: v }))}
              credentials={credentials}
              prefillLabel={systemForm.name ? `${systemForm.name} admin` : ""}
            />
          </div>
        </div>
        <div>
          <label style={lbl}>Storage Note</label>
          <input style={inp} value={systemForm.storageNote} onChange={e => setSystemForm(f => ({ ...f, storageNote: e.target.value }))} placeholder="e.g. 2TB HDD, ~30 days at 1080p" />
        </div>
        <div>
          <label style={lbl}>Notes</label>
          <textarea style={{ ...inp, minHeight: "70px", resize: "vertical" }} value={systemForm.notes} onChange={e => setSystemForm(f => ({ ...f, notes: e.target.value }))} />
        </div>
        {error && <div style={{ color: "#ef4444", fontSize: "13px" }}>{error}</div>}
        <div style={{ display: "flex", gap: "8px" }}>
          <button style={btn("primary")} onClick={onSubmit} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
          <button style={btn("ghost")} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    )
  }

  // ── Camera Form ───────────────────────────────────────────────────────────
  // Same reason as renderSystemForm above — plain helper, not a component.

  function renderCameraForm({ onSubmit, onCancel, systemType }: { onSubmit: () => void; onCancel: () => void; systemType: string }) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "16px", background: "var(--color-background-primary)", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", marginTop: "12px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
          <div>
            <label style={lbl}>Name / Label *</label>
            <input style={inp} value={camForm.name} onChange={e => setCamForm(f => ({ ...f, name: e.target.value }))} placeholder="Front Door" />
          </div>
          <div>
            <label style={lbl}>Type</label>
            <select style={inp} value={camForm.type} onChange={e => setCamForm(f => ({ ...f, type: e.target.value }))}>
              {Object.entries(CAMERA_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Resolution</label>
            <input style={inp} value={camForm.resolution} onChange={e => setCamForm(f => ({ ...f, resolution: e.target.value }))} placeholder="4MP, 1080p…" />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
          <div>
            <label style={lbl}>Make</label>
            <input style={inp} value={camForm.make} onChange={e => setCamForm(f => ({ ...f, make: e.target.value }))} placeholder="Unifi, Hikvision…" />
          </div>
          <div>
            <label style={lbl}>Model</label>
            <input style={inp} value={camForm.model} onChange={e => setCamForm(f => ({ ...f, model: e.target.value }))} placeholder="G4 Pro, DS-2CD…" />
          </div>
          <div>
            <label style={lbl}>IP Address</label>
            <input style={inp} value={camForm.ipAddress} onChange={e => setCamForm(f => ({ ...f, ipAddress: e.target.value }))} placeholder="192.168.1.x" />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <div>
            <label style={lbl}>MAC Address</label>
            <input style={inp} value={camForm.macAddress} onChange={e => setCamForm(f => ({ ...f, macAddress: e.target.value }))} />
          </div>
          <div>
            <label style={lbl}>Physical Location</label>
            <input style={inp} value={camForm.location} onChange={e => setCamForm(f => ({ ...f, location: e.target.value }))} placeholder="Parking lot NE corner" />
          </div>
        </div>
        {systemType === "UNIFI_NVR" && (
          <div>
            <label style={lbl}>UniFi Camera ID <span style={{ color: "var(--color-text-muted)", fontWeight: 400 }}>(for auto-snapshot sync)</span></label>
            <input style={inp} value={camForm.unifiCameraId} onChange={e => setCamForm(f => ({ ...f, unifiCameraId: e.target.value }))} placeholder="e.g. 6a1b2c3d4e5f6a7b (from UniFi Protect)" />
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <div>
            <label style={lbl}>Recording Schedule</label>
            <select style={inp} value={camForm.recordingSchedule} onChange={e => setCamForm(f => ({ ...f, recordingSchedule: e.target.value }))}>
              {Object.entries(RECORDING_SCHEDULES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Linked Asset</label>
            <select style={inp} value={camForm.assetId} onChange={e => setCamForm(f => ({ ...f, assetId: e.target.value }))}>
              <option value="">— None —</option>
              {assets.map(a => <option key={a.id} value={a.id}>{assetLabel(a)}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label style={lbl}>Coverage / Field of View</label>
          <textarea style={{ ...inp, minHeight: "60px", resize: "vertical" }} value={camForm.coverageNotes} onChange={e => setCamForm(f => ({ ...f, coverageNotes: e.target.value }))} placeholder="Covers front entrance, 180° view, reaches to the far gate…" />
        </div>
        <div>
          <label style={lbl}>Notes</label>
          <input style={inp} value={camForm.notes} onChange={e => setCamForm(f => ({ ...f, notes: e.target.value }))} />
        </div>
        {error && <div style={{ color: "#ef4444", fontSize: "13px" }}>{error}</div>}
        <div style={{ display: "flex", gap: "8px" }}>
          <button style={btn("primary")} onClick={onSubmit} disabled={saving}>{saving ? "Saving…" : "Save Camera"}</button>
          <button style={btn("ghost")} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
        <div>
          <h2 style={{ fontSize: "16px", fontWeight: 600, margin: 0 }}>Camera Systems</h2>
          <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", margin: "4px 0 0" }}>NVRs, DVRs, and individual cameras — Unifi Protect, CCTV, and analog systems</p>
        </div>
        {!showAddSystem && (
          <button style={btn("primary")} onClick={() => { setShowAddSystem(true); setSystemForm({ ...emptySystem }) }}>+ Add System</button>
        )}
      </div>

      {showAddSystem && (
        <div style={card}>
          <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "16px" }}>New Camera System</div>
          {renderSystemForm({ onSubmit: saveSystem, onCancel: () => { setShowAddSystem(false); setError("") } })}
        </div>
      )}

      {systems.length === 0 && !showAddSystem && (
        <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>No camera systems documented yet.</div>
      )}

      {systems.map(system => (
        <div key={system.id} style={card}>
          {/* System header */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
            <div style={{ flex: 1, cursor: "pointer" }} onClick={() => setExpandedId(expandedId === system.id ? null : system.id)}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "15px", fontWeight: 600 }}>{system.name}</span>
                <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "10px", background: (SYSTEM_COLORS[system.type] || "#94a3b8") + "22", color: SYSTEM_COLORS[system.type] || "#94a3b8", border: `1px solid ${(SYSTEM_COLORS[system.type] || "#94a3b8")}44` }}>{SYSTEM_TYPES[system.type] || system.type}</span>
                <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>{system.cameras.length} camera{system.cameras.length !== 1 ? "s" : ""}</span>
                {system.retentionDays && <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>{system.retentionDays}d retention</span>}
                {!system.isActive && <span style={{ fontSize: "11px", color: "#ef4444" }}>Inactive</span>}
              </div>
              <div style={{ display: "flex", gap: "16px", marginTop: "6px", flexWrap: "wrap" }}>
                {system.asset && <a href={`/assets/${system.asset.id}`} style={{ fontSize: "12px", color: "var(--color-accent)", textDecoration: "none" }} onClick={e => e.stopPropagation()}>Host: {assetLabel(system.asset)}</a>}
                {system.credential && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>Cred: {system.credential.label}</span>}
                {system.storageNote && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{system.storageNote}</span>}
                {system.managementUrl && (
                  <a href={system.managementUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "12px", color: "var(--color-accent)" }} onClick={e => e.stopPropagation()}>
                    Admin Portal
                  </a>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: "6px", flexShrink: 0, alignItems: "center" }}>
              {system.type === "UNIFI_NVR" && (
                <>
                  {syncResult[system.id] && (
                    <span style={{ fontSize: "12px", color: syncResult[system.id].startsWith("Synced") ? "#22c55e" : "#ef4444" }}>{syncResult[system.id]}</span>
                  )}
                  <button
                    style={btn("ghost")}
                    onClick={() => syncUnifi(system)}
                    disabled={syncingUnifiId === system.id}
                    title="Pull latest snapshots from UniFi Protect"
                  >
                    {syncingUnifiId === system.id ? "Syncing…" : "Sync UniFi"}
                  </button>
                </>
              )}
              <button style={btn("ghost")} onClick={() => { startEditSystem(system); setExpandedId(system.id) }}>Edit</button>
              <button style={btn("danger")} onClick={() => deleteSystem(system.id)}>Delete</button>
            </div>
          </div>

          {/* Edit system form */}
          {editingSystemId === system.id && (
            <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "0.5px solid var(--color-border-secondary)" }}>
              {renderSystemForm({ onSubmit: () => updateSystem(system.id), onCancel: () => { setEditingSystemId(null); setError("") } })}
            </div>
          )}

          {/* Camera list */}
          {expandedId === system.id && editingSystemId !== system.id && (
            <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "0.5px solid var(--color-border-secondary)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text-secondary)" }}>Cameras</span>
                {addingCamFor !== system.id && (
                  <button style={btn("ghost")} onClick={() => { setAddingCamFor(system.id); setCamForm({ ...emptyCamera }) }}>+ Add Camera</button>
                )}
              </div>

              {system.cameras.length === 0 && addingCamFor !== system.id && (
                <div style={{ fontSize: "13px", color: "var(--color-text-muted)" }}>No cameras yet.</div>
              )}

              {system.cameras.map(cam => (
                <div key={cam.id}>
                  {editingCamId === cam.id ? (
                    renderCameraForm({ onSubmit: () => updateCamera(cam.id, system.id), onCancel: () => { setEditingCamId(null); setError("") }, systemType: system.type })
                  ) : (
                    <div style={{ borderRadius: "7px", background: "var(--color-background-primary)", marginBottom: "6px", overflow: "hidden" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "10px 12px", gap: "10px" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                            <span style={{ fontSize: "14px", fontWeight: 600 }}>{cam.name}</span>
                            <span style={{ fontSize: "11px", padding: "1px 7px", borderRadius: "8px", background: "#6b728022", color: "#9ca3af", border: "1px solid #6b728044" }}>{CAMERA_TYPES[cam.type] || cam.type}</span>
                            {cam.resolution && <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>{cam.resolution}</span>}
                            {cam.recordingSchedule && <span style={{ fontSize: "11px", padding: "1px 7px", borderRadius: "8px", background: cam.recordingSchedule === "NONE" ? "#ef444422" : "#22c55e22", color: cam.recordingSchedule === "NONE" ? "#ef4444" : "#22c55e", border: `1px solid ${cam.recordingSchedule === "NONE" ? "#ef444444" : "#22c55e44"}` }}>{RECORDING_SCHEDULES[cam.recordingSchedule] || cam.recordingSchedule}</span>}
                            {!cam.isActive && <span style={{ fontSize: "11px", color: "#ef4444" }}>Inactive</span>}
                          </div>
                          <div style={{ display: "flex", gap: "14px", marginTop: "4px", flexWrap: "wrap" }}>
                            {(cam.make || cam.model) && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{[cam.make, cam.model].filter(Boolean).join(" ")}</span>}
                            {cam.ipAddress && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>IP: {cam.ipAddress}</span>}
                            {cam.macAddress && <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>MAC: {cam.macAddress}</span>}
                            {cam.location && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{cam.location}</span>}
                            {cam.asset && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>Asset: {cam.asset.friendlyName || cam.asset.name}</span>}
                            {cam.coverageNotes && <span style={{ fontSize: "12px", color: "var(--color-text-muted)", fontStyle: "italic" }}>{cam.coverageNotes}</span>}
                            {cam.notes && <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>{cam.notes}</span>}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                          <button style={btn("ghost")} onClick={() => startEditCam(cam)}>Edit</button>
                          <button style={btn("danger")} onClick={() => deleteCamera(cam.id, system.id)}>Del</button>
                        </div>
                      </div>
                      {/* Field-of-view photo */}
                      <div style={{ padding: "0 12px 10px" }}>
                        {cam.photoStorageName ? (
                          <div style={{ position: "relative", display: "inline-block" }}>
                            <img
                              src={`/api/cameras/${cam.id}/photo?v=${cam.photoStorageName}`}
                              alt={`${cam.name} field of view`}
                              style={{ maxWidth: "100%", maxHeight: "240px", borderRadius: "6px", border: "1px solid var(--color-border-tertiary)", display: "block" }}
                            />
                            <div style={{ position: "absolute", top: "6px", right: "6px", display: "flex", gap: "4px" }}>
                              <label style={{ fontSize: "11px", padding: "2px 7px", borderRadius: "4px", background: "rgba(0,0,0,0.7)", color: "#e2e8f0", cursor: "pointer", border: "1px solid #475569" }}>
                                Replace
                                <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) uploadCameraPhoto(cam.id, system.id, f); e.target.value = "" }} />
                              </label>
                              <button onClick={() => removeCameraPhoto(cam.id, system.id)} style={{ fontSize: "11px", padding: "2px 7px", borderRadius: "4px", background: "rgba(0,0,0,0.7)", color: "#fca5a5", cursor: "pointer", border: "1px solid #7f1d1d" }}>Remove</button>
                            </div>
                            {cam.photoRefreshedAt && (
                              <div style={{ position: "absolute", bottom: "6px", left: "6px", fontSize: "10px", padding: "1px 6px", borderRadius: "4px", background: "rgba(0,0,0,0.6)", color: "#94a3b8" }}>
                                Synced {new Date(cam.photoRefreshedAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                              </div>
                            )}
                          </div>
                        ) : (
                          <label style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "11px", color: "var(--color-text-muted)", cursor: "pointer", padding: "4px 8px", borderRadius: "5px", border: "1px dashed var(--color-border-secondary)" }}>
                            {uploadingPhotoFor === cam.id ? "Uploading..." : "📷 Add field-of-view photo"}
                            <input type="file" accept="image/*" style={{ display: "none" }} disabled={uploadingPhotoFor === cam.id} onChange={e => { const f = e.target.files?.[0]; if (f) uploadCameraPhoto(cam.id, system.id, f); e.target.value = "" }} />
                          </label>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {addingCamFor === system.id && (
                renderCameraForm({ onSubmit: () => addCamera(system.id), onCancel: () => { setAddingCamFor(null); setError("") }, systemType: system.type })
              )}

              {system.notes && (
                <div style={{ marginTop: "12px", fontSize: "13px", color: "var(--color-text-secondary)", borderTop: "0.5px solid var(--color-border-secondary)", paddingTop: "12px" }}>
                  {system.notes}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
