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

const CONTROLLER_TYPES: Record<string, string> = {
  UNIFI: "Unifi",
  MERAKI: "Meraki",
  HP_INSTANT_ON: "HP Instant On",
  GRANDSTREAM: "Grandstream",
  UBIQUITI_CLOUD: "Ubiquiti Cloud",
  STANDALONE: "Standalone APs",
  OTHER: "Other",
}

const CONTROLLER_COLORS: Record<string, string> = {
  UNIFI: "#8b5cf6",
  MERAKI: "#00bceb",
  HP_INSTANT_ON: "#0096d6",
  GRANDSTREAM: "#f59e0b",
  UBIQUITI_CLOUD: "#6366f1",
  STANDALONE: "#6b7280",
  OTHER: "#94a3b8",
}

const BANDS: Record<string, string> = {
  DUAL: "Dual-Band",
  TRI: "Tri-Band",
  TWO_FOUR: "2.4 GHz",
  FIVE: "5 GHz",
  SIX: "6 GHz",
}

const SECURITY: Record<string, string> = {
  WPA2_PERSONAL: "WPA2-Personal",
  WPA2_ENTERPRISE: "WPA2-Enterprise",
  WPA3_PERSONAL: "WPA3-Personal",
  WPA3_ENTERPRISE: "WPA3-Enterprise",
  WPA2_WPA3_TRANSITION: "WPA2/WPA3",
  OPEN: "Open",
}

const PURPOSES: Record<string, string> = {
  CORPORATE: "Corporate",
  GUEST: "Guest",
  IOT: "IoT",
  VOIP: "VoIP",
  CAMERAS: "Cameras",
  MANAGEMENT: "Management",
  OTHER: "Other",
}

const PURPOSE_COLORS: Record<string, string> = {
  CORPORATE: "#3b82f6",
  GUEST: "#10b981",
  IOT: "#f59e0b",
  VOIP: "#8b5cf6",
  CAMERAS: "#ef4444",
  MANAGEMENT: "#6b7280",
  OTHER: "#94a3b8",
}

type WifiNetwork = {
  id: string
  ssid: string
  band: string
  security: string
  purpose: string
  vlanId: number | null
  vlanName: string | null
  isHidden: boolean
  clientIsolation: boolean
  bandSteering: boolean
  isActive: boolean
  notes: string | null
  credential: { id: string; label: string } | null
  subnet: { id: string; cidr: string; vlan: string | null; description: string | null } | null
}

type WifiController = {
  id: string
  name: string
  type: string
  managementUrl: string | null
  isActive: boolean
  notes: string | null
  asset: { id: string; name: string; friendlyName: string | null } | null
  networkDevice: { id: string; name: string; type: string } | null
  credential: { id: string; label: string } | null
  networks: WifiNetwork[]
}

type Props = {
  controllers: WifiController[]
  assets: { id: string; name: string; friendlyName: string | null; category: string }[]
  networkDevices: { id: string; name: string; type: string }[]
  subnets: { id: string; cidr: string; vlan: string | null; description: string | null }[]
  credentials: { id: string; label: string }[]
  clientId: string
  onControllersChange: (controllers: WifiController[]) => void
}

const emptyCtrl = { name: "", type: "UNIFI", assetId: "", networkDeviceId: "", credentialId: "", managementUrl: "", notes: "" }
const emptyNet = { ssid: "", band: "DUAL", security: "WPA2_PERSONAL", purpose: "CORPORATE", credentialId: "", subnetId: "", vlanId: "", vlanName: "", isHidden: false, clientIsolation: false, bandSteering: false, notes: "" }

