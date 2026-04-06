"use client"

import { useState, useEffect } from "react"

type Vlan = {
  id: string
  vlanNumber: number
  name: string
  color: string
  description: string | null
}

type AssetInterface = {
  id: string
  assetId: string
  name: string
  ipAddress: string | null
  macAddress: string | null
  vlanId: string | null
  switchPortId: string | null
  asset: { id: string; name: string; friendlyName: string | null; category: string }
}

type SwitchPort = {
  id: string
  portNumber: number
  label: string | null
  isUplink: boolean
  vlanId: string | null
  notes: string | null
  vlan: Vlan | null
  interfaces: AssetInterface[]
}

type ClientAsset = {
  id: string
  name: string
  friendlyName: string | null
  category: string
  interfaces: AssetInterface[]
}

type Props = {
  clientId: string
  deviceId: string
  deviceName: string
  vlans: Vlan[]
  onVlansChange: (vlans: Vlan[]) => void
  assets: ClientAsset[]
  onClose: () => void
}

const PRESET_COLORS = [
  "#6366f1", "#3b82f6", "#06b6d4", "#10b981", "#f59e0b",
  "#ef4444", "#ec4899", "#8b5cf6", "#14b8a6", "#f97316",
]

export default function SwitchPanel({ clientId, deviceId, deviceName, vlans, onVlansChange, assets, onClose }: Props) {
  const [portCount, setPortCount] = useState<number | null>(null)
  const [ports, setPorts] = useState<SwitchPort[]>([])
  const [loading, setLoading] = useState(true)

  const [selectedPort, setSelectedPort] = useState<number | null>(null)
  const [portForm, setPortForm] = useState({ label: "", isUplink: false, vlanId: "", notes: "" })
  const [portSaving, setPortSaving] = useState(false)

  // Interface assignment within port modal
  const [ifaceAssetId, setIfaceAssetId] = useState("")
  const [ifaceName, setIfaceName] = useState("eth0")
  const [ifaceIp, setIfaceIp] = useState("")
  const [ifaceMac, setIfaceMac] = useState("")
  const [ifaceSaving, setIfaceSaving] = useState(false)

  // VLAN management
  const [showVlanMgr, setShowVlanMgr] = useState(false)
  const [vlanForm, setVlanForm] = useState({ vlanNumber: "", name: "", color: "#6366f1", description: "" })
  const [vlanSaving, setVlanSaving] = useState(false)
  const [editingVlan, setEditingVlan] = useState<string | null>(null)
  const [vlanEditForm, setVlanEditForm] = useState({ vlanNumber: "", name: "", color: "#6366f1", description: "" })

  useEffect(() => {
    fetchPorts()
  }, [deviceId])

  async function fetchPorts() {
    setLoading(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/network/${deviceId}/ports`)
      if (res.ok) {
        const data = await res.json()
        setPortCount(data.portCount)
        setPorts(data.ports)
      }
    } finally {
      setLoading(false)
    }
  }

  function getPort(num: number): SwitchPort | undefined {
    return ports.find(p => p.portNumber === num)
  }

  function openPort(num: number) {
    const p = getPort(num)
    setSelectedPort(num)
    setPortForm({
      label: p?.label ?? "",
      isUplink: p?.isUplink ?? false,
      vlanId: p?.vlanId ?? "",
      notes: p?.notes ?? "",
    })
    // Pre-fill interface fields from first connected interface
    const iface = p?.interfaces[0]
    setIfaceAssetId(iface?.assetId ?? "")
    setIfaceName(iface?.name ?? "eth0")
    setIfaceIp(iface?.ipAddress ?? "")
    setIfaceMac(iface?.macAddress ?? "")
  }

  async function savePort() {
    if (selectedPort === null) return
    setPortSaving(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/network/${deviceId}/ports/${selectedPort}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: portForm.label,
          isUplink: portForm.isUplink,
          vlanId: portForm.vlanId || null,
          notes: portForm.notes,
        }),
      })
      if (res.ok) {
        const updated = await res.json()
        setPorts(prev => {
          const existing = prev.find(p => p.portNumber === selectedPort)
          if (existing) return prev.map(p => p.portNumber === selectedPort ? updated : p)
          return [...prev, updated]
        })
      }
    } finally {
      setPortSaving(false)
    }
  }

  async function saveInterface() {
    if (selectedPort === null || !ifaceAssetId) return
    const port = ports.find(p => p.portNumber === selectedPort)
    const existingIface = port?.interfaces.find(i => i.assetId === ifaceAssetId)

    setIfaceSaving(true)
    try {
      if (existingIface) {
        // Update existing
        const res = await fetch(`/api/assets/${ifaceAssetId}/interfaces/${existingIface.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: ifaceName,
            ipAddress: ifaceIp,
            macAddress: ifaceMac,
            vlanId: portForm.vlanId || null,
            switchPortId: port?.id ?? null,
          }),
        })
        if (res.ok) await fetchPorts()
      } else {
        // First, find or get the switch port id (save port first to ensure it exists)
        let portId = port?.id
        if (!portId) {
          // Need to save the port first
          const pRes = await fetch(`/api/clients/${clientId}/network/${deviceId}/ports/${selectedPort}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ label: portForm.label, isUplink: portForm.isUplink, vlanId: portForm.vlanId || null }),
          })
          if (pRes.ok) {
            const saved = await pRes.json()
            portId = saved.id
            setPorts(prev => {
              if (prev.find(p => p.portNumber === selectedPort)) return prev.map(p => p.portNumber === selectedPort ? saved : p)
              return [...prev, saved]
            })
          }
        }
        if (!portId) return

        // Unlink any existing interface on this port from this asset (clear old port assignments)
        const oldIfaces = port?.interfaces.filter(i => i.assetId !== ifaceAssetId) ?? []
        for (const old of oldIfaces) {
          await fetch(`/api/assets/${old.assetId}/interfaces/${old.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ switchPortId: null }),
          })
        }

        // Create new interface
        const res = await fetch(`/api/assets/${ifaceAssetId}/interfaces`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: ifaceName,
            ipAddress: ifaceIp,
            macAddress: ifaceMac,
            vlanId: portForm.vlanId || null,
            switchPortId: portId,
          }),
        })
        if (res.ok) await fetchPorts()
      }
    } finally {
      setIfaceSaving(false)
    }
  }

  async function clearPortInterface() {
    if (selectedPort === null) return
    const port = ports.find(p => p.portNumber === selectedPort)
    if (!port) return
    setIfaceSaving(true)
    try {
      for (const iface of port.interfaces) {
        await fetch(`/api/assets/${iface.assetId}/interfaces/${iface.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ switchPortId: null }),
        })
      }
      await fetchPorts()
      setIfaceAssetId("")
      setIfaceName("eth0")
      setIfaceIp("")
      setIfaceMac("")
    } finally {
      setIfaceSaving(false)
    }
  }

  // VLAN CRUD
  async function addVlan() {
    if (!vlanForm.vlanNumber || !vlanForm.name.trim()) return
    setVlanSaving(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/vlans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vlanForm),
      })
      if (res.ok) {
        const v = await res.json()
        onVlansChange([...vlans, v])
        setVlanForm({ vlanNumber: "", name: "", color: "#6366f1", description: "" })
      } else {
        const e = await res.json()
        alert(e.error)
      }
    } finally {
      setVlanSaving(false)
    }
  }

  async function updateVlan(id: string) {
    setVlanSaving(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/vlans/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vlanEditForm),
      })
      if (res.ok) {
        const updated = await res.json()
        onVlansChange(vlans.map(v => v.id === id ? updated : v))
        setEditingVlan(null)
      }
    } finally {
      setVlanSaving(false)
    }
  }

  async function deleteVlan(id: string) {
    if (!confirm("Delete this VLAN? Ports using it will be untagged.")) return
    const res = await fetch(`/api/clients/${clientId}/vlans/${id}`, { method: "DELETE" })
    if (res.ok) {
      onVlansChange(vlans.filter(v => v.id !== id))
      setPorts(prev => prev.map(p => p.vlanId === id ? { ...p, vlanId: null, vlan: null } : p))
    }
  }

  const totalPorts = portCount ?? 0
  // Build port rows: real switches lay out 2 rows interleaved (odd top, even bottom for 1-indexed)
  // For simplicity: top row = ports 1,3,5,... bottom row = ports 2,4,6,...
  const topPorts = Array.from({ length: Math.ceil(totalPorts / 2) }, (_, i) => i * 2 + 1).filter(n => n <= totalPorts)
  const bottomPorts = Array.from({ length: Math.floor(totalPorts / 2) }, (_, i) => (i + 1) * 2).filter(n => n <= totalPorts)

  function portColor(num: number): string {
    const p = getPort(num)
    if (!p) return "var(--color-background-hover)"
    if (p.isUplink) return "#374151"
    if (p.vlan) return p.vlan.color + "cc"
    return "var(--color-background-hover)"
  }

  function portLabel(num: number): string {
    const p = getPort(num)
    if (!p) return String(num)
    if (p.label) return p.label
    return String(num)
  }

  function portTooltip(num: number): string {
    const p = getPort(num)
    const parts: string[] = [`Port ${num}`]
    if (p?.label) parts.push(p.label)
    if (p?.isUplink) parts.push("Uplink")
    if (p?.vlan) parts.push(`VLAN ${p.vlan.vlanNumber} – ${p.vlan.name}`)
    if (p?.interfaces.length) {
      parts.push(p.interfaces.map(i => i.asset.friendlyName || i.asset.name).join(", "))
    }
    return parts.join("\n")
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "7px 10px", fontSize: "13px",
    border: "0.5px solid var(--color-border-secondary)", borderRadius: "7px",
    background: "var(--color-background-primary)", color: "var(--color-text-primary)",
    boxSizing: "border-box",
  }
  const selectStyle: React.CSSProperties = { ...inputStyle }
  const labelStyle: React.CSSProperties = { fontSize: "12px", color: "var(--color-text-secondary)", display: "block", marginBottom: "3px" }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000,
      display: "flex", alignItems: "flex-start", justifyContent: "center",
      overflowY: "auto", padding: "32px 16px",
    }}>
      <div style={{
        background: "var(--color-background-primary)", borderRadius: "12px",
        border: "0.5px solid var(--color-border-secondary)", width: "100%", maxWidth: "960px",
        padding: "24px", boxSizing: "border-box",
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <div>
            <div style={{ fontSize: "17px", fontWeight: 600 }}>{deviceName}</div>
            <div style={{ fontSize: "13px", color: "var(--color-text-muted)", marginTop: "2px" }}>
              Switch port map {portCount ? `· ${portCount} ports` : ""}
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={() => setShowVlanMgr(v => !v)} style={{
              fontSize: "13px", padding: "6px 14px", borderRadius: "7px",
              border: "0.5px solid var(--color-border-secondary)", background: "transparent",
              cursor: "pointer", color: "var(--color-text-secondary)",
            }}>
              VLANs
            </button>
            <button onClick={onClose} style={{
              fontSize: "13px", padding: "6px 14px", borderRadius: "7px",
              border: "0.5px solid var(--color-border-secondary)", background: "transparent",
              cursor: "pointer", color: "var(--color-text-secondary)",
            }}>
              Close
            </button>
          </div>
        </div>

        {/* VLAN manager */}
        {showVlanMgr && (
          <div style={{
            background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)",
            borderRadius: "10px", padding: "16px", marginBottom: "20px",
          }}>
            <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "12px", color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              VLAN Management
            </div>
            {vlans.length > 0 && (
              <div style={{ marginBottom: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
                {vlans.map(v => editingVlan === v.id ? (
                  <div key={v.id} style={{ display: "grid", gridTemplateColumns: "80px 1fr 120px 1fr auto auto", gap: "8px", alignItems: "end" }}>
                    <div>
                      <label style={labelStyle}>VLAN #</label>
                      <input type="number" value={vlanEditForm.vlanNumber} onChange={e => setVlanEditForm(f => ({ ...f, vlanNumber: e.target.value }))} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Name</label>
                      <input value={vlanEditForm.name} onChange={e => setVlanEditForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Color</label>
                      <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                        <input type="color" value={vlanEditForm.color} onChange={e => setVlanEditForm(f => ({ ...f, color: e.target.value }))}
                          style={{ width: "32px", height: "32px", border: "none", background: "none", cursor: "pointer", padding: 0 }} />
                        <div style={{ display: "flex", gap: "3px", flexWrap: "wrap" }}>
                          {PRESET_COLORS.map(c => (
                            <div key={c} onClick={() => setVlanEditForm(f => ({ ...f, color: c }))}
                              style={{ width: "14px", height: "14px", borderRadius: "3px", background: c, cursor: "pointer", border: vlanEditForm.color === c ? "2px solid white" : "none" }} />
                          ))}
                        </div>
                      </div>
                    </div>
                    <div>
                      <label style={labelStyle}>Description</label>
                      <input value={vlanEditForm.description} onChange={e => setVlanEditForm(f => ({ ...f, description: e.target.value }))} style={inputStyle} />
                    </div>
                    <button onClick={() => updateVlan(v.id)} disabled={vlanSaving}
                      style={{ fontSize: "12px", padding: "6px 12px", borderRadius: "6px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>
                      Save
                    </button>
                    <button onClick={() => setEditingVlan(null)}
                      style={{ fontSize: "12px", padding: "6px 12px", borderRadius: "6px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div key={v.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "6px 10px", background: "var(--color-background-primary)", borderRadius: "7px", border: "0.5px solid var(--color-border-tertiary)" }}>
                    <div style={{ width: "14px", height: "14px", borderRadius: "3px", background: v.color, flexShrink: 0 }} />
                    <span style={{ fontSize: "13px", fontWeight: 500, minWidth: "48px" }}>VLAN {v.vlanNumber}</span>
                    <span style={{ fontSize: "13px" }}>{v.name}</span>
                    {v.description && <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>{v.description}</span>}
                    <div style={{ marginLeft: "auto", display: "flex", gap: "6px" }}>
                      <button onClick={() => { setEditingVlan(v.id); setVlanEditForm({ vlanNumber: String(v.vlanNumber), name: v.name, color: v.color, description: v.description ?? "" }) }}
                        style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "5px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>
                        Edit
                      </button>
                      <button onClick={() => deleteVlan(v.id)}
                        style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "5px", border: "none", background: "transparent", cursor: "pointer", color: "var(--color-text-danger, #ef4444)" }}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {/* Add VLAN form */}
            <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 120px 1fr auto", gap: "8px", alignItems: "end" }}>
              <div>
                <label style={labelStyle}>VLAN #</label>
                <input type="number" value={vlanForm.vlanNumber} onChange={e => setVlanForm(f => ({ ...f, vlanNumber: e.target.value }))} placeholder="10" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Name</label>
                <input value={vlanForm.name} onChange={e => setVlanForm(f => ({ ...f, name: e.target.value }))} placeholder="Corp LAN" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Color</label>
                <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                  <input type="color" value={vlanForm.color} onChange={e => setVlanForm(f => ({ ...f, color: e.target.value }))}
                    style={{ width: "32px", height: "32px", border: "none", background: "none", cursor: "pointer", padding: 0 }} />
                  <div style={{ display: "flex", gap: "3px", flexWrap: "wrap" }}>
                    {PRESET_COLORS.map(c => (
                      <div key={c} onClick={() => setVlanForm(f => ({ ...f, color: c }))}
                        style={{ width: "14px", height: "14px", borderRadius: "3px", background: c, cursor: "pointer", border: vlanForm.color === c ? "2px solid white" : "none" }} />
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <label style={labelStyle}>Description</label>
                <input value={vlanForm.description} onChange={e => setVlanForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional" style={inputStyle} />
              </div>
              <button onClick={addVlan} disabled={vlanSaving || !vlanForm.vlanNumber || !vlanForm.name.trim()}
                style={{ fontSize: "13px", padding: "7px 14px", borderRadius: "7px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>
                Add
              </button>
            </div>
          </div>
        )}

        {/* VLAN legend */}
        {vlans.length > 0 && (
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "16px" }}>
            {vlans.map(v => (
              <div key={v.id} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <div style={{ width: "12px", height: "12px", borderRadius: "3px", background: v.color }} />
                <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>VLAN {v.vlanNumber} – {v.name}</span>
              </div>
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <div style={{ width: "12px", height: "12px", borderRadius: "3px", background: "#374151" }} />
              <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>Uplink</span>
            </div>
          </div>
        )}

        {/* Switch visual */}
        {loading ? (
          <div style={{ fontSize: "14px", color: "var(--color-text-secondary)", padding: "32px 0" }}>Loading ports...</div>
        ) : totalPorts === 0 ? (
          <div style={{ fontSize: "14px", color: "var(--color-text-secondary)", padding: "32px 0", textAlign: "center" }}>
            No port count set. Edit the device and set the port count to enable the switch panel.
          </div>
        ) : (
          <div style={{
            background: "#1a1a1a", border: "2px solid #374151", borderRadius: "10px",
            padding: "16px 20px", overflowX: "auto",
          }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: totalPorts > 24 ? "640px" : undefined }}>
              {/* Top row */}
              <div style={{ display: "flex", gap: "4px" }}>
                {topPorts.map(num => (
                  <button key={num} title={portTooltip(num)} onClick={() => openPort(num)} style={{
                    width: "36px", height: "36px", borderRadius: "4px", border: selectedPort === num ? "2px solid white" : "1.5px solid #4b5563",
                    background: portColor(num), cursor: "pointer", fontSize: "9px", fontWeight: 600,
                    color: getPort(num)?.vlan ? "white" : "#9ca3af",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexDirection: "column", gap: "1px", padding: "2px",
                    flexShrink: 0,
                    position: "relative",
                  }}>
                    <span>{portLabel(num)}</span>
                    {getPort(num)?.interfaces.length ? (
                      <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#22c55e", display: "block" }} />
                    ) : null}
                  </button>
                ))}
              </div>
              {/* Bottom row */}
              <div style={{ display: "flex", gap: "4px" }}>
                {bottomPorts.map(num => (
                  <button key={num} title={portTooltip(num)} onClick={() => openPort(num)} style={{
                    width: "36px", height: "36px", borderRadius: "4px", border: selectedPort === num ? "2px solid white" : "1.5px solid #4b5563",
                    background: portColor(num), cursor: "pointer", fontSize: "9px", fontWeight: 600,
                    color: getPort(num)?.vlan ? "white" : "#9ca3af",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexDirection: "column", gap: "1px", padding: "2px",
                    flexShrink: 0,
                    position: "relative",
                  }}>
                    <span>{portLabel(num)}</span>
                    {getPort(num)?.interfaces.length ? (
                      <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#22c55e", display: "block" }} />
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Port detail panel */}
        {selectedPort !== null && (
          <div style={{
            marginTop: "20px", background: "var(--color-background-secondary)",
            border: "0.5px solid var(--color-border-tertiary)", borderRadius: "10px", padding: "18px",
          }}>
            <div style={{ fontSize: "15px", fontWeight: 500, marginBottom: "14px" }}>
              Port {selectedPort} {portForm.label ? `— ${portForm.label}` : ""}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "14px" }}>
              <div>
                <label style={labelStyle}>Label</label>
                <input value={portForm.label} onChange={e => setPortForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. Uplink to Router" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>VLAN</label>
                <select value={portForm.vlanId} onChange={e => setPortForm(f => ({ ...f, vlanId: e.target.value }))} style={selectStyle}>
                  <option value="">Untagged</option>
                  {vlans.map(v => <option key={v.id} value={v.id}>VLAN {v.vlanNumber} – {v.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                  <input type="checkbox" checked={portForm.isUplink} onChange={e => setPortForm(f => ({ ...f, isUplink: e.target.checked }))} />
                  Uplink port
                </label>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Notes</label>
                <input value={portForm.notes} onChange={e => setPortForm(f => ({ ...f, notes: e.target.value }))} style={inputStyle} />
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px", marginBottom: "18px" }}>
              <button onClick={savePort} disabled={portSaving}
                style={{ fontSize: "13px", fontWeight: 500, padding: "6px 14px", borderRadius: "7px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>
                {portSaving ? "Saving..." : "Save port"}
              </button>
              <button onClick={() => setSelectedPort(null)}
                style={{ fontSize: "13px", padding: "6px 14px", borderRadius: "7px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>
                Dismiss
              </button>
            </div>

            {/* Connected device */}
            <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: "14px" }}>
              <div style={{ fontSize: "13px", fontWeight: 500, marginBottom: "10px", color: "var(--color-text-secondary)" }}>Connected device</div>
              {getPort(selectedPort)?.interfaces.length ? (
                <div style={{ marginBottom: "10px" }}>
                  {getPort(selectedPort)!.interfaces.map(iface => (
                    <div key={iface.id} style={{ fontSize: "13px", background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "7px", padding: "8px 12px", marginBottom: "6px" }}>
                      <div style={{ fontWeight: 500 }}>{iface.asset.friendlyName || iface.asset.name}</div>
                      <div style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
                        {iface.name}{iface.ipAddress ? ` · ${iface.ipAddress}` : ""}{iface.macAddress ? ` · ${iface.macAddress}` : ""}
                      </div>
                    </div>
                  ))}
                  <button onClick={clearPortInterface} disabled={ifaceSaving}
                    style={{ fontSize: "12px", padding: "3px 10px", borderRadius: "5px", border: "none", background: "transparent", cursor: "pointer", color: "var(--color-text-danger, #ef4444)" }}>
                    {ifaceSaving ? "..." : "Disconnect"}
                  </button>
                </div>
              ) : (
                <div style={{ fontSize: "13px", color: "var(--color-text-muted)", marginBottom: "10px" }}>Nothing connected</div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 1fr 1fr auto", gap: "8px", alignItems: "end" }}>
                <div>
                  <label style={labelStyle}>Asset</label>
                  <select value={ifaceAssetId} onChange={e => {
                    setIfaceAssetId(e.target.value)
                    // Pre-fill interface data if asset already has an interface on this port
                    const port = getPort(selectedPort)
                    const existing = port?.interfaces.find(i => i.assetId === e.target.value)
                    if (existing) {
                      setIfaceName(existing.name)
                      setIfaceIp(existing.ipAddress ?? "")
                      setIfaceMac(existing.macAddress ?? "")
                    } else {
                      setIfaceName("eth0")
                      setIfaceIp("")
                      setIfaceMac("")
                    }
                  }} style={selectStyle}>
                    <option value="">Select asset...</option>
                    {assets.map(a => <option key={a.id} value={a.id}>{a.friendlyName || a.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Interface</label>
                  <input value={ifaceName} onChange={e => setIfaceName(e.target.value)} placeholder="eth0" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>IP address</label>
                  <input value={ifaceIp} onChange={e => setIfaceIp(e.target.value)} placeholder="192.168.1.10" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>MAC address</label>
                  <input value={ifaceMac} onChange={e => setIfaceMac(e.target.value)} placeholder="aa:bb:cc:dd:ee:ff" style={inputStyle} />
                </div>
                <button onClick={saveInterface} disabled={ifaceSaving || !ifaceAssetId}
                  style={{ fontSize: "13px", padding: "7px 14px", borderRadius: "7px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>
                  {ifaceSaving ? "..." : "Connect"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
