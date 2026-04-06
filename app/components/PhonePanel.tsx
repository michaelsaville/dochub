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
  GRANDSTREAM_UCM: "Grandstream UCM",
  FREEPBX: "FreePBX",
  THREE_CX: "3CX",
  HOSTED_VOIP: "Hosted VoIP",
  MITEL: "Mitel",
  AVAYA: "Avaya",
  CISCO: "Cisco",
  OTHER: "Other",
}

const EXT_TYPES: Record<string, string> = {
  USER: "User",
  RING_GROUP: "Ring Group",
  IVR: "IVR / Auto-Attendant",
  VOICEMAIL_ONLY: "Voicemail Only",
  FAX: "Fax",
  PAGING: "Paging",
  CONFERENCE: "Conference",
}

const EXT_COLORS: Record<string, string> = {
  USER: "#3b82f6",
  RING_GROUP: "#8b5cf6",
  IVR: "#f59e0b",
  VOICEMAIL_ONLY: "#6b7280",
  FAX: "#10b981",
  PAGING: "#ec4899",
  CONFERENCE: "#06b6d4",
}

type PhoneExtension = {
  id: string
  extension: string
  displayName: string
  type: string
  did: string | null
  voicemailEnabled: boolean
  isActive: boolean
  notes: string | null
  clientUser: { id: string; name: string; email: string | null } | null
  asset: { id: string; name: string; friendlyName: string | null } | null
  credential: { id: string; label: string } | null
  voicemailCred: { id: string; label: string } | null
}

type SipTrunk = {
  id: string
  carrier: string
  accountNumber: string | null
  supportPhone: string | null
  didRange: string | null
  notes: string | null
}

type PhoneSystem = {
  id: string
  name: string
  type: string
  sipDomain: string | null
  managementUrl: string | null
  isActive: boolean
  notes: string | null
  asset: { id: string; name: string; friendlyName: string | null } | null
  credential: { id: string; label: string } | null
  extensions: PhoneExtension[]
  sipTrunks: SipTrunk[]
}

type Props = {
  systems: PhoneSystem[]
  assets: { id: string; name: string; friendlyName: string | null; category: string }[]
  clientUsers: { id: string; name: string; email: string | null }[]
  credentials: { id: string; label: string }[]
  clientId: string
  onSystemsChange: (systems: PhoneSystem[]) => void
}

const emptySystem = { name: "", type: "GRANDSTREAM_UCM", assetId: "", credentialId: "", sipDomain: "", managementUrl: "", notes: "" }
const emptyExt = { extension: "", displayName: "", type: "USER", clientUserId: "", assetId: "", credentialId: "", voicemailCredId: "", did: "", voicemailEnabled: false, notes: "" }

