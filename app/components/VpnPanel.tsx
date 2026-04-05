"use client"

import { useState } from "react"

// ── Types ─────────────────────────────────────────────────────────────────────

type VpnAccessor = {
  id: string
  accessorType: "CLIENT_USER" | "VENDOR" | "STAFF_USER" | "CONTACT" | "THIRD_PARTY"
  clientUserId: string | null
  vendorId: string | null
  staffUserId: string | null
  contactId: string | null
  thirdPartyName: string | null
  credentialId: string | null
  mfaEnabled: boolean
  accessScope: string | null
  certExpiry: string | null
  isActive: boolean
  notes: string | null
  clientUser: { id: string; name: string; email: string | null } | null
  vendor: { id: string; name: string } | null
  staffUser: { id: string; name: string; email: string | null } | null
  contact: { id: string; name: string; role: string | null } | null
  credential: { id: string; label: string } | null
}

type VpnGateway = {
  id: string
  name: string
  type: string
  serverAddress: string | null
  port: number | null
  protocol: string | null
  serverConfig: string | null
  clientConfig: string | null
  assetId: string | null
  networkDeviceId: string | null
  credentialId: string | null
  notes: string | null
  isActive: boolean
  asset: { id: string; name: string; friendlyName: string | null } | null
  networkDevice: { id: string; name: string; type: string } | null
  credential: { id: string; label: string } | null
  accessors: VpnAccessor[]
}

type Props = {
  gateways: VpnGateway[]
  assets: { id: string; name: string; friendlyName: string | null; category: string }[]
  networkDevices: { id: string; name: string; type: string }[]
  clientUsers: { id: string; name: string; email: string | null }[]
  vendors: { id: string; name: string }[]
  staffUsers: { id: string; name: string; email: string | null }[]
  contacts: { id: string; name: string; role: string | null }[]
  credentials: { id: string; label: string }[]
  clientId: string
  onGatewaysChange: (gateways: VpnGateway[]) => void
}

// ── Constants ──────────────────────────────────────────────────────────────────

const VPN_TYPES: Record<string, string> = {
  OPENVPN: "OpenVPN",
  SONICWALL_GVN: "SonicWall Global VPN",
  MERAKI_VPN: "Meraki VPN",
  TAILSCALE: "Tailscale",
  L2TP_IPSEC: "L2TP/IPsec",
  WIREGUARD: "WireGuard",
  CISCO_ANYCONNECT: "Cisco AnyConnect",
  FORTINET: "FortiClient",
  OTHER: "Other",
}

const VPN_TYPE_NOTES: Record<string, string> = {
  TAILSCALE: "Mesh network — no fixed server address. Document the tailnet admin credential.",
  L2TP_IPSEC: "Often used for site-to-site tunnels. No user accessors needed for S2S.",
  SONICWALL_GVN: "SonicWall Global VPN Client. Server is the SonicWall WAN IP.",
  MERAKI_VPN: "Meraki Client VPN (L2TP/IPsec under the hood). Server is the MX WAN IP.",
  OPENVPN: "Viscosity and Tunnelblick are client apps for OpenVPN — gateway type stays OpenVPN.",
}

const ACCESSOR_TYPES: Record<string, string> = {
  CLIENT_USER: "Client staff",
  VENDOR: "Vendor / Third-party company",
  STAFF_USER: "PCC Tech",
  CONTACT: "Contact",
  THIRD_PARTY: "One-off / unnamed",
}

const ACCESSOR_COLORS: Record<string, string> = {
  CLIENT_USER: "#3b82f6",
  VENDOR: "#f59e0b",
  STAFF_USER: "#8b5cf6",
  CONTACT: "#22c55e",
  THIRD_PARTY: "#94a3b8",
}

// ── Shared styles ──────────────────────────────────────────────────────────────

const inp = {
  width: "100%", padding: "8px 12px", fontSize: "14px",
  border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px",
  background: "var(--color-background-primary)", color: "var(--color-text-primary)",
  boxSizing: "border-box" as const,
}
const lbl = { fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }
const card = {
  background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-secondary)",
  borderRadius: "10px", padding: "20px", marginBottom: "16px",
}

function emptyState(msg: string) {
  return (
    <div style={{ fontSize: "14px", color: "var(--color-text-secondary)", padding: "32px", textAlign: "center", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "10px" }}>
      {msg}
    </div>
  )
}