export default function WifiPanel({ controllers, assets, networkDevices, subnets, credentials, clientId, onControllersChange }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showAddCtrl, setShowAddCtrl] = useState(false)
  const [addingNetFor, setAddingNetFor] = useState<string | null>(null)
  const [editingCtrlId, setEditingCtrlId] = useState<string | null>(null)
  const [editingNetId, setEditingNetId] = useState<string | null>(null)
  const [ctrlForm, setCtrlForm] = useState({ ...emptyCtrl })
  const [netForm, setNetForm] = useState({ ...emptyNet })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  function assetLabel(a: { name: string; friendlyName: string | null }) {
    return a.friendlyName ? `${a.friendlyName} (${a.name})` : a.name
  }

  function subnetLabel(s: { cidr: string; vlan: string | null; description: string | null }) {
    const parts = [s.cidr]
    if (s.vlan) parts.push(`VLAN ${s.vlan}`)
    if (s.description) parts.push(s.description)
    return parts.join(" — ")
  }

  // ── Controllers ────────────────────────────────────────────────────────────

  async function saveCtrl() {
    setError(""); setSaving(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/wifi-controllers`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ctrlForm),
      })
      if (!res.ok) { setError((await res.json()).error || "Failed"); return }
      const created = await res.json()
      onControllersChange([...controllers, created])
      setShowAddCtrl(false); setCtrlForm({ ...emptyCtrl }); setExpandedId(created.id)
    } finally { setSaving(false) }
  }

  async function updateCtrl(id: string) {
    setError(""); setSaving(true)
    try {
      const res = await fetch(`/api/wifi-controllers/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ctrlForm),
      })
      if (!res.ok) { setError((await res.json()).error || "Failed"); return }
      onControllersChange(controllers.map(c => c.id === id ? { ...await res.json() } : c))
      setEditingCtrlId(null)
    } finally { setSaving(false) }
  }

  async function deleteCtrl(id: string) {
    if (!confirm("Delete this controller and all its wifi networks?")) return
    const res = await fetch(`/api/wifi-controllers/${id}`, { method: "DELETE" })
    if (res.ok) onControllersChange(controllers.filter(c => c.id !== id))
  }

  function startEditCtrl(c: WifiController) {
    setCtrlForm({ name: c.name, type: c.type, assetId: c.asset?.id || "", networkDeviceId: c.networkDevice?.id || "", credentialId: c.credential?.id || "", managementUrl: c.managementUrl || "", notes: c.notes || "" })
    setEditingCtrlId(c.id)
  }

  // ── Networks ───────────────────────────────────────────────────────────────

  async function addNetwork(controllerId: string) {
    setError(""); setSaving(true)
    try {
      const res = await fetch(`/api/wifi-controllers/${controllerId}/networks`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(netForm),
      })
      if (!res.ok) { setError((await res.json()).error || "Failed"); return }
      const created = await res.json()
      onControllersChange(controllers.map(c => c.id === controllerId
        ? { ...c, networks: [...c.networks, created].sort((a, b) => a.ssid.localeCompare(b.ssid)) }
        : c))
      setAddingNetFor(null); setNetForm({ ...emptyNet })
    } finally { setSaving(false) }
  }

  async function updateNetwork(netId: string, controllerId: string) {
    setError(""); setSaving(true)
    try {
      const res = await fetch(`/api/wifi-networks/${netId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(netForm),
      })
      if (!res.ok) { setError((await res.json()).error || "Failed"); return }
      const updated = await res.json()
      onControllersChange(controllers.map(c => c.id === controllerId
        ? { ...c, networks: c.networks.map(n => n.id === netId ? updated : n) }
        : c))
      setEditingNetId(null)
    } finally { setSaving(false) }
  }

  async function deleteNetwork(netId: string, controllerId: string) {
    if (!confirm("Remove this SSID?")) return
    const res = await fetch(`/api/wifi-networks/${netId}`, { method: "DELETE" })
    if (res.ok) onControllersChange(controllers.map(c => c.id === controllerId
      ? { ...c, networks: c.networks.filter(n => n.id !== netId) }
      : c))
  }

  function startEditNet(n: WifiNetwork) {
    setNetForm({ ssid: n.ssid, band: n.band, security: n.security, purpose: n.purpose, credentialId: n.credential?.id || "", subnetId: n.subnet?.id || "", vlanId: n.vlanId?.toString() || "", vlanName: n.vlanName || "", isHidden: n.isHidden, clientIsolation: n.clientIsolation, bandSteering: n.bandSteering, notes: n.notes || "" })
    setEditingNetId(n.id)
  }

  // ── Controller Form ────────────────────────────────────────────────────────

  function CtrlForm({ onSubmit, onCancel }: { onSubmit: () => void; onCancel: () => void }) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div>
            <label style={lbl}>Name *</label>
            <input style={inp} value={ctrlForm.name} onChange={e => setCtrlForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Unifi Controller" />
          </div>
          <div>
            <label style={lbl}>Type *</label>
            <select style={inp} value={ctrlForm.type} onChange={e => setCtrlForm(f => ({ ...f, type: e.target.value }))}>
              {Object.entries(CONTROLLER_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Management URL</label>
            <input style={inp} value={ctrlForm.managementUrl} onChange={e => setCtrlForm(f => ({ ...f, managementUrl: e.target.value }))} placeholder="https://192.168.1.1" />
          </div>
          <div>
            <label style={lbl}>Admin Credential</label>
            <select style={inp} value={ctrlForm.credentialId} onChange={e => setCtrlForm(f => ({ ...f, credentialId: e.target.value }))}>
              <option value="">— None —</option>
              {credentials.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Controller Asset</label>
            <select style={inp} value={ctrlForm.assetId} onChange={e => setCtrlForm(f => ({ ...f, assetId: e.target.value }))}>
              <option value="">— None —</option>
              {assets.map(a => <option key={a.id} value={a.id}>{assetLabel(a)}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Controller Network Device</label>
            <select style={inp} value={ctrlForm.networkDeviceId} onChange={e => setCtrlForm(f => ({ ...f, networkDeviceId: e.target.value }))}>
              <option value="">— None —</option>
              {networkDevices.map(d => <option key={d.id} value={d.id}>{d.name} ({d.type})</option>)}
            </select>
          </div>
        </div>
        <div>
          <label style={lbl}>Notes</label>
          <textarea style={{ ...inp, minHeight: "60px", resize: "vertical" }} value={ctrlForm.notes} onChange={e => setCtrlForm(f => ({ ...f, notes: e.target.value }))} />
        </div>
        {error && <div style={{ color: "#ef4444", fontSize: "13px" }}>{error}</div>}
        <div style={{ display: "flex", gap: "8px" }}>
          <button style={btn("primary")} onClick={onSubmit} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
          <button style={btn("ghost")} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    )
  }

  // ── Network Form ───────────────────────────────────────────────────────────

  function NetForm({ onSubmit, onCancel }: { onSubmit: () => void; onCancel: () => void }) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "16px", background: "var(--color-background-primary)", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", marginTop: "12px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
          <div>
            <label style={lbl}>SSID *</label>
            <input style={inp} value={netForm.ssid} onChange={e => setNetForm(f => ({ ...f, ssid: e.target.value }))} placeholder="Corp-WiFi" />
          </div>
          <div>
            <label style={lbl}>Band</label>
            <select style={inp} value={netForm.band} onChange={e => setNetForm(f => ({ ...f, band: e.target.value }))}>
              {Object.entries(BANDS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Security</label>
            <select style={inp} value={netForm.security} onChange={e => setNetForm(f => ({ ...f, security: e.target.value }))}>
              {Object.entries(SECURITY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
          <div>
            <label style={lbl}>Purpose</label>
            <select style={inp} value={netForm.purpose} onChange={e => setNetForm(f => ({ ...f, purpose: e.target.value }))}>
              {Object.entries(PURPOSES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>PSK / Credential</label>
            <select style={inp} value={netForm.credentialId} onChange={e => setNetForm(f => ({ ...f, credentialId: e.target.value }))}>
              <option value="">— None —</option>
              {credentials.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Linked Subnet (IPAM)</label>
            <select style={inp} value={netForm.subnetId} onChange={e => setNetForm(f => ({ ...f, subnetId: e.target.value }))}>
              <option value="">— None —</option>
              {subnets.map(s => <option key={s.id} value={s.id}>{subnetLabel(s)}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: "10px" }}>
          <div>
            <label style={lbl}>VLAN ID</label>
            <input style={inp} type="number" value={netForm.vlanId} onChange={e => setNetForm(f => ({ ...f, vlanId: e.target.value }))} placeholder="20" />
          </div>
          <div>
            <label style={lbl}>VLAN Name</label>
            <input style={inp} value={netForm.vlanName} onChange={e => setNetForm(f => ({ ...f, vlanName: e.target.value }))} placeholder="Guest" />
          </div>
        </div>
        <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
          {([["isHidden", "Hidden SSID"], ["clientIsolation", "Client isolation"], ["bandSteering", "Band steering"]] as const).map(([key, label]) => (
            <label key={key} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--color-text-secondary)", cursor: "pointer" }}>
              <input type="checkbox" checked={netForm[key] as boolean} onChange={e => setNetForm(f => ({ ...f, [key]: e.target.checked }))} />
              {label}
            </label>
          ))}
        </div>
        <div>
          <label style={lbl}>Notes</label>
          <input style={inp} value={netForm.notes} onChange={e => setNetForm(f => ({ ...f, notes: e.target.value }))} />
        </div>
        {error && <div style={{ color: "#ef4444", fontSize: "13px" }}>{error}</div>}
        <div style={{ display: "flex", gap: "8px" }}>
          <button style={btn("primary")} onClick={onSubmit} disabled={saving}>{saving ? "Saving…" : "Save Network"}</button>
          <button style={btn("ghost")} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
        <div>
          <h2 style={{ fontSize: "16px", fontWeight: 600, margin: 0 }}>Wireless Networks</h2>
          <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", margin: "4px 0 0" }}>Controllers, SSIDs, VLANs, and PSK credentials</p>
        </div>
        {!showAddCtrl && (
          <button style={btn("primary")} onClick={() => { setShowAddCtrl(true); setCtrlForm({ ...emptyCtrl }) }}>+ Add Controller</button>
        )}
      </div>

      {showAddCtrl && (
        <div style={card}>
          <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "16px" }}>New Wifi Controller</div>
          <CtrlForm onSubmit={saveCtrl} onCancel={() => { setShowAddCtrl(false); setError("") }} />
        </div>
      )}

      {controllers.length === 0 && !showAddCtrl && (
        <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>No wireless controllers documented yet.</div>
      )}

      {controllers.map(ctrl => {
        const color = CONTROLLER_COLORS[ctrl.type] || "#94a3b8"
        return (
          <div key={ctrl.id} style={card}>
            {/* Controller header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
              <div style={{ flex: 1, cursor: "pointer" }} onClick={() => setExpandedId(expandedId === ctrl.id ? null : ctrl.id)}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "15px", fontWeight: 600 }}>{ctrl.name}</span>
                  <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "10px", background: color + "22", color, border: `1px solid ${color}44` }}>{CONTROLLER_TYPES[ctrl.type] || ctrl.type}</span>
                  <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>{ctrl.networks.length} SSID{ctrl.networks.length !== 1 ? "s" : ""}</span>
                  {!ctrl.isActive && <span style={{ fontSize: "11px", color: "#ef4444" }}>Inactive</span>}
                </div>
                <div style={{ display: "flex", gap: "16px", marginTop: "6px", flexWrap: "wrap" }}>
                  {ctrl.asset && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>Host: {assetLabel(ctrl.asset)}</span>}
                  {ctrl.networkDevice && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>Device: {ctrl.networkDevice.name}</span>}
                  {ctrl.credential && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>Cred: {ctrl.credential.label}</span>}
                  {ctrl.managementUrl && (
                    <a href={ctrl.managementUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "12px", color: "var(--color-accent)" }} onClick={e => e.stopPropagation()}>
                      Admin Portal
                    </a>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                <button style={btn("ghost")} onClick={() => { startEditCtrl(ctrl); setExpandedId(ctrl.id) }}>Edit</button>
                <button style={btn("danger")} onClick={() => deleteCtrl(ctrl.id)}>Delete</button>
              </div>
            </div>

            {/* Edit controller form */}
            {editingCtrlId === ctrl.id && (
              <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "0.5px solid var(--color-border-secondary)" }}>
                <CtrlForm onSubmit={() => updateCtrl(ctrl.id)} onCancel={() => { setEditingCtrlId(null); setError("") }} />
              </div>
            )}

            {/* Networks list */}
            {expandedId === ctrl.id && editingCtrlId !== ctrl.id && (
              <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "0.5px solid var(--color-border-secondary)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text-secondary)" }}>SSIDs / Networks</span>
                  {addingNetFor !== ctrl.id && (
                    <button style={btn("ghost")} onClick={() => { setAddingNetFor(ctrl.id); setNetForm({ ...emptyNet }) }}>+ Add SSID</button>
                  )}
                </div>

                {ctrl.networks.length === 0 && addingNetFor !== ctrl.id && (
                  <div style={{ fontSize: "13px", color: "var(--color-text-muted)" }}>No SSIDs yet.</div>
                )}

                {ctrl.networks.map(net => (
                  <div key={net.id}>
                    {editingNetId === net.id ? (
                      <NetForm onSubmit={() => updateNetwork(net.id, ctrl.id)} onCancel={() => { setEditingNetId(null); setError("") }} />
                    ) : (
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "10px 12px", borderRadius: "7px", background: "var(--color-background-primary)", marginBottom: "6px", gap: "10px" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                            <span style={{ fontSize: "14px", fontWeight: 600, fontFamily: "monospace" }}>{net.ssid}</span>
                            {net.isHidden && <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>Hidden</span>}
                            <span style={{ fontSize: "11px", padding: "1px 7px", borderRadius: "8px", background: (PURPOSE_COLORS[net.purpose] || "#94a3b8") + "22", color: PURPOSE_COLORS[net.purpose] || "#94a3b8", border: `1px solid ${(PURPOSE_COLORS[net.purpose] || "#94a3b8")}44` }}>{PURPOSES[net.purpose] || net.purpose}</span>
                            <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>{BANDS[net.band]}</span>
                            <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>{SECURITY[net.security]}</span>
                            {!net.isActive && <span style={{ fontSize: "11px", color: "#ef4444" }}>Inactive</span>}
                          </div>
                          <div style={{ display: "flex", gap: "14px", marginTop: "4px", flexWrap: "wrap" }}>
                            {(net.vlanId || net.vlanName) && (
                              <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
                                VLAN {net.vlanId}{net.vlanName ? ` (${net.vlanName})` : ""}
                              </span>
                            )}
                            {net.subnet && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>Subnet: {net.subnet.cidr}</span>}
                            {net.credential && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>PSK: {net.credential.label}</span>}
                            {net.clientIsolation && <span style={{ fontSize: "12px", color: "#f59e0b" }}>Client isolated</span>}
                            {net.bandSteering && <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>Band steering</span>}
                            {net.notes && <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>{net.notes}</span>}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                          <button style={btn("ghost")} onClick={() => startEditNet(net)}>Edit</button>
                          <button style={btn("danger")} onClick={() => deleteNetwork(net.id, ctrl.id)}>Del</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {addingNetFor === ctrl.id && (
                  <NetForm onSubmit={() => addNetwork(ctrl.id)} onCancel={() => { setAddingNetFor(null); setError("") }} />
                )}

                {ctrl.notes && (
                  <div style={{ marginTop: "12px", fontSize: "13px", color: "var(--color-text-secondary)", borderTop: "0.5px solid var(--color-border-secondary)", paddingTop: "12px" }}>
                    {ctrl.notes}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
