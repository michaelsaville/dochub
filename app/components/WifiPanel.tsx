"use client"
import { useEffect, useState } from "react"
import CredentialPicker from "@/components/CredentialPicker"
import VlanPicker from "@/components/VlanPicker"

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
  vlanRefId: string | null
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
  assets: { id: string; name: string; friendlyName: string | null; category: string; managementUrl?: string | null; ipAddress?: string | null }[]
  networkDevices: { id: string; name: string; type: string }[]
  subnets: { id: string; cidr: string; vlan: string | null; description: string | null }[]
  credentials: { id: string; label: string }[]
  clientId: string
  onControllersChange: (controllers: WifiController[]) => void
}

const emptyCtrl = { name: "", type: "UNIFI", assetId: "", networkDeviceId: "", credentialId: "", managementUrl: "", notes: "" }
const emptyNet = { ssid: "", band: "DUAL", security: "WPA2_PERSONAL", purpose: "CORPORATE", credentialId: "", subnetId: "", vlanRefId: "", vlanId: "", vlanName: "", isHidden: false, clientIsolation: false, bandSteering: false, notes: "" }

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

  // Revealed PSK passwords keyed by network id. Populated lazily by
  // /api/credentials/[id]/reveal — gated server-side by ADMIN role or the
  // credential's allowTechReveal flag. UI hides on subsequent click.
  const [revealedPsk, setRevealedPsk] = useState<Record<string, string>>({})
  const [revealError, setRevealError] = useState<Record<string, string>>({})
  const [revealingId, setRevealingId] = useState<string | null>(null)
  const [copiedPskId, setCopiedPskId] = useState<string | null>(null)

  async function revealPsk(networkId: string, credentialId: string) {
    // Click twice to hide.
    if (revealedPsk[networkId] != null) {
      setRevealedPsk(prev => { const n = { ...prev }; delete n[networkId]; return n })
      return
    }
    setRevealingId(networkId)
    setRevealError(prev => { const n = { ...prev }; delete n[networkId]; return n })
    try {
      const r = await fetch(`/api/credentials/${credentialId}/reveal`)
      if (!r.ok) {
        const data = await r.json().catch(() => ({}))
        setRevealError(prev => ({ ...prev, [networkId]: data.error || `Reveal failed (${r.status})` }))
        return
      }
      const data = await r.json()
      setRevealedPsk(prev => ({ ...prev, [networkId]: data.password ?? "" }))
    } catch (e: any) {
      setRevealError(prev => ({ ...prev, [networkId]: e?.message || "Reveal failed" }))
    } finally { setRevealingId(null) }
  }

  async function copyPsk(networkId: string, credentialId: string) {
    const existing = revealedPsk[networkId]
    let pw = existing
    if (pw == null) {
      // Fetch quietly without showing the password — copy straight to clipboard.
      try {
        const r = await fetch(`/api/credentials/${credentialId}/reveal`)
        if (!r.ok) {
          const data = await r.json().catch(() => ({}))
          setRevealError(prev => ({ ...prev, [networkId]: data.error || `Copy failed (${r.status})` }))
          return
        }
        const data = await r.json()
        pw = data.password ?? ""
      } catch (e: any) {
        setRevealError(prev => ({ ...prev, [networkId]: e?.message || "Copy failed" }))
        return
      }
    }
    try {
      await navigator.clipboard.writeText(pw)
      setCopiedPskId(networkId)
      setTimeout(() => setCopiedPskId(prev => prev === networkId ? null : prev), 1500)
    } catch (e: any) {
      setRevealError(prev => ({ ...prev, [networkId]: "Copy to clipboard failed" }))
    }
  }

  // Self-managed live data for dropdowns. The parent passes `credentials`
  // and `subnets` as initial snapshots — but if the operator adds a new
  // credential / IPAM subnet in another tab and comes back here, those
  // props are stale (parent's fetchers are guarded). Re-fetch on demand.
  const [liveCreds, setLiveCreds] = useState(credentials)
  const [liveSubnets, setLiveSubnets] = useState(subnets)
  const [refreshingCreds, setRefreshingCreds] = useState(false)
  const [refreshingSubnets, setRefreshingSubnets] = useState(false)

  async function refreshCreds() {
    setRefreshingCreds(true)
    try {
      const r = await fetch(`/api/clients/${clientId}/credentials`)
      if (r.ok) {
        const data = await r.json()
        setLiveCreds(data.map((c: any) => ({ id: c.id, label: c.label })))
      }
    } finally { setRefreshingCreds(false) }
  }
  async function refreshSubnets() {
    setRefreshingSubnets(true)
    try {
      const r = await fetch(`/api/clients/${clientId}/subnets`)
      if (r.ok) {
        const data = await r.json()
        setLiveSubnets(data.map((s: any) => ({
          id: s.id, cidr: s.cidr, vlan: s.vlan ?? null, description: s.description ?? null,
        })))
      }
    } finally { setRefreshingSubnets(false) }
  }

  // Auto-refresh when any add/edit form opens — that's the moment the
  // operator needs the freshest list to pick from.
  useEffect(() => {
    if (showAddCtrl || editingCtrlId || addingNetFor || editingNetId) {
      refreshCreds()
      refreshSubnets()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAddCtrl, editingCtrlId, addingNetFor, editingNetId])

  // Sync from props if the parent ever pushes a fresh snapshot (e.g.
  // first load). Length growth is a safe signal: never shrink the local
  // list because of a stale prop.
  useEffect(() => {
    if (credentials.length > liveCreds.length) setLiveCreds(credentials)
  }, [credentials, liveCreds.length])
  useEffect(() => {
    if (subnets.length > liveSubnets.length) setLiveSubnets(subnets)
  }, [subnets, liveSubnets.length])

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
      const data = await res.json()
      if (!res.ok) { setError(data.error || "Failed"); return }
      onControllersChange(controllers.map(c => c.id === id ? { ...data } : c))
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
    setNetForm({ ssid: n.ssid, band: n.band, security: n.security, purpose: n.purpose, credentialId: n.credential?.id || "", subnetId: n.subnet?.id || "", vlanRefId: n.vlanRefId || "", vlanId: n.vlanId?.toString() || "", vlanName: n.vlanName || "", isHidden: n.isHidden, clientIsolation: n.clientIsolation, bandSteering: n.bandSteering, notes: n.notes || "" })
    setEditingNetId(n.id)
  }

  // CtrlForm + NetForm are extracted to module scope below (see end of file).
  // Defining them inline here gave them a new function identity on every
  // render, which made React unmount + remount the entire <input> subtree
  // on every keystroke — the user reported the cursor "jumping around like
  // it's constantly refreshing." Made worse by the page's 1-sec TOTP tick.

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
          <CtrlForm
            form={ctrlForm} setForm={setCtrlForm}
            clientId={clientId} credentials={liveCreds}
            assets={assets} assetLabel={assetLabel}
            networkDevices={networkDevices}
            error={error} saving={saving}
            onSubmit={saveCtrl}
            onCancel={() => { setShowAddCtrl(false); setError("") }}
          />
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
                <CtrlForm
                  form={ctrlForm} setForm={setCtrlForm}
                  clientId={clientId} credentials={liveCreds}
            assets={assets} assetLabel={assetLabel}
                  networkDevices={networkDevices}
                  error={error} saving={saving}
                  onSubmit={() => updateCtrl(ctrl.id)}
                  onCancel={() => { setEditingCtrlId(null); setError("") }}
                />
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
                      <NetForm
                        form={netForm} setForm={setNetForm}
                        clientId={clientId} credentials={liveCreds}
                        subnets={liveSubnets} onRefreshSubnets={refreshSubnets} refreshingSubnets={refreshingSubnets}
                        subnetLabel={subnetLabel}
                        error={error} saving={saving}
                        onSubmit={() => updateNetwork(net.id, ctrl.id)}
                        onCancel={() => { setEditingNetId(null); setError("") }}
                      />
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
                            {net.credential && (
                              <span style={{ fontSize: "12px", color: "var(--color-text-secondary)", display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                PSK: {net.credential.label}
                                {revealedPsk[net.id] != null ? (
                                  <code style={{ fontSize: 12, padding: "1px 6px", borderRadius: 4, background: "var(--color-background-hover)", color: "var(--color-text-primary)" }}>
                                    {revealedPsk[net.id] || "(empty)"}
                                  </code>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => revealPsk(net.id, net.credential!.id)}
                                  disabled={revealingId === net.id}
                                  title={revealedPsk[net.id] != null ? "Hide password" : "Reveal password"}
                                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--color-accent)", fontSize: 12 }}
                                >
                                  {revealingId === net.id ? "…" : revealedPsk[net.id] != null ? "Hide" : "Reveal"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => copyPsk(net.id, net.credential!.id)}
                                  title="Copy password to clipboard"
                                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--color-text-muted)", fontSize: 12 }}
                                >
                                  {copiedPskId === net.id ? "Copied!" : "Copy"}
                                </button>
                                {revealError[net.id] && (
                                  <span style={{ fontSize: 11, color: "#ef4444" }}>{revealError[net.id]}</span>
                                )}
                              </span>
                            )}
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
                  <NetForm
                    form={netForm} setForm={setNetForm}
                    clientId={clientId} credentials={liveCreds}
                        subnets={liveSubnets} onRefreshSubnets={refreshSubnets} refreshingSubnets={refreshingSubnets}
                        subnetLabel={subnetLabel}
                    error={error} saving={saving}
                    onSubmit={() => addNetwork(ctrl.id)}
                    onCancel={() => { setAddingNetFor(null); setError("") }}
                  />
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

// ───────────────────────────────────────────────────────────────────────────
// Module-level form components. MUST live outside the WifiPanel function so
// React preserves the same function identity across parent re-renders and
// keeps the existing input DOM nodes mounted (i.e. cursor stays put).
// ───────────────────────────────────────────────────────────────────────────

type CtrlFormState = {
  name: string
  type: string
  assetId: string
  networkDeviceId: string
  credentialId: string
  managementUrl: string
  notes: string
}

function CtrlForm({
  form, setForm, clientId,
  credentials,
  assets, assetLabel, networkDevices,
  error, saving,
  onSubmit, onCancel,
}: {
  form: CtrlFormState
  setForm: (updater: (f: CtrlFormState) => CtrlFormState) => void
  clientId: string
  credentials: { id: string; label: string }[]
  assets: { id: string; name: string; friendlyName: string | null; managementUrl?: string | null; ipAddress?: string | null }[]
  assetLabel: (a: { name: string; friendlyName: string | null }) => string
  networkDevices: { id: string; name: string; type: string }[]
  error: string
  saving: boolean
  onSubmit: () => void
  onCancel: () => void
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <div>
          <label style={lbl}>Name *</label>
          <input style={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Unifi Controller" />
        </div>
        <div>
          <label style={lbl}>Type *</label>
          <select style={inp} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
            {Object.entries(CONTROLLER_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Management URL</label>
          <input style={inp} value={form.managementUrl} onChange={e => setForm(f => ({ ...f, managementUrl: e.target.value }))} placeholder="https://192.168.1.1" />
        </div>
        <div>
          <CredentialPicker
            clientId={clientId}
            label="Admin Credential"
            value={form.credentialId}
            onChange={v => setForm(f => ({ ...f, credentialId: v }))}
            credentials={credentials}
            prefillLabel={form.name ? `${form.name} admin` : ""}
          />
        </div>
        <div>
          <label style={lbl}>Controller Asset</label>
          <select style={inp} value={form.assetId} onChange={e => {
            const a = assets.find(x => x.id === e.target.value)
            // Linking the controller asset fills the mgmt URL + name from it (blank-only)
            // so the URL/name documented on the asset isn't re-typed here.
            setForm(f => ({
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
          <label style={lbl}>Controller Network Device</label>
          <select style={inp} value={form.networkDeviceId} onChange={e => setForm(f => ({ ...f, networkDeviceId: e.target.value }))}>
            <option value="">— None —</option>
            {networkDevices.map(d => <option key={d.id} value={d.id}>{d.name} ({d.type})</option>)}
          </select>
        </div>
      </div>
      <div>
        <label style={lbl}>Notes</label>
        <textarea style={{ ...inp, minHeight: "60px", resize: "vertical" }} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
      </div>
      {error && <div style={{ color: "#ef4444", fontSize: "13px" }}>{error}</div>}
      <div style={{ display: "flex", gap: "8px" }}>
        <button style={btn("primary")} onClick={onSubmit} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        <button style={btn("ghost")} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

type NetFormState = {
  ssid: string
  band: string
  security: string
  purpose: string
  credentialId: string
  subnetId: string
  vlanRefId: string
  vlanId: string
  vlanName: string
  isHidden: boolean
  clientIsolation: boolean
  bandSteering: boolean
  notes: string
}

function NetForm({
  form, setForm, clientId,
  credentials,
  subnets, onRefreshSubnets, refreshingSubnets,
  subnetLabel,
  error, saving,
  onSubmit, onCancel,
}: {
  form: NetFormState
  setForm: (updater: (f: NetFormState) => NetFormState) => void
  clientId: string
  credentials: { id: string; label: string }[]
  subnets: { id: string; cidr: string; vlan: string | null; description: string | null }[]
  onRefreshSubnets: () => void
  refreshingSubnets: boolean
  subnetLabel: (s: { cidr: string; vlan: string | null; description: string | null }) => string
  error: string
  saving: boolean
  onSubmit: () => void
  onCancel: () => void
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "16px", background: "var(--color-background-primary)", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", marginTop: "12px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
        <div>
          <label style={lbl}>SSID *</label>
          <input style={inp} value={form.ssid} onChange={e => setForm(f => ({ ...f, ssid: e.target.value }))} placeholder="Corp-WiFi" />
        </div>
        <div>
          <label style={lbl}>Band</label>
          <select style={inp} value={form.band} onChange={e => setForm(f => ({ ...f, band: e.target.value }))}>
            {Object.entries(BANDS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Security</label>
          <select style={inp} value={form.security} onChange={e => setForm(f => ({ ...f, security: e.target.value }))}>
            {Object.entries(SECURITY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
        <div>
          <label style={lbl}>Purpose</label>
          <select style={inp} value={form.purpose} onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))}>
            {Object.entries(PURPOSES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <CredentialPicker
            clientId={clientId}
            label="PSK / Credential"
            value={form.credentialId}
            onChange={v => setForm(f => ({ ...f, credentialId: v }))}
            credentials={credentials}
            prefillLabel={form.ssid ? `${form.ssid} PSK` : ""}
            prefillUsername={form.ssid}
          />
        </div>
        <div>
          <label style={lbl}>
            Linked Subnet (IPAM)
            <button
              type="button"
              onClick={onRefreshSubnets}
              disabled={refreshingSubnets}
              title="Refresh — picks up subnets you added under IPAM"
              style={{ marginLeft: 6, padding: "0 6px", background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)", fontSize: 12 }}
            >
              {refreshingSubnets ? "…" : "↻"}
            </button>
          </label>
          <select style={inp} value={form.subnetId} onChange={e => {
            const s = subnets.find(x => x.id === e.target.value)
            // Linking the subnet fills the VLAN name from the subnet's documented
            // VLAN (blank-only) so it isn't re-typed; numeric VLAN tags also seed VLAN ID.
            setForm(f => {
              const next = { ...f, subnetId: e.target.value }
              if (s?.vlan) {
                if (!f.vlanName) next.vlanName = s.vlan
                if (!f.vlanId && /^\d+$/.test(s.vlan.trim())) next.vlanId = s.vlan.trim()
              }
              return next
            })
          }}>
            <option value="">— None —</option>
            {subnets.map(s => <option key={s.id} value={s.id}>{subnetLabel(s)}</option>)}
          </select>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 1fr", gap: "10px" }}>
        <div>
          <VlanPicker clientId={clientId} value={form.vlanRefId}
            label="VLAN (documented)"
            onChange={(refId, v) => setForm(f => ({
              ...f,
              vlanRefId: refId,
              vlanId: v ? String(v.vlanNumber) : f.vlanId,
              vlanName: v ? v.name : f.vlanName,
            }))} />
        </div>
        <div>
          <label style={lbl}>VLAN ID</label>
          <input style={inp} type="number" value={form.vlanId} onChange={e => setForm(f => ({ ...f, vlanId: e.target.value }))} placeholder="20" />
        </div>
        <div>
          <label style={lbl}>VLAN Name</label>
          <input style={inp} value={form.vlanName} onChange={e => setForm(f => ({ ...f, vlanName: e.target.value }))} placeholder="Guest" />
        </div>
      </div>
      <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
        {([["isHidden", "Hidden SSID"], ["clientIsolation", "Client isolation"], ["bandSteering", "Band steering"]] as const).map(([key, label]) => (
          <label key={key} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--color-text-secondary)", cursor: "pointer" }}>
            <input type="checkbox" checked={form[key] as boolean} onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))} />
            {label}
          </label>
        ))}
      </div>
      <div>
        <label style={lbl}>Notes</label>
        <input style={inp} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
      </div>
      {error && <div style={{ color: "#ef4444", fontSize: "13px" }}>{error}</div>}
      <div style={{ display: "flex", gap: "8px" }}>
        <button style={btn("primary")} onClick={onSubmit} disabled={saving}>{saving ? "Saving…" : "Save Network"}</button>
        <button style={btn("ghost")} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