function displayName(a: VpnAccessor): string {
  if (a.clientUser) return a.clientUser.name
  if (a.vendor) return a.vendor.name
  if (a.staffUser) return a.staffUser.name
  if (a.contact) return a.contact.name
  if (a.thirdPartyName) return a.thirdPartyName
  return "Unknown"
}

function displaySub(a: VpnAccessor): string | null {
  if (a.clientUser?.email) return a.clientUser.email
  if (a.staffUser?.email) return a.staffUser.email
  if (a.contact?.role) return a.contact.role
  return null
}

function certExpiryBadge(expiry: string | null) {
  if (!expiry) return null
  const days = Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000)
  const color = days < 0 ? "#ef4444" : days < 30 ? "#f59e0b" : "#22c55e"
  const label = days < 0 ? `Expired ${Math.abs(days)}d ago` : days === 0 ? "Expires today" : `Cert ${days}d`
  return <span style={{ fontSize: "11px", fontWeight: 600, padding: "2px 7px", borderRadius: "4px", background: color + "22", color }}>{label}</span>
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function VpnPanel({
  gateways, assets, networkDevices, clientUsers, vendors, staffUsers, contacts, credentials, clientId, onGatewaysChange,
}: Props) {
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({
    name: "", type: "OPENVPN", serverAddress: "", port: "", protocol: "UDP",
    assetId: "", networkDeviceId: "", credentialId: "",
    serverConfig: "", clientConfig: "", notes: "",
  })
  const [saving, setSaving] = useState(false)
  const [expandedGateway, setExpandedGateway] = useState<string | null>(null)
  const [editingGateway, setEditingGateway] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<any>({})
  const [configView, setConfigView] = useState<Record<string, "server" | "client" | null>>({})

  const firewallDevices = networkDevices.filter(d => ["FIREWALL", "ROUTER"].includes(d.type))
  const serverAssets = assets.filter(a => ["SERVER", "NAS"].includes(a.category))

  async function saveGateway() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/vpn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        const created = await res.json()
        onGatewaysChange([...gateways, created])
        setForm({ name: "", type: "OPENVPN", serverAddress: "", port: "", protocol: "UDP", assetId: "", networkDeviceId: "", credentialId: "", serverConfig: "", clientConfig: "", notes: "" })
        setShowAdd(false)
      }
    } finally { setSaving(false) }
  }

  async function updateGateway(gatewayId: string) {
    setSaving(true)
    try {
      const res = await fetch(`/api/vpn/${gatewayId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      })
      if (res.ok) {
        const updated = await res.json()
        onGatewaysChange(gateways.map(g => g.id === gatewayId ? updated : g))
        setEditingGateway(null)
      }
    } finally { setSaving(false) }
  }

  async function deleteGateway(gatewayId: string) {
    if (!confirm("Delete this VPN gateway and all its accessor records?")) return
    const res = await fetch(`/api/vpn/${gatewayId}`, { method: "DELETE" })
    if (res.ok) onGatewaysChange(gateways.filter(g => g.id !== gatewayId))
  }

  async function addAccessor(gatewayId: string, accessorForm: any) {
    const res = await fetch(`/api/vpn/${gatewayId}/accessors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(accessorForm),
    })
    if (res.ok) {
      const accessor = await res.json()
      onGatewaysChange(gateways.map(g => g.id === gatewayId ? { ...g, accessors: [...g.accessors, accessor] } : g))
    }
  }

  async function updateAccessor(gatewayId: string, accessorId: string, data: any) {
    const res = await fetch(`/api/vpn-accessors/${accessorId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    if (res.ok) {
      const updated = await res.json()
      onGatewaysChange(gateways.map(g => g.id === gatewayId
        ? { ...g, accessors: g.accessors.map(a => a.id === accessorId ? updated : a) }
        : g
      ))
    }
  }

  async function deleteAccessor(gatewayId: string, accessorId: string) {
    const res = await fetch(`/api/vpn-accessors/${accessorId}`, { method: "DELETE" })
    if (res.ok) {
      onGatewaysChange(gateways.map(g => g.id === gatewayId
        ? { ...g, accessors: g.accessors.filter(a => a.id !== accessorId) }
        : g
      ))
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px" }}>
        <button onClick={() => setShowAdd(true)} style={{ fontSize: "14px", fontWeight: 500, padding: "8px 16px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: "pointer" }}>
          Add gateway
        </button>
      </div>

      {/* Add gateway form */}
      {showAdd && (
        <GatewayForm
          form={form}
          setForm={setForm}
          onSave={saveGateway}
          onCancel={() => setShowAdd(false)}
          saving={saving}
          serverAssets={serverAssets}
          firewallDevices={firewallDevices}
          credentials={credentials}
          title="New VPN gateway"
        />
      )}

      {gateways.length === 0 && !showAdd && emptyState("No VPN gateways documented yet. Add one to get started.")}

      {/* Gateway list */}
      {gateways.map(gateway => (
        <div key={gateway.id} style={{ border: "0.5px solid var(--color-border-secondary)", borderRadius: "10px", marginBottom: "12px", overflow: "hidden" }}>

          {/* Edit form */}
          {editingGateway === gateway.id ? (
            <div style={{ padding: "16px", background: "var(--color-background-secondary)" }}>
              <GatewayForm
                form={editForm}
                setForm={setEditForm}
                onSave={() => updateGateway(gateway.id)}
                onCancel={() => setEditingGateway(null)}
                saving={saving}
                serverAssets={serverAssets}
                firewallDevices={firewallDevices}
                credentials={credentials}
                title="Edit gateway"
              />
            </div>
          ) : (
            /* Gateway header row */
            <div
              style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: "12px", cursor: "pointer", background: "var(--color-background-primary)" }}
              onClick={() => setExpandedGateway(expandedGateway === gateway.id ? null : gateway.id)}
            >
              {/* Type badge */}
              <span style={{ fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "4px", background: "var(--color-background-secondary)", color: "var(--color-text-secondary)", whiteSpace: "nowrap", flexShrink: 0 }}>
                {VPN_TYPES[gateway.type] ?? gateway.type}
              </span>

              {/* Name + address */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "14px", fontWeight: 500 }}>{gateway.name}</div>
                <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "1px", fontFamily: "monospace" }}>
                  {[gateway.serverAddress, gateway.port ? `:${gateway.port}` : null, gateway.protocol ? `(${gateway.protocol})` : null].filter(Boolean).join("")}
                </div>
              </div>

              {/* Host device/asset */}
              {(gateway.networkDevice || gateway.asset) && (
                <span style={{ fontSize: "12px", color: "var(--color-text-secondary)", flexShrink: 0 }}>
                  {gateway.networkDevice?.name ?? (gateway.asset?.friendlyName || gateway.asset?.name)}
                </span>
              )}

              {/* Accessor count */}
              <span style={{ fontSize: "12px", color: "var(--color-text-secondary)", flexShrink: 0 }}>
                {gateway.accessors.filter(a => a.isActive).length} active
              </span>

              {/* Inactive badge */}
              {!gateway.isActive && (
                <span style={{ fontSize: "11px", padding: "2px 6px", borderRadius: "4px", background: "#94a3b822", color: "#94a3b8" }}>Inactive</span>
              )}

              <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{expandedGateway === gateway.id ? "▲" : "▼"}</span>

              <button onClick={e => { e.stopPropagation(); setEditingGateway(gateway.id); setEditForm({ ...gateway, port: gateway.port ?? "" }); setExpandedGateway(null) }}
                style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: "0 4px", flexShrink: 0 }}>Edit</button>
              <button onClick={e => { e.stopPropagation(); deleteGateway(gateway.id) }}
                style={{ fontSize: "12px", color: "var(--color-text-danger)", background: "none", border: "none", cursor: "pointer", padding: "0 4px", flexShrink: 0 }}>Delete</button>
            </div>
          )}

          {/* Expanded detail */}
          {expandedGateway === gateway.id && (
            <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-primary)" }}>

              {/* Config tabs */}
              {(gateway.serverConfig || gateway.clientConfig) && (
                <div style={{ padding: "12px 16px 0" }}>
                  <div style={{ display: "flex", gap: "2px", marginBottom: "0", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                    {gateway.serverConfig && (
                      <button onClick={() => setConfigView(v => ({ ...v, [gateway.id]: v[gateway.id] === "server" ? null : "server" }))}
                        style={{ fontSize: "12px", fontWeight: configView[gateway.id] === "server" ? 600 : 400, padding: "6px 12px", border: "none", background: "transparent", cursor: "pointer", color: configView[gateway.id] === "server" ? "var(--color-text-primary)" : "var(--color-text-secondary)", borderBottom: configView[gateway.id] === "server" ? "2px solid var(--color-text-primary)" : "2px solid transparent", marginBottom: "-1px" }}>
                        Server config
                      </button>
                    )}
                    {gateway.clientConfig && (
                      <button onClick={() => setConfigView(v => ({ ...v, [gateway.id]: v[gateway.id] === "client" ? null : "client" }))}
                        style={{ fontSize: "12px", fontWeight: configView[gateway.id] === "client" ? 600 : 400, padding: "6px 12px", border: "none", background: "transparent", cursor: "pointer", color: configView[gateway.id] === "client" ? "var(--color-text-primary)" : "var(--color-text-secondary)", borderBottom: configView[gateway.id] === "client" ? "2px solid var(--color-text-primary)" : "2px solid transparent", marginBottom: "-1px" }}>
                        Client config
                      </button>
                    )}
                  </div>
                  {configView[gateway.id] === "server" && gateway.serverConfig && (
                    <pre style={{ fontSize: "12px", padding: "12px", background: "var(--color-background-secondary)", borderRadius: "6px", overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all", margin: "10px 0", lineHeight: 1.6 }}>
                      {gateway.serverConfig}
                    </pre>
                  )}
                  {configView[gateway.id] === "client" && gateway.clientConfig && (
                    <pre style={{ fontSize: "12px", padding: "12px", background: "var(--color-background-secondary)", borderRadius: "6px", overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all", margin: "10px 0", lineHeight: 1.6 }}>
                      {gateway.clientConfig}
                    </pre>
                  )}
                </div>
              )}

              {/* Credential & notes */}
              {(gateway.credential || gateway.notes) && (
                <div style={{ padding: "10px 16px", display: "flex", gap: "16px", flexWrap: "wrap" }}>
                  {gateway.credential && (
                    <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
                      Credential: <span style={{ color: "var(--color-text-primary)" }}>{gateway.credential.label}</span>
                    </span>
                  )}
                  {gateway.notes && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)", fontStyle: "italic" }}>{gateway.notes}</span>}
                </div>
              )}

              {/* Accessors section */}
              <AccessorsPanel
                gateway={gateway}
                clientUsers={clientUsers}
                vendors={vendors}
                staffUsers={staffUsers}
                contacts={contacts}
                credentials={credentials}
                onAdd={(af) => addAccessor(gateway.id, af)}
                onUpdate={(aid, data) => updateAccessor(gateway.id, aid, data)}
                onDelete={(aid) => deleteAccessor(gateway.id, aid)}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Gateway form (shared for add / edit) ──────────────────────────────────────

function GatewayForm({ form, setForm, onSave, onCancel, saving, serverAssets, firewallDevices, credentials, title }: {
  form: any
  setForm: (fn: (f: any) => any) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
  serverAssets: { id: string; name: string; friendlyName: string | null }[]
  firewallDevices: { id: string; name: string }[]
  credentials: { id: string; label: string }[]
  title: string
}) {
  const hint = VPN_TYPE_NOTES[form.type]
  const isTailscale = form.type === "TAILSCALE"
  const isSiteToSite = form.type === "L2TP_IPSEC"

  return (
    <div style={{ background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: "10px", padding: "20px", marginBottom: "16px" }}>
      <div style={{ fontSize: "15px", fontWeight: 500, marginBottom: "16px" }}>{title}</div>
      {hint && <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "6px", padding: "8px 12px", marginBottom: "14px" }}>{hint}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
        <div>
          <label style={lbl}>Name *</label>
          <input autoFocus value={form.name || ""} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Office VPN" style={inp} />
        </div>
        <div>
          <label style={lbl}>Type *</label>
          <select value={form.type || "OPENVPN"} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={inp}>
            {Object.entries(VPN_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>

        {!isTailscale && (
          <>
            <div>
              <label style={lbl}>Server address</label>
              <input value={form.serverAddress || ""} onChange={e => setForm(f => ({ ...f, serverAddress: e.target.value }))} placeholder="203.0.113.10 or vpn.client.com" style={inp} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <div>
                <label style={lbl}>Port</label>
                <input type="number" value={form.port || ""} onChange={e => setForm(f => ({ ...f, port: e.target.value }))} placeholder="1194" style={inp} />
              </div>
              <div>
                <label style={lbl}>Protocol</label>
                <select value={form.protocol || "UDP"} onChange={e => setForm(f => ({ ...f, protocol: e.target.value }))} style={inp}>
                  {["UDP", "TCP", "IKEv2", "L2TP"].map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
          </>
        )}

        {/* Hosted on — firewall or server */}
        {firewallDevices.length > 0 && (
          <div>
            <label style={lbl}>Hosted on (firewall / router)</label>
            <select value={form.networkDeviceId || ""} onChange={e => setForm(f => ({ ...f, networkDeviceId: e.target.value || null, assetId: e.target.value ? null : f.assetId }))} style={inp}>
              <option value="">None</option>
              {firewallDevices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        )}
        {serverAssets.length > 0 && (
          <div>
            <label style={lbl}>Hosted on (server asset)</label>
            <select value={form.assetId || ""} onChange={e => setForm(f => ({ ...f, assetId: e.target.value || null, networkDeviceId: e.target.value ? null : f.networkDeviceId }))} style={inp}>
              <option value="">None</option>
              {serverAssets.map(a => <option key={a.id} value={a.id}>{a.friendlyName || a.name}</option>)}
            </select>
          </div>
        )}

        {/* Admin / PSK credential */}
        {credentials.length > 0 && (
          <div>
            <label style={lbl}>{isTailscale ? "Tailscale admin credential" : "Admin / PSK credential"}</label>
            <select value={form.credentialId || ""} onChange={e => setForm(f => ({ ...f, credentialId: e.target.value || null }))} style={inp}>
              <option value="">None</option>
              {credentials.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
        )}

        {/* Server config */}
        {!isTailscale && (
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={lbl}>Server config{isSiteToSite ? " / tunnel parameters" : ""}</label>
            <textarea
              value={form.serverConfig || ""}
              onChange={e => setForm(f => ({ ...f, serverConfig: e.target.value }))}
              rows={5}
              placeholder={isSiteToSite ? "Remote subnet, local subnet, PSK (or reference credential), IKE version, DPD settings..." : "server.conf content or key settings..."}
              style={{ ...inp, fontFamily: "monospace", fontSize: "12px", resize: "vertical" }}
            />
          </div>
        )}

        {/* Client config */}
        {!isTailscale && !isSiteToSite && (
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={lbl}>Client config template (.ovpn / profile)</label>
            <textarea
              value={form.clientConfig || ""}
              onChange={e => setForm(f => ({ ...f, clientConfig: e.target.value }))}
              rows={5}
              placeholder={"client\ndev tun\nproto udp\nremote 203.0.113.10 1194\n..."}
              style={{ ...inp, fontFamily: "monospace", fontSize: "12px", resize: "vertical" }}
            />
          </div>
        )}

        {isTailscale && (
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={lbl}>Notes (tailnet name, ACL notes, key expiry policy...)</label>
            <textarea value={form.notes || ""} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} style={{ ...inp, resize: "vertical" }} />
          </div>
        )}

        {!isTailscale && (
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={lbl}>Notes</label>
            <textarea value={form.notes || ""} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...inp, resize: "vertical" }} />
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: "8px" }}>
        <button onClick={onSave} disabled={saving} style={{ fontSize: "14px", fontWeight: 500, padding: "8px 16px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>
          {saving ? "Saving..." : "Save"}
        </button>
        <button onClick={onCancel} style={{ fontSize: "14px", padding: "8px 16px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer" }}>Cancel</button>
      </div>
    </div>
  )
}

// ── Accessors panel ────────────────────────────────────────────────────────────

function AccessorsPanel({ gateway, clientUsers, vendors, staffUsers, contacts, credentials, onAdd, onUpdate, onDelete }: {
  gateway: VpnGateway
  clientUsers: { id: string; name: string; email: string | null }[]
  vendors: { id: string; name: string }[]
  staffUsers: { id: string; name: string; email: string | null }[]
  contacts: { id: string; name: string; role: string | null }[]
  credentials: { id: string; label: string }[]
  onAdd: (f: any) => Promise<void>
  onUpdate: (id: string, data: any) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<any>({})
  const emptyForm = { accessorType: "CLIENT_USER", clientUserId: "", vendorId: "", staffUserId: "", contactId: "", thirdPartyName: "", credentialId: "", mfaEnabled: false, accessScope: "", certExpiry: "", notes: "" }
  const [form, setForm] = useState(emptyForm)

  async function save() {
    setSaving(true)
    try { await onAdd(form); setForm(emptyForm); setShowAdd(false) }
    finally { setSaving(false) }
  }

  async function saveEdit(id: string) {
    setSaving(true)
    try { await onUpdate(id, editForm); setEditingId(null) }
    finally { setSaving(false) }
  }

  const active = gateway.accessors.filter(a => a.isActive)
  const inactive = gateway.accessors.filter(a => !a.isActive)

  return (
    <div style={{ padding: "12px 16px 16px" }}>
      <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" }}>
        Who has access
      </div>

      {gateway.accessors.length === 0 && !showAdd && (
        <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginBottom: "8px" }}>No accessors documented.</div>
      )}

      {[...active, ...inactive].map(accessor => (
        <div key={accessor.id} style={{ borderBottom: "0.5px solid var(--color-border-tertiary)", paddingBottom: "10px", marginBottom: "10px" }}>
          {editingId === accessor.id ? (
            <div>
              <AccessorForm form={editForm} setForm={setEditForm} clientUsers={clientUsers} vendors={vendors} staffUsers={staffUsers} contacts={contacts} credentials={credentials} />
              <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
                <button onClick={() => saveEdit(accessor.id)} disabled={saving} style={{ fontSize: "13px", fontWeight: 500, padding: "6px 14px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>Save</button>
                <button onClick={() => setEditingId(null)} style={{ fontSize: "13px", padding: "6px 14px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer" }}>Cancel</button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
              {/* Type dot */}
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: ACCESSOR_COLORS[accessor.accessorType], marginTop: "5px", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "13px", fontWeight: 500 }}>{displayName(accessor)}</span>
                  <span style={{ fontSize: "11px", padding: "1px 6px", borderRadius: "4px", background: ACCESSOR_COLORS[accessor.accessorType] + "22", color: ACCESSOR_COLORS[accessor.accessorType] }}>
                    {ACCESSOR_TYPES[accessor.accessorType]}
                  </span>
                  {accessor.mfaEnabled && (
                    <span style={{ fontSize: "11px", padding: "1px 6px", borderRadius: "4px", background: "#22c55e22", color: "#22c55e" }}>MFA</span>
                  )}
                  {!accessor.isActive && (
                    <span style={{ fontSize: "11px", padding: "1px 6px", borderRadius: "4px", background: "#94a3b822", color: "#94a3b8" }}>Inactive</span>
                  )}
                  {certExpiryBadge(accessor.certExpiry)}
                </div>
                {displaySub(accessor) && <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "1px" }}>{displaySub(accessor)}</div>}
                {accessor.accessScope && <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "2px" }}>Scope: {accessor.accessScope}</div>}
                {accessor.credential && <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "2px" }}>Credential: {accessor.credential.label}</div>}
                {accessor.notes && <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", fontStyle: "italic", marginTop: "2px" }}>{accessor.notes}</div>}
              </div>
              <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                <button onClick={() => { setEditingId(accessor.id); setEditForm({ ...accessor, certExpiry: accessor.certExpiry ? accessor.certExpiry.slice(0, 10) : "" }) }}
                  style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Edit</button>
                <button onClick={() => onDelete(accessor.id)}
                  style={{ fontSize: "12px", color: "var(--color-text-danger)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Remove</button>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Add accessor */}
      {showAdd ? (
        <div style={{ background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", padding: "14px", marginTop: "4px" }}>
          <AccessorForm form={form} setForm={setForm} clientUsers={clientUsers} vendors={vendors} staffUsers={staffUsers} contacts={contacts} credentials={credentials} />
          <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
            <button onClick={save} disabled={saving} style={{ fontSize: "13px", fontWeight: 500, padding: "6px 14px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>
              {saving ? "Saving..." : "Add"}
            </button>
            <button onClick={() => setShowAdd(false)} style={{ fontSize: "13px", padding: "6px 14px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)} style={{ fontSize: "13px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: "4px 0" }}>
          + Add accessor
        </button>
      )}
    </div>
  )
}

// ── Accessor form (shared for add / edit) ──────────────────────────────────────

function AccessorForm({ form, setForm, clientUsers, vendors, staffUsers, contacts, credentials }: {
  form: any
  setForm: (fn: (f: any) => any) => void
  clientUsers: { id: string; name: string; email: string | null }[]
  vendors: { id: string; name: string }[]
  staffUsers: { id: string; name: string; email: string | null }[]
  contacts: { id: string; name: string; role: string | null }[]
  credentials: { id: string; label: string }[]
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
      {/* Accessor type */}
      <div style={{ gridColumn: "1 / -1" }}>
        <label style={lbl}>Accessor type</label>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {Object.entries(ACCESSOR_TYPES).map(([k, v]) => (
            <button key={k} onClick={() => setForm(f => ({ ...f, accessorType: k, clientUserId: "", vendorId: "", staffUserId: "", contactId: "", thirdPartyName: "" }))}
              style={{ fontSize: "12px", padding: "4px 10px", borderRadius: "6px", border: `0.5px solid ${form.accessorType === k ? ACCESSOR_COLORS[k] : "var(--color-border-secondary)"}`, background: form.accessorType === k ? ACCESSOR_COLORS[k] + "22" : "transparent", color: form.accessorType === k ? ACCESSOR_COLORS[k] : "var(--color-text-secondary)", cursor: "pointer", fontWeight: form.accessorType === k ? 600 : 400 }}>
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Identity picker */}
      {form.accessorType === "CLIENT_USER" && clientUsers.length > 0 && (
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={lbl}>Client user</label>
          <select value={form.clientUserId || ""} onChange={e => setForm(f => ({ ...f, clientUserId: e.target.value }))} style={inp}>
            <option value="">Select user…</option>
            {clientUsers.map(u => <option key={u.id} value={u.id}>{u.name}{u.email ? ` (${u.email})` : ""}</option>)}
          </select>
        </div>
      )}
      {form.accessorType === "VENDOR" && vendors.length > 0 && (
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={lbl}>Vendor</label>
          <select value={form.vendorId || ""} onChange={e => setForm(f => ({ ...f, vendorId: e.target.value }))} style={inp}>
            <option value="">Select vendor…</option>
            {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
      )}
      {form.accessorType === "STAFF_USER" && staffUsers.length > 0 && (
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={lbl}>PCC tech</label>
          <select value={form.staffUserId || ""} onChange={e => setForm(f => ({ ...f, staffUserId: e.target.value }))} style={inp}>
            <option value="">Select tech…</option>
            {staffUsers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}
      {form.accessorType === "CONTACT" && contacts.length > 0 && (
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={lbl}>Contact</label>
          <select value={form.contactId || ""} onChange={e => setForm(f => ({ ...f, contactId: e.target.value }))} style={inp}>
            <option value="">Select contact…</option>
            {contacts.map(c => <option key={c.id} value={c.id}>{c.name}{c.role ? ` — ${c.role}` : ""}</option>)}
          </select>
        </div>
      )}
      {form.accessorType === "THIRD_PARTY" && (
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={lbl}>Name / description</label>
          <input value={form.thirdPartyName || ""} onChange={e => setForm(f => ({ ...f, thirdPartyName: e.target.value }))} placeholder="e.g. Ricoh copier tech" style={inp} />
        </div>
      )}

      {/* Credential */}
      {credentials.length > 0 && (
        <div>
          <label style={lbl}>Their VPN credential</label>
          <select value={form.credentialId || ""} onChange={e => setForm(f => ({ ...f, credentialId: e.target.value || null }))} style={inp}>
            <option value="">None</option>
            {credentials.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
      )}

      {/* Access scope */}
      <div>
        <label style={lbl}>Access scope</label>
        <input value={form.accessScope || ""} onChange={e => setForm(f => ({ ...f, accessScope: e.target.value }))} placeholder="Full network / 192.168.10.0/24 only" style={inp} />
      </div>

      {/* Cert expiry */}
      <div>
        <label style={lbl}>Cert / key expiry</label>
        <input type="date" value={form.certExpiry || ""} onChange={e => setForm(f => ({ ...f, certExpiry: e.target.value }))} style={inp} />
      </div>

      {/* MFA + active */}
      <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", cursor: "pointer" }}>
          <input type="checkbox" checked={!!form.mfaEnabled} onChange={e => setForm(f => ({ ...f, mfaEnabled: e.target.checked }))} />
          MFA enabled
        </label>
        {form.isActive !== undefined && (
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", cursor: "pointer" }}>
            <input type="checkbox" checked={!!form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} />
            Active
          </label>
        )}
      </div>

      {/* Notes */}
      <div style={{ gridColumn: "1 / -1" }}>
        <label style={lbl}>Notes</label>
        <input value={form.notes || ""} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={inp} />
      </div>
    </div>
  )
}
