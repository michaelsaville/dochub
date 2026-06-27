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
  person: { id: string; name: string; email: string | null } | null
  asset: { id: string; name: string; friendlyName: string | null } | null
  credential: { id: string; label: string } | null
  voicemailCred: { id: string; label: string } | null
}

type SipDid = {
  id: string
  number: string
  designation: string | null
  extensionId: string | null
  notes: string | null
  extension: { id: string; extension: string; displayName: string } | null
}

type SipTrunk = {
  id: string
  vendorId: string | null
  carrier: string
  accountNumber: string | null
  supportPhone: string | null
  notes: string | null
  vendor: { id: string; name: string; supportPhone: string | null } | null
  dids: SipDid[]
}

type PotsNumber = {
  id: string
  number: string
  designation: string | null
  port: string | null
  extensionId: string | null
  notes: string | null
  extension: { id: string; extension: string; displayName: string } | null
}

type PotsLine = {
  id: string
  vendorId: string | null
  carrier: string
  accountNumber: string | null
  supportPhone: string | null
  circuitId: string | null
  notes: string | null
  isActive: boolean
  vendor: { id: string; name: string; supportPhone: string | null } | null
  numbers: PotsNumber[]
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
  potsLines: PotsLine[]
}

// ── DID reconciliation ──────────────────────────────────────────────────────
// PhoneExtension.did is a free-text convenience copy. The canonical routing
// lives on SipDid.extensionId / PotsNumber.extensionId, so we derive the real
// routed numbers from the trunk/POTS records and treat .did as a fallback we
// reconcile against (show a matches/link chip) rather than a second source.
type RoutedNumber = { number: string; designation: string | null; source: string; kind: "SIP" | "POTS" }

const onlyDigits = (s: string) => s.replace(/\D/g, "")

function didMatches(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b) return false
  const da = onlyDigits(a), db = onlyDigits(b)
  if (!da || !db) return false
  if (da === db) return true
  return da.length >= 10 && db.length >= 10 && da.slice(-10) === db.slice(-10)
}

function routedNumbersFor(system: PhoneSystem, extId: string): RoutedNumber[] {
  const out: RoutedNumber[] = []
  for (const t of system.sipTrunks || [])
    for (const d of t.dids) if (d.extensionId === extId) out.push({ number: d.number, designation: d.designation, source: t.carrier, kind: "SIP" })
  for (const l of system.potsLines || [])
    for (const n of l.numbers) if (n.extensionId === extId) out.push({ number: n.number, designation: n.designation, source: l.carrier, kind: "POTS" })
  return out
}

type Props = {
  systems: PhoneSystem[]
  assets: { id: string; name: string; friendlyName: string | null; category: string; managementUrl?: string | null; ipAddress?: string | null }[]
  people: { id: string; name: string; email: string | null }[]
  credentials: { id: string; label: string }[]
  vendors: { id: string; name: string; supportPhone: string | null }[]
  clientId: string
  onSystemsChange: (systems: PhoneSystem[]) => void
}

const emptySystem = { name: "", type: "GRANDSTREAM_UCM", assetId: "", credentialId: "", sipDomain: "", managementUrl: "", notes: "" }
const emptyExt = { extension: "", displayName: "", type: "USER", personId: "", assetId: "", credentialId: "", voicemailCredId: "", did: "", voicemailEnabled: false, notes: "" }