export default function PhonePanel({ systems, assets, clientUsers, credentials, clientId, onSystemsChange }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showAddSystem, setShowAddSystem] = useState(false)
  const [addingExtFor, setAddingExtFor] = useState<string | null>(null)
  const [editingSystemId, setEditingSystemId] = useState<string | null>(null)
  const [editingExtId, setEditingExtId] = useState<string | null>(null)
  const [systemForm, setSystemForm] = useState({ ...emptySystem })
  const [extForm, setExtForm] = useState({ ...emptyExt })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  function assetLabel(a: { name: string; friendlyName: string | null }) {
    return a.friendlyName ? `${a.friendlyName} (${a.name})` : a.name
  }

  // ── Systems ────────────────────────────────────────────────────────────────

  async function saveSystem() {
    setError(""); setSaving(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/phone-systems`, {
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
      const res = await fetch(`/api/phone-systems/${id}`, {
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
    if (!confirm("Delete this phone system and all its extensions?")) return
    const res = await fetch(`/api/phone-systems/${id}`, { method: "DELETE" })
    if (res.ok) onSystemsChange(systems.filter(s => s.id !== id))
  }

  function startEditSystem(s: PhoneSystem) {
    setSystemForm({ name: s.name, type: s.type, assetId: s.asset?.id || "", credentialId: s.credential?.id || "", sipDomain: s.sipDomain || "", managementUrl: s.managementUrl || "", notes: s.notes || "" })
    setEditingSystemId(s.id)
  }

  // ── Extensions ────────────────────────────────────────────────────────────

  async function addExtension(systemId: string) {
    setError(""); setSaving(true)
    try {
      const res = await fetch(`/api/phone-systems/${systemId}/extensions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(extForm),
      })
      if (!res.ok) { setError((await res.json()).error || "Failed"); return }
      const created = await res.json()
      onSystemsChange(systems.map(s => s.id === systemId ? { ...s, extensions: [...s.extensions, created].sort((a, b) => a.extension.localeCompare(b.extension, undefined, { numeric: true })) } : s))
      setAddingExtFor(null)
      setExtForm({ ...emptyExt })
    } finally { setSaving(false) }
  }

  async function updateExtension(extId: string, systemId: string) {
    setError(""); setSaving(true)
    try {
      const res = await fetch(`/api/phone-extensions/${extId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(extForm),
      })
      if (!res.ok) { setError((await res.json()).error || "Failed"); return }
      const updated = await res.json()
      onSystemsChange(systems.map(s => s.id === systemId ? { ...s, extensions: s.extensions.map(e => e.id === extId ? updated : e) } : s))
      setEditingExtId(null)
    } finally { setSaving(false) }
  }

  async function deleteExtension(extId: string, systemId: string) {
    if (!confirm("Delete this extension?")) return
    const res = await fetch(`/api/phone-extensions/${extId}`, { method: "DELETE" })
    if (res.ok) onSystemsChange(systems.map(s => s.id === systemId ? { ...s, extensions: s.extensions.filter(e => e.id !== extId) } : s))
  }

  function startEditExt(e: PhoneExtension) {
    setExtForm({ extension: e.extension, displayName: e.displayName, type: e.type, clientUserId: e.clientUser?.id || "", assetId: e.asset?.id || "", credentialId: e.credential?.id || "", voicemailCredId: e.voicemailCred?.id || "", did: e.did || "", voicemailEnabled: e.voicemailEnabled, notes: e.notes || "" })
    setEditingExtId(e.id)
  }

  // ── SIP Trunks ────────────────────────────────────────────────────────────

  const [addingTrunkFor, setAddingTrunkFor] = useState<string | null>(null)
  const [editingTrunkId, setEditingTrunkId] = useState<string | null>(null)
  const emptyTrunk = { carrier: "", accountNumber: "", supportPhone: "", didRange: "", notes: "" }
  const [trunkForm, setTrunkForm] = useState({ ...emptyTrunk })

  async function addTrunk(systemId: string) {
    setError(""); setSaving(true)
    try {
      const res = await fetch(`/api/phone-systems/${systemId}/sip-trunks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(trunkForm),
      })
      if (!res.ok) { setError((await res.json()).error || "Failed"); return }
      const created = await res.json()
      onSystemsChange(systems.map(s => s.id === systemId ? { ...s, sipTrunks: [...(s.sipTrunks || []), created].sort((a, b) => a.carrier.localeCompare(b.carrier)) } : s))
      setAddingTrunkFor(null)
      setTrunkForm({ ...emptyTrunk })
    } finally { setSaving(false) }
  }

  async function updateTrunk(trunkId: string, systemId: string) {
    setError(""); setSaving(true)
    try {
      const res = await fetch(`/api/sip-trunks/${trunkId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(trunkForm),
      })
      if (!res.ok) { setError((await res.json()).error || "Failed"); return }
      const updated = await res.json()
      onSystemsChange(systems.map(s => s.id === systemId ? { ...s, sipTrunks: s.sipTrunks.map(t => t.id === trunkId ? updated : t) } : s))
      setEditingTrunkId(null)
    } finally { setSaving(false) }
  }

  async function deleteTrunk(trunkId: string, systemId: string) {
    if (!confirm("Delete this SIP trunk?")) return
    const res = await fetch(`/api/sip-trunks/${trunkId}`, { method: "DELETE" })
    if (res.ok) onSystemsChange(systems.map(s => s.id === systemId ? { ...s, sipTrunks: s.sipTrunks.filter(t => t.id !== trunkId) } : s))
  }

  function TrunkForm({ onSubmit, onCancel }: { onSubmit: () => void; onCancel: () => void }) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", padding: "12px", background: "var(--color-background-primary)", borderRadius: "7px", border: "0.5px solid var(--color-border-secondary)", marginTop: "8px" }}>
        <div>
          <label style={lbl}>Carrier / Provider *</label>
          <input style={inp} value={trunkForm.carrier} onChange={e => setTrunkForm(f => ({ ...f, carrier: e.target.value }))} placeholder="Twilio, VoIP.ms, Vonage…" />
        </div>
        <div>
          <label style={lbl}>Account Number</label>
          <input style={inp} value={trunkForm.accountNumber} onChange={e => setTrunkForm(f => ({ ...f, accountNumber: e.target.value }))} />
        </div>
        <div>
          <label style={lbl}>Support Phone</label>
          <input style={inp} value={trunkForm.supportPhone} onChange={e => setTrunkForm(f => ({ ...f, supportPhone: e.target.value }))} placeholder="1-800-…" />
        </div>
        <div style={{ gridColumn: "1 / 3" }}>
          <label style={lbl}>DID Range / Numbers</label>
          <input style={inp} value={trunkForm.didRange} onChange={e => setTrunkForm(f => ({ ...f, didRange: e.target.value }))} placeholder="304-555-0100 to 0199, or individual DIDs" />
        </div>
        <div>
          <label style={lbl}>Notes</label>
          <input style={inp} value={trunkForm.notes} onChange={e => setTrunkForm(f => ({ ...f, notes: e.target.value }))} />
        </div>
        {error && <div style={{ gridColumn: "1 / -1", color: "#ef4444", fontSize: "13px" }}>{error}</div>}
        <div style={{ gridColumn: "1 / -1", display: "flex", gap: "8px" }}>
          <button style={btn("primary")} onClick={onSubmit} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
          <button style={btn("ghost")} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    )
  }

  // ── System Form ───────────────────────────────────────────────────────────

  function SystemForm({ onSubmit, onCancel }: { onSubmit: () => void; onCancel: () => void }) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div>
            <label style={lbl}>Name *</label>
            <input style={inp} value={systemForm.name} onChange={e => setSystemForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Grandstream UCM6304" />
          </div>
          <div>
            <label style={lbl}>Type *</label>
            <select style={inp} value={systemForm.type} onChange={e => setSystemForm(f => ({ ...f, type: e.target.value }))}>
              {Object.entries(SYSTEM_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>SIP Domain / Realm</label>
            <input style={inp} value={systemForm.sipDomain} onChange={e => setSystemForm(f => ({ ...f, sipDomain: e.target.value }))} placeholder="e.g. pbx.client.local" />
          </div>
          <div>
            <label style={lbl}>Management URL</label>
            <input style={inp} value={systemForm.managementUrl} onChange={e => setSystemForm(f => ({ ...f, managementUrl: e.target.value }))} placeholder="https://192.168.1.100" />
          </div>
          <div>
            <label style={lbl}>PBX Asset</label>
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

  // ── Extension Form ────────────────────────────────────────────────────────

  function ExtForm({ onSubmit, onCancel }: { onSubmit: () => void; onCancel: () => void }) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "16px", background: "var(--color-background-primary)", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", marginTop: "12px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "120px 1fr 1fr", gap: "10px" }}>
          <div>
            <label style={lbl}>Extension *</label>
            <input style={inp} value={extForm.extension} onChange={e => setExtForm(f => ({ ...f, extension: e.target.value }))} placeholder="101" />
          </div>
          <div>
            <label style={lbl}>Display Name *</label>
            <input style={inp} value={extForm.displayName} onChange={e => setExtForm(f => ({ ...f, displayName: e.target.value }))} placeholder="Jane Smith" />
          </div>
          <div>
            <label style={lbl}>Type</label>
            <select style={inp} value={extForm.type} onChange={e => setExtForm(f => ({ ...f, type: e.target.value }))}>
              {Object.entries(EXT_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
          <div>
            <label style={lbl}>DID (Direct Dial)</label>
            <input style={inp} value={extForm.did} onChange={e => setExtForm(f => ({ ...f, did: e.target.value }))} placeholder="+15551234567" />
          </div>
          <div>
            <label style={lbl}>Client User</label>
            <select style={inp} value={extForm.clientUserId} onChange={e => setExtForm(f => ({ ...f, clientUserId: e.target.value }))}>
              <option value="">— None —</option>
              {clientUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Handset Asset</label>
            <select style={inp} value={extForm.assetId} onChange={e => setExtForm(f => ({ ...f, assetId: e.target.value }))}>
              <option value="">— None —</option>
              {assets.map(a => <option key={a.id} value={a.id}>{assetLabel(a)}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <div>
            <label style={lbl}>SIP Credential</label>
            <select style={inp} value={extForm.credentialId} onChange={e => setExtForm(f => ({ ...f, credentialId: e.target.value }))}>
              <option value="">— None —</option>
              {credentials.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Voicemail PIN Credential</label>
            <select style={inp} value={extForm.voicemailCredId} onChange={e => setExtForm(f => ({ ...f, voicemailCredId: e.target.value }))}>
              <option value="">— None —</option>
              {credentials.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <input type="checkbox" id="vmEnabled" checked={extForm.voicemailEnabled} onChange={e => setExtForm(f => ({ ...f, voicemailEnabled: e.target.checked }))} />
          <label htmlFor="vmEnabled" style={{ fontSize: "13px", color: "var(--color-text-secondary)", cursor: "pointer" }}>Voicemail enabled</label>
        </div>
        <div>
          <label style={lbl}>Notes</label>
          <input style={inp} value={extForm.notes} onChange={e => setExtForm(f => ({ ...f, notes: e.target.value }))} />
        </div>
        {error && <div style={{ color: "#ef4444", fontSize: "13px" }}>{error}</div>}
        <div style={{ display: "flex", gap: "8px" }}>
          <button style={btn("primary")} onClick={onSubmit} disabled={saving}>{saving ? "Saving…" : "Save Extension"}</button>
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
          <h2 style={{ fontSize: "16px", fontWeight: 600, margin: 0 }}>Phone Systems</h2>
          <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", margin: "4px 0 0" }}>PBX systems, extensions, handsets, SIP accounts, and voicemail</p>
        </div>
        {!showAddSystem && (
          <button style={btn("primary")} onClick={() => { setShowAddSystem(true); setSystemForm({ ...emptySystem }) }}>+ Add System</button>
        )}
      </div>

      {showAddSystem && (
        <div style={card}>
          <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "16px" }}>New Phone System</div>
          <SystemForm onSubmit={saveSystem} onCancel={() => { setShowAddSystem(false); setError("") }} />
        </div>
      )}

      {systems.length === 0 && !showAddSystem && (
        <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>No phone systems documented yet.</div>
      )}

      {systems.map(system => (
        <div key={system.id} style={card}>
          {/* System header */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
            <div style={{ flex: 1, cursor: "pointer" }} onClick={() => setExpandedId(expandedId === system.id ? null : system.id)}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "15px", fontWeight: 600 }}>{system.name}</span>
                <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "10px", background: "#3b82f622", color: "#3b82f6", border: "1px solid #3b82f644" }}>{SYSTEM_TYPES[system.type] || system.type}</span>
                <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>{system.extensions.length} extension{system.extensions.length !== 1 ? "s" : ""}</span>
                {!system.isActive && <span style={{ fontSize: "11px", color: "#ef4444" }}>Inactive</span>}
              </div>
              <div style={{ display: "flex", gap: "16px", marginTop: "6px", flexWrap: "wrap" }}>
                {system.sipDomain && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>SIP: {system.sipDomain}</span>}
                {system.asset && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>Host: {assetLabel(system.asset)}</span>}
                {system.credential && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>Cred: {system.credential.label}</span>}
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

          {/* Extensions list */}
          {expandedId === system.id && editingSystemId !== system.id && (
            <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "0.5px solid var(--color-border-secondary)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text-secondary)" }}>Extensions</span>
                {addingExtFor !== system.id && (
                  <button style={btn("ghost")} onClick={() => { setAddingExtFor(system.id); setExtForm({ ...emptyExt }) }}>+ Add Extension</button>
                )}
              </div>

              {system.extensions.length === 0 && addingExtFor !== system.id && (
                <div style={{ fontSize: "13px", color: "var(--color-text-muted)" }}>No extensions yet.</div>
              )}

              {/* Extension rows */}
              {system.extensions.map(ext => (
                <div key={ext.id}>
                  {editingExtId === ext.id ? (
                    <ExtForm onSubmit={() => updateExtension(ext.id, system.id)} onCancel={() => { setEditingExtId(null); setError("") }} />
                  ) : (
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "10px 12px", borderRadius: "7px", background: "var(--color-background-primary)", marginBottom: "6px", gap: "10px" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                          <span style={{ fontSize: "16px", fontWeight: 700, color: "var(--color-accent)", fontVariantNumeric: "tabular-nums", minWidth: "36px" }}>{ext.extension}</span>
                          <span style={{ fontSize: "14px", fontWeight: 500 }}>{ext.displayName}</span>
                          <span style={{ fontSize: "11px", padding: "1px 7px", borderRadius: "8px", background: EXT_COLORS[ext.type] + "22", color: EXT_COLORS[ext.type], border: `1px solid ${EXT_COLORS[ext.type]}44` }}>{EXT_TYPES[ext.type] || ext.type}</span>
                          {ext.voicemailEnabled && <span style={{ fontSize: "11px", color: "#10b981" }}>VM</span>}
                          {!ext.isActive && <span style={{ fontSize: "11px", color: "#ef4444" }}>Inactive</span>}
                        </div>
                        <div style={{ display: "flex", gap: "14px", marginTop: "4px", flexWrap: "wrap" }}>
                          {ext.did && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>DID: {ext.did}</span>}
                          {ext.clientUser && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>User: {ext.clientUser.name}</span>}
                          {ext.asset && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>Handset: {assetLabel(ext.asset)}</span>}
                          {ext.credential && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>SIP cred: {ext.credential.label}</span>}
                          {ext.voicemailCred && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>VM PIN: {ext.voicemailCred.label}</span>}
                          {ext.notes && <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>{ext.notes}</span>}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                        <button style={btn("ghost")} onClick={() => startEditExt(ext)}>Edit</button>
                        <button style={btn("danger")} onClick={() => deleteExtension(ext.id, system.id)}>Del</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Add extension form */}
              {addingExtFor === system.id && (
                <ExtForm onSubmit={() => addExtension(system.id)} onCancel={() => { setAddingExtFor(null); setError("") }} />
              )}

              {/* SIP Trunks section */}
              <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "0.5px solid var(--color-border-secondary)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text-secondary)" }}>SIP Trunks / Carrier</span>
                  {addingTrunkFor !== system.id && (
                    <button style={btn("ghost")} onClick={() => { setAddingTrunkFor(system.id); setTrunkForm({ ...emptyTrunk }) }}>+ Add Trunk</button>
                  )}
                </div>
                {(system.sipTrunks?.length ?? 0) === 0 && addingTrunkFor !== system.id && (
                  <div style={{ fontSize: "13px", color: "var(--color-text-muted)" }}>No SIP trunks documented yet.</div>
                )}
                {system.sipTrunks?.map(trunk => (
                  <div key={trunk.id}>
                    {editingTrunkId === trunk.id ? (
                      <TrunkForm onSubmit={() => updateTrunk(trunk.id, system.id)} onCancel={() => { setEditingTrunkId(null); setError("") }} />
                    ) : (
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "8px 12px", borderRadius: "7px", background: "var(--color-background-primary)", marginBottom: "6px", gap: "10px" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                            <span style={{ fontSize: "13px", fontWeight: 600 }}>{trunk.carrier}</span>
                            {trunk.accountNumber && <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>Acct: {trunk.accountNumber}</span>}
                          </div>
                          <div style={{ display: "flex", gap: "14px", marginTop: "3px", flexWrap: "wrap" }}>
                            {trunk.supportPhone && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>Support: {trunk.supportPhone}</span>}
                            {trunk.didRange && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>DIDs: {trunk.didRange}</span>}
                            {trunk.notes && <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>{trunk.notes}</span>}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                          <button style={btn("ghost")} onClick={() => { setTrunkForm({ carrier: trunk.carrier, accountNumber: trunk.accountNumber || "", supportPhone: trunk.supportPhone || "", didRange: trunk.didRange || "", notes: trunk.notes || "" }); setEditingTrunkId(trunk.id) }}>Edit</button>
                          <button style={btn("danger")} onClick={() => deleteTrunk(trunk.id, system.id)}>Del</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {addingTrunkFor === system.id && (
                  <TrunkForm onSubmit={() => addTrunk(system.id)} onCancel={() => { setAddingTrunkFor(null); setError("") }} />
                )}
              </div>

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
