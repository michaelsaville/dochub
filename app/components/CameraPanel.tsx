"use client"
import { useState } from "react"

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
  assets: { id: string; name: string; friendlyName: string | null; category: string }[]
  credentials: { id: string; label: string }[]
  clientId: string
  onSystemsChange: (systems: CameraSystem[]) => void
}

const emptySystem = { name: "", type: "UNIFI_NVR", assetId: "", credentialId: "", managementUrl: "", retentionDays: "", storageNote: "", notes: "" }
const emptyCamera = { name: "", type: "IP_POE", assetId: "", make: "", model: "", ipAddress: "", macAddress: "", resolution: "", location: "", notes: "" }

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
    setCamForm({ name: c.name, type: c.type, assetId: c.asset?.id || "", make: c.make || "", model: c.model || "", ipAddress: c.ipAddress || "", macAddress: c.macAddress || "", resolution: c.resolution || "", location: c.location || "", notes: c.notes || "" })
    setEditingCamId(c.id)
  }

  // ── System Form ───────────────────────────────────────────────────────────

  function SystemForm({ onSubmit, onCancel }: { onSubmit: () => void; onCancel: () => void }) {
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
            <select style={inp} value={systemForm.assetId} onChange={e => setSystemForm(f => ({ ...f, assetId: e.target.value }))}>
              <option value="">— None —</option>
              {assets.map(a => <option key={a.id} value={a.id}>{assetLabel(a)}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Admin Credential</label>
            <select style={inp} value={systemForm.credentialId} onChange={e => setSystemForm(f => ({ ...f, credentialId: e.target.value }))}>
              <option value="">— None —</option>
              {credentials.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
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

  function CameraForm({ onSubmit, onCancel }: { onSubmit: () => void; onCancel: () => void }) {
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
        <div>
          <label style={lbl}>Linked Asset (Unifi cameras)</label>
          <select style={inp} value={camForm.assetId} onChange={e => setCamForm(f => ({ ...f, assetId: e.target.value }))}>
            <option value="">— None —</option>
            {assets.map(a => <option key={a.id} value={a.id}>{assetLabel(a)}</option>)}
          </select>
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
          <SystemForm onSubmit={saveSystem} onCancel={() => { setShowAddSystem(false); setError("") }} />
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
                {system.asset && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>Host: {assetLabel(system.asset)}</span>}
                {system.credential && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>Cred: {system.credential.label}</span>}
                {system.storageNote && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{system.storageNote}</span>}
                {system.managementUrl && (
                  <a href={system.managementUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "12px", color: "var(--color-accent)" }} onClick={e => e.stopPropagation()}>
                    Admin Portal
                  </a>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
              <button style={btn("ghost")} onClick={() => { startEditSystem(system); setExpandedId(system.id) }}>Edit</button>
              <button style={btn("danger")} onClick={() => deleteSystem(system.id)}>Delete</button>
            </div>
          </div>

          {/* Edit system form */}
          {editingSystemId === system.id && (
            <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "0.5px solid var(--color-border-secondary)" }}>
              <SystemForm onSubmit={() => updateSystem(system.id)} onCancel={() => { setEditingSystemId(null); setError("") }} />
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
                    <CameraForm onSubmit={() => updateCamera(cam.id, system.id)} onCancel={() => { setEditingCamId(null); setError("") }} />
                  ) : (
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "10px 12px", borderRadius: "7px", background: "var(--color-background-primary)", marginBottom: "6px", gap: "10px" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                          <span style={{ fontSize: "14px", fontWeight: 600 }}>{cam.name}</span>
                          <span style={{ fontSize: "11px", padding: "1px 7px", borderRadius: "8px", background: "#6b728022", color: "#9ca3af", border: "1px solid #6b728044" }}>{CAMERA_TYPES[cam.type] || cam.type}</span>
                          {cam.resolution && <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>{cam.resolution}</span>}
                          {!cam.isActive && <span style={{ fontSize: "11px", color: "#ef4444" }}>Inactive</span>}
                        </div>
                        <div style={{ display: "flex", gap: "14px", marginTop: "4px", flexWrap: "wrap" }}>
                          {(cam.make || cam.model) && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{[cam.make, cam.model].filter(Boolean).join(" ")}</span>}
                          {cam.ipAddress && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>IP: {cam.ipAddress}</span>}
                          {cam.macAddress && <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>MAC: {cam.macAddress}</span>}
                          {cam.location && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{cam.location}</span>}
                          {cam.asset && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>Asset: {cam.asset.friendlyName || cam.asset.name}</span>}
                          {cam.notes && <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>{cam.notes}</span>}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                        <button style={btn("ghost")} onClick={() => startEditCam(cam)}>Edit</button>
                        <button style={btn("danger")} onClick={() => deleteCamera(cam.id, system.id)}>Del</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {addingCamFor === system.id && (
                <CameraForm onSubmit={() => addCamera(system.id)} onCancel={() => { setAddingCamFor(null); setError("") }} />
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