export default function PhonePanel({ systems, assets, people, credentials, vendors, clientId, onSystemsChange }: Props) {
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
    setExtForm({ extension: e.extension, displayName: e.displayName, type: e.type, personId: e.person?.id || "", assetId: e.asset?.id || "", credentialId: e.credential?.id || "", voicemailCredId: e.voicemailCred?.id || "", did: e.did || "", voicemailEnabled: e.voicemailEnabled, notes: e.notes || "" })
    setEditingExtId(e.id)
  }

  // ── SIP Trunks ────────────────────────────────────────────────────────────

  const [addingTrunkFor, setAddingTrunkFor] = useState<string | null>(null)
  const [editingTrunkId, setEditingTrunkId] = useState<string | null>(null)
  const [expandedTrunkId, setExpandedTrunkId] = useState<string | null>(null)
  const emptyTrunk = { vendorId: "", carrier: "", accountNumber: "", supportPhone: "", notes: "" }
  const [trunkForm, setTrunkForm] = useState({ ...emptyTrunk })
  const [addingDidFor, setAddingDidFor] = useState<string | null>(null)
  const emptyDid = { number: "", designation: "", extensionId: "", notes: "" }
  const [didForm, setDidForm] = useState({ ...emptyDid })

  async function addTrunk(systemId: string) {
    setError(""); setSaving(true)
    try {
      const res = await fetch(`/api/phone-systems/${systemId}/sip-trunks`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(trunkForm),
      })
      if (!res.ok) { setError((await res.json()).error || "Failed"); return }
      const created = await res.json()
      onSystemsChange(systems.map(s => s.id === systemId ? { ...s, sipTrunks: [...(s.sipTrunks || []), created].sort((a, b) => a.carrier.localeCompare(b.carrier)) } : s))
      setAddingTrunkFor(null); setTrunkForm({ ...emptyTrunk })
    } finally { setSaving(false) }
  }

  async function updateTrunk(trunkId: string, systemId: string) {
    setError(""); setSaving(true)
    try {
      const res = await fetch(`/api/sip-trunks/${trunkId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
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

  async function addDid(trunkId: string, systemId: string) {
    setError(""); setSaving(true)
    try {
      const res = await fetch(`/api/sip-trunks/${trunkId}/dids`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(didForm),
      })
      if (!res.ok) { setError((await res.json()).error || "Failed"); return }
      const created = await res.json()
      onSystemsChange(systems.map(s => s.id === systemId ? { ...s, sipTrunks: s.sipTrunks.map(t => t.id === trunkId ? { ...t, dids: [...t.dids, created] } : t) } : s))
      setAddingDidFor(null); setDidForm({ ...emptyDid })
    } finally { setSaving(false) }
  }

  async function deleteDid(didId: string, trunkId: string, systemId: string) {
    const res = await fetch(`/api/sip-trunks/${trunkId}/dids/${didId}`, { method: "DELETE" })
    if (res.ok) onSystemsChange(systems.map(s => s.id === systemId ? { ...s, sipTrunks: s.sipTrunks.map(t => t.id === trunkId ? { ...t, dids: t.dids.filter(d => d.id !== didId) } : t) } : s))
  }

  function TrunkForm({ onSubmit, onCancel }: { onSubmit: () => void; onCancel: () => void }) {
    const selectedVendor = vendors.find(v => v.id === trunkForm.vendorId)
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", padding: "12px", background: "var(--color-background-primary)", borderRadius: "7px", border: "0.5px solid var(--color-border-secondary)", marginTop: "8px" }}>
        {vendors.length > 0 && (
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={lbl}>Provider (from vendor list)</label>
            <select style={inp} value={trunkForm.vendorId} onChange={e => {
              const v = vendors.find(v => v.id === e.target.value)
              setTrunkForm(f => ({ ...f, vendorId: e.target.value, carrier: v?.name || f.carrier, supportPhone: v?.supportPhone || f.supportPhone }))
            }}>
              <option value="">— select vendor or enter manually below —</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label style={lbl}>Carrier name *</label>
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
        <div style={{ gridColumn: "1 / -1" }}>
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

  // ── POTS Lines ────────────────────────────────────────────────────────────

  const [addingPotsFor, setAddingPotsFor] = useState<string | null>(null)
  const [editingPotsId, setEditingPotsId] = useState<string | null>(null)
  const [expandedPotsId, setExpandedPotsId] = useState<string | null>(null)
  const emptyPots = { vendorId: "", carrier: "", accountNumber: "", supportPhone: "", circuitId: "", notes: "" }
  const [potsForm, setPotsForm] = useState({ ...emptyPots })
  const [addingPotsNumFor, setAddingPotsNumFor] = useState<string | null>(null)
  const emptyPotsNum = { number: "", designation: "", port: "", extensionId: "", notes: "" }
  const [potsNumForm, setPotsNumForm] = useState({ ...emptyPotsNum })

  async function addPotsLine(systemId: string) {
    setError(""); setSaving(true)
    try {
      const res = await fetch(`/api/phone-systems/${systemId}/pots-lines`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(potsForm),
      })
      if (!res.ok) { setError((await res.json()).error || "Failed"); return }
      const created = await res.json()
      onSystemsChange(systems.map(s => s.id === systemId ? { ...s, potsLines: [...(s.potsLines || []), created] } : s))
      setAddingPotsFor(null); setPotsForm({ ...emptyPots })
    } finally { setSaving(false) }
  }

  async function updatePotsLine(lineId: string, systemId: string) {
    setError(""); setSaving(true)
    try {
      const res = await fetch(`/api/pots-lines/${lineId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(potsForm),
      })
      if (!res.ok) { setError((await res.json()).error || "Failed"); return }
      const updated = await res.json()
      onSystemsChange(systems.map(s => s.id === systemId ? { ...s, potsLines: s.potsLines.map(l => l.id === lineId ? updated : l) } : s))
      setEditingPotsId(null)
    } finally { setSaving(false) }
  }

  async function deletePotsLine(lineId: string, systemId: string) {
    if (!confirm("Delete this POTS line?")) return
    const res = await fetch(`/api/pots-lines/${lineId}`, { method: "DELETE" })
    if (res.ok) onSystemsChange(systems.map(s => s.id === systemId ? { ...s, potsLines: s.potsLines.filter(l => l.id !== lineId) } : s))
  }

  async function addPotsNumber(lineId: string, systemId: string) {
    setError(""); setSaving(true)
    try {
      const res = await fetch(`/api/pots-lines/${lineId}/numbers`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(potsNumForm),
      })
      if (!res.ok) { setError((await res.json()).error || "Failed"); return }
      const created = await res.json()
      onSystemsChange(systems.map(s => s.id === systemId ? { ...s, potsLines: s.potsLines.map(l => l.id === lineId ? { ...l, numbers: [...l.numbers, created] } : l) } : s))
      setAddingPotsNumFor(null); setPotsNumForm({ ...emptyPotsNum })
    } finally { setSaving(false) }
  }

  async function deletePotsNumber(numberId: string, lineId: string, systemId: string) {
    const res = await fetch(`/api/pots-lines/${lineId}/numbers/${numberId}`, { method: "DELETE" })
    if (res.ok) onSystemsChange(systems.map(s => s.id === systemId ? { ...s, potsLines: s.potsLines.map(l => l.id === lineId ? { ...l, numbers: l.numbers.filter(n => n.id !== numberId) } : l) } : s))
  }

  function PotsForm({ onSubmit, onCancel }: { onSubmit: () => void; onCancel: () => void }) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", padding: "12px", background: "var(--color-background-primary)", borderRadius: "7px", border: "0.5px solid var(--color-border-secondary)", marginTop: "8px" }}>
        {vendors.length > 0 && (
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={lbl}>Provider (from vendor list)</label>
            <select style={inp} value={potsForm.vendorId} onChange={e => {
              const v = vendors.find(v => v.id === e.target.value)
              setPotsForm(f => ({ ...f, vendorId: e.target.value, carrier: v?.name || f.carrier, supportPhone: v?.supportPhone || f.supportPhone }))
            }}>
              <option value="">— select vendor or enter manually below —</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label style={lbl}>Carrier name *</label>
          <input style={inp} value={potsForm.carrier} onChange={e => setPotsForm(f => ({ ...f, carrier: e.target.value }))} placeholder="AT&T, Lumen, Windstream…" />
        </div>
        <div>
          <label style={lbl}>Account Number</label>
          <input style={inp} value={potsForm.accountNumber} onChange={e => setPotsForm(f => ({ ...f, accountNumber: e.target.value }))} />
        </div>
        <div>
          <label style={lbl}>Support Phone</label>
          <input style={inp} value={potsForm.supportPhone} onChange={e => setPotsForm(f => ({ ...f, supportPhone: e.target.value }))} placeholder="1-800-…" />
        </div>
        <div>
          <label style={lbl}>Circuit / Billing ID</label>
          <input style={inp} value={potsForm.circuitId} onChange={e => setPotsForm(f => ({ ...f, circuitId: e.target.value }))} placeholder="Circuit number from carrier" />
        </div>
        <div style={{ gridColumn: "2 / -1" }}>
          <label style={lbl}>Notes</label>
          <input style={inp} value={potsForm.notes} onChange={e => setPotsForm(f => ({ ...f, notes: e.target.value }))} />
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
            <select style={inp} value={systemForm.assetId} onChange={e => {
              const a = assets.find(x => x.id === e.target.value)
              // Linking the PBX asset fills mgmt URL + system name from it (blank-only).
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

  function ExtForm({ onSubmit, onCancel, routed = [] }: { onSubmit: () => void; onCancel: () => void; routed?: RoutedNumber[] }) {
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
            {routed.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "5px", alignItems: "center" }}>
                <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>Routed:</span>
                {routed.map((r, i) => {
                  const sel = didMatches(r.number, extForm.did)
                  return (
                    <button key={i} type="button"
                      onClick={() => setExtForm(f => ({ ...f, did: r.number }))}
                      title={`${r.kind} · ${r.source}${r.designation ? ` · ${r.designation}` : ""} — click to use as DID`}
                      style={{ fontSize: "11px", padding: "1px 7px", borderRadius: "8px", cursor: "pointer", fontVariantNumeric: "tabular-nums",
                        background: sel ? "#10b98122" : "#06b6d422", color: sel ? "#10b981" : "#06b6d4",
                        border: `1px solid ${sel ? "#10b98144" : "#06b6d444"}` }}>
                      {sel ? "✓ " : "+ "}{r.number}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          <div>
            <label style={lbl}>Person</label>
            <select style={inp} value={extForm.personId} onChange={e => {
              const pid = e.target.value
              const p = people.find(x => x.id === pid)
              // Picking the extension's owner fills the display name from their
              // name when it's blank (ring groups/IVR have no person, so keep editable).
              setExtForm(f => ({ ...f, personId: pid, displayName: f.displayName || (p?.name ?? "") }))
            }}>
              <option value="">— None —</option>
              {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
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
            <CredentialPicker
              clientId={clientId}
              label="SIP Credential"
              value={extForm.credentialId}
              onChange={v => setExtForm(f => ({ ...f, credentialId: v }))}
              credentials={credentials}
              prefillLabel={extForm.extension ? `Ext ${extForm.extension} SIP` : ""}
            />
          </div>
          <div>
            <CredentialPicker
              clientId={clientId}
              label="Voicemail PIN Credential"
              value={extForm.voicemailCredId}
              onChange={v => setExtForm(f => ({ ...f, voicemailCredId: v }))}
              credentials={credentials}
              prefillLabel={extForm.extension ? `Ext ${extForm.extension} voicemail` : ""}
            />
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
          {SystemForm({ onSubmit: saveSystem, onCancel: () => { setShowAddSystem(false); setError("") } })}
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
                {system.asset && <a href={`/assets/${system.asset.id}`} style={{ fontSize: "12px", color: "var(--color-accent)", textDecoration: "none" }} onClick={e => e.stopPropagation()}>Host: {assetLabel(system.asset)}</a>}
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
              {SystemForm({ onSubmit: () => updateSystem(system.id), onCancel: () => { setEditingSystemId(null); setError("") } })}
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
              {system.extensions.map(ext => {
                const routed = routedNumbersFor(system, ext.id)
                const didLinked = routed.some(r => didMatches(r.number, ext.did))
                return (
                <div key={ext.id}>
                  {editingExtId === ext.id ? (
                    ExtForm({ onSubmit: () => updateExtension(ext.id, system.id), onCancel: () => { setEditingExtId(null); setError("") }, routed })
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
                        <div style={{ display: "flex", gap: "14px", marginTop: "4px", flexWrap: "wrap", alignItems: "center" }}>
                          {/* Canonical routed numbers, derived from SIP DIDs / POTS numbers */}
                          {routed.map((r, i) => (
                            <span key={i} style={{ fontSize: "11px", padding: "1px 7px", borderRadius: "8px", background: "#06b6d422", color: "#06b6d4", border: "1px solid #06b6d444", fontVariantNumeric: "tabular-nums" }}>
                              → {r.number}{r.designation ? ` · ${r.designation}` : ""} <span style={{ opacity: 0.7 }}>({r.kind}·{r.source})</span>
                            </span>
                          ))}
                          {ext.did && (
                            <span style={{ fontSize: "12px", color: "var(--color-text-secondary)", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                              DID: {ext.did}
                              {didLinked ? (
                                <span style={{ fontSize: "10px", padding: "1px 6px", borderRadius: "8px", background: "#10b98122", color: "#10b981", border: "1px solid #10b98144" }}>✓ matches routing</span>
                              ) : routed.length > 0 ? (
                                <span style={{ fontSize: "10px", padding: "1px 6px", borderRadius: "8px", background: "#f59e0b22", color: "#f59e0b", border: "1px solid #f59e0b44" }}>⚠ not in routed numbers</span>
                              ) : (
                                <span style={{ fontSize: "10px", padding: "1px 6px", borderRadius: "8px", background: "#f59e0b22", color: "#f59e0b", border: "1px solid #f59e0b44" }}>manual — no trunk/POTS link</span>
                              )}
                            </span>
                          )}
                          {!ext.did && routed.length > 0 && (
                            <span style={{ fontSize: "10px", padding: "1px 6px", borderRadius: "8px", background: "#10b98122", color: "#10b981", border: "1px solid #10b98144" }}>routed via trunk/POTS</span>
                          )}
                          {ext.person && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>Person: {ext.person.name}</span>}
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
              ) })}

              {/* Add extension form */}
              {addingExtFor === system.id && (
                ExtForm({ onSubmit: () => addExtension(system.id), onCancel: () => { setAddingExtFor(null); setError("") } })
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
                  <div key={trunk.id} style={{ marginBottom: "8px" }}>
                    {editingTrunkId === trunk.id ? (
                      TrunkForm({ onSubmit: () => updateTrunk(trunk.id, system.id), onCancel: () => { setEditingTrunkId(null); setError("") } })
                    ) : (
                      <div style={{ borderRadius: "7px", background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-secondary)" }}>
                        {/* Trunk header row */}
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "8px 12px", gap: "10px" }}>
                          <div style={{ flex: 1, cursor: "pointer" }} onClick={() => setExpandedTrunkId(expandedTrunkId === trunk.id ? null : trunk.id)}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                              <span style={{ fontSize: "13px", fontWeight: 600 }}>{trunk.carrier}</span>
                              {trunk.vendor && (
                                <span style={{ fontSize: "11px", padding: "1px 7px", borderRadius: "8px", background: "#8b5cf622", color: "#8b5cf6", border: "1px solid #8b5cf644" }}>vendor linked</span>
                              )}
                              {trunk.accountNumber && <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>Acct: {trunk.accountNumber}</span>}
                              <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>{trunk.dids.length} DID{trunk.dids.length !== 1 ? "s" : ""}</span>
                            </div>
                            <div style={{ display: "flex", gap: "14px", marginTop: "3px", flexWrap: "wrap" }}>
                              {trunk.supportPhone && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>Support: {trunk.supportPhone}</span>}
                              {trunk.notes && <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>{trunk.notes}</span>}
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                            <button style={btn("ghost")} onClick={() => { setTrunkForm({ vendorId: trunk.vendorId || "", carrier: trunk.carrier, accountNumber: trunk.accountNumber || "", supportPhone: trunk.supportPhone || "", notes: trunk.notes || "" }); setEditingTrunkId(trunk.id) }}>Edit</button>
                            <button style={btn("danger")} onClick={() => deleteTrunk(trunk.id, system.id)}>Del</button>
                          </div>
                        </div>

                        {/* DID list (expanded) */}
                        {expandedTrunkId === trunk.id && (
                          <div style={{ padding: "0 12px 12px", borderTop: "0.5px solid var(--color-border-secondary)" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "8px 0 6px" }}>
                              <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-text-muted)" }}>DID Numbers</span>
                              {addingDidFor !== trunk.id && (
                                <button style={{ ...btn("ghost"), fontSize: "12px", padding: "4px 10px" }} onClick={() => { setAddingDidFor(trunk.id); setDidForm({ ...emptyDid }) }}>+ Add DID</button>
                              )}
                            </div>
                            {trunk.dids.length === 0 && addingDidFor !== trunk.id && (
                              <div style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>No DIDs listed.</div>
                            )}
                            {trunk.dids.map(did => (
                              <div key={did.id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "5px 8px", borderRadius: "6px", background: "var(--color-background-secondary)", marginBottom: "4px" }}>
                                <span style={{ fontSize: "13px", fontVariantNumeric: "tabular-nums", fontWeight: 500, minWidth: "130px" }}>{did.number}</span>
                                {did.designation && (
                                  <span style={{ fontSize: "11px", padding: "1px 7px", borderRadius: "8px", background: "#06b6d422", color: "#06b6d4", border: "1px solid #06b6d444" }}>{did.designation}</span>
                                )}
                                {did.extension && (
                                  <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>→ Ext {did.extension.extension} {did.extension.displayName}</span>
                                )}
                                {did.notes && <span style={{ fontSize: "11px", color: "var(--color-text-muted)", marginLeft: "auto" }}>{did.notes}</span>}
                                <button style={{ ...btn("danger"), marginLeft: "auto", fontSize: "11px", padding: "3px 8px" }} onClick={() => deleteDid(did.id, trunk.id, system.id)}>Del</button>
                              </div>
                            ))}
                            {addingDidFor === trunk.id && (
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", padding: "10px", background: "var(--color-background-secondary)", borderRadius: "7px", border: "0.5px solid var(--color-border-secondary)", marginTop: "6px" }}>
                                <div>
                                  <label style={lbl}>Number *</label>
                                  <input style={inp} value={didForm.number} onChange={e => setDidForm(f => ({ ...f, number: e.target.value }))} placeholder="+15551234567" />
                                </div>
                                <div>
                                  <label style={lbl}>Designation</label>
                                  <input style={inp} value={didForm.designation} onChange={e => setDidForm(f => ({ ...f, designation: e.target.value }))} placeholder="Line 1, Fax, Main…" />
                                </div>
                                <div>
                                  <label style={lbl}>Routed to Extension</label>
                                  <select style={inp} value={didForm.extensionId} onChange={e => setDidForm(f => ({ ...f, extensionId: e.target.value }))}>
                                    <option value="">— None —</option>
                                    {system.extensions.map(e => <option key={e.id} value={e.id}>{e.extension} – {e.displayName}</option>)}
                                  </select>
                                </div>
                                <div style={{ gridColumn: "1 / -1" }}>
                                  <label style={lbl}>Notes</label>
                                  <input style={inp} value={didForm.notes} onChange={e => setDidForm(f => ({ ...f, notes: e.target.value }))} />
                                </div>
                                {error && <div style={{ gridColumn: "1 / -1", color: "#ef4444", fontSize: "13px" }}>{error}</div>}
                                <div style={{ gridColumn: "1 / -1", display: "flex", gap: "8px" }}>
                                  <button style={btn("primary")} onClick={() => addDid(trunk.id, system.id)} disabled={saving}>{saving ? "Saving…" : "Add DID"}</button>
                                  <button style={btn("ghost")} onClick={() => { setAddingDidFor(null); setError("") }}>Cancel</button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {addingTrunkFor === system.id && (
                  TrunkForm({ onSubmit: () => addTrunk(system.id), onCancel: () => { setAddingTrunkFor(null); setError("") } })
                )}
              </div>

              {/* POTS Lines section */}
              <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "0.5px solid var(--color-border-secondary)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text-secondary)" }}>POTS Lines</span>
                  {addingPotsFor !== system.id && (
                    <button style={btn("ghost")} onClick={() => { setAddingPotsFor(system.id); setPotsForm({ ...emptyPots }) }}>+ Add POTS Line</button>
                  )}
                </div>
                {(system.potsLines?.length ?? 0) === 0 && addingPotsFor !== system.id && (
                  <div style={{ fontSize: "13px", color: "var(--color-text-muted)" }}>No POTS lines documented yet.</div>
                )}
                {system.potsLines?.map(line => (
                  <div key={line.id} style={{ marginBottom: "8px" }}>
                    {editingPotsId === line.id ? (
                      PotsForm({ onSubmit: () => updatePotsLine(line.id, system.id), onCancel: () => { setEditingPotsId(null); setError("") } })
                    ) : (
                      <div style={{ borderRadius: "7px", background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-secondary)" }}>
                        {/* Line header row */}
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "8px 12px", gap: "10px" }}>
                          <div style={{ flex: 1, cursor: "pointer" }} onClick={() => setExpandedPotsId(expandedPotsId === line.id ? null : line.id)}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                              <span style={{ fontSize: "13px", fontWeight: 600 }}>{line.carrier}</span>
                              {line.vendor && (
                                <span style={{ fontSize: "11px", padding: "1px 7px", borderRadius: "8px", background: "#8b5cf622", color: "#8b5cf6", border: "1px solid #8b5cf644" }}>vendor linked</span>
                              )}
                              {!line.isActive && <span style={{ fontSize: "11px", color: "#ef4444" }}>Inactive</span>}
                              {line.accountNumber && <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>Acct: {line.accountNumber}</span>}
                              <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>{line.numbers.length} number{line.numbers.length !== 1 ? "s" : ""}</span>
                            </div>
                            <div style={{ display: "flex", gap: "14px", marginTop: "3px", flexWrap: "wrap" }}>
                              {line.supportPhone && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>Support: {line.supportPhone}</span>}
                              {line.circuitId && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>Circuit: {line.circuitId}</span>}
                              {line.notes && <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>{line.notes}</span>}
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                            <button style={btn("ghost")} onClick={() => { setPotsForm({ vendorId: line.vendorId || "", carrier: line.carrier, accountNumber: line.accountNumber || "", supportPhone: line.supportPhone || "", circuitId: line.circuitId || "", notes: line.notes || "" }); setEditingPotsId(line.id) }}>Edit</button>
                            <button style={btn("danger")} onClick={() => deletePotsLine(line.id, system.id)}>Del</button>
                          </div>
                        </div>

                        {/* Numbers list (expanded) */}
                        {expandedPotsId === line.id && (
                          <div style={{ padding: "0 12px 12px", borderTop: "0.5px solid var(--color-border-secondary)" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "8px 0 6px" }}>
                              <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-text-muted)" }}>Phone Numbers</span>
                              {addingPotsNumFor !== line.id && (
                                <button style={{ ...btn("ghost"), fontSize: "12px", padding: "4px 10px" }} onClick={() => { setAddingPotsNumFor(line.id); setPotsNumForm({ ...emptyPotsNum }) }}>+ Add Number</button>
                              )}
                            </div>
                            {line.numbers.length === 0 && addingPotsNumFor !== line.id && (
                              <div style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>No numbers listed.</div>
                            )}
                            {line.numbers.map(num => (
                              <div key={num.id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "5px 8px", borderRadius: "6px", background: "var(--color-background-secondary)", marginBottom: "4px" }}>
                                <span style={{ fontSize: "13px", fontVariantNumeric: "tabular-nums", fontWeight: 500, minWidth: "130px" }}>{num.number}</span>
                                {num.designation && (
                                  <span style={{ fontSize: "11px", padding: "1px 7px", borderRadius: "8px", background: "#10b98122", color: "#10b981", border: "1px solid #10b98144" }}>{num.designation}</span>
                                )}
                                {num.port && (
                                  <span style={{ fontSize: "11px", padding: "1px 7px", borderRadius: "8px", background: "#f59e0b22", color: "#f59e0b", border: "1px solid #f59e0b44" }}>FXS: {num.port}</span>
                                )}
                                {num.extension && (
                                  <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>→ Ext {num.extension.extension} {num.extension.displayName}</span>
                                )}
                                {num.notes && <span style={{ fontSize: "11px", color: "var(--color-text-muted)", marginLeft: "auto" }}>{num.notes}</span>}
                                <button style={{ ...btn("danger"), marginLeft: "auto", fontSize: "11px", padding: "3px 8px" }} onClick={() => deletePotsNumber(num.id, line.id, system.id)}>Del</button>
                              </div>
                            ))}
                            {addingPotsNumFor === line.id && (
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", padding: "10px", background: "var(--color-background-secondary)", borderRadius: "7px", border: "0.5px solid var(--color-border-secondary)", marginTop: "6px" }}>
                                <div>
                                  <label style={lbl}>Number *</label>
                                  <input style={inp} value={potsNumForm.number} onChange={e => setPotsNumForm(f => ({ ...f, number: e.target.value }))} placeholder="+15551234567" />
                                </div>
                                <div>
                                  <label style={lbl}>Designation</label>
                                  <input style={inp} value={potsNumForm.designation} onChange={e => setPotsNumForm(f => ({ ...f, designation: e.target.value }))} placeholder="Line 1, Line 2, Fax…" />
                                </div>
                                <div>
                                  <label style={lbl}>FXS Port</label>
                                  <input style={inp} value={potsNumForm.port} onChange={e => setPotsNumForm(f => ({ ...f, port: e.target.value }))} placeholder="FXS1, Port 3…" />
                                </div>
                                <div>
                                  <label style={lbl}>Routed to Extension</label>
                                  <select style={inp} value={potsNumForm.extensionId} onChange={e => setPotsNumForm(f => ({ ...f, extensionId: e.target.value }))}>
                                    <option value="">— None —</option>
                                    {system.extensions.map(e => <option key={e.id} value={e.id}>{e.extension} – {e.displayName}</option>)}
                                  </select>
                                </div>
                                <div style={{ gridColumn: "2 / -1" }}>
                                  <label style={lbl}>Notes</label>
                                  <input style={inp} value={potsNumForm.notes} onChange={e => setPotsNumForm(f => ({ ...f, notes: e.target.value }))} />
                                </div>
                                {error && <div style={{ gridColumn: "1 / -1", color: "#ef4444", fontSize: "13px" }}>{error}</div>}
                                <div style={{ gridColumn: "1 / -1", display: "flex", gap: "8px" }}>
                                  <button style={btn("primary")} onClick={() => addPotsNumber(line.id, system.id)} disabled={saving}>{saving ? "Saving…" : "Add Number"}</button>
                                  <button style={btn("ghost")} onClick={() => { setAddingPotsNumFor(null); setError("") }}>Cancel</button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {addingPotsFor === system.id && (
                  PotsForm({ onSubmit: () => addPotsLine(system.id), onCancel: () => { setAddingPotsFor(null); setError("") } })
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
