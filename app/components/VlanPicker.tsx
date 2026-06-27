"use client"

import { useEffect, useState } from "react"

export type VlanOption = { id: string; vlanNumber: number; name: string; color?: string }

const fieldStyle: React.CSSProperties = { width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" }
const labelStyle: React.CSSProperties = { fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }

/**
 * Canonical VLAN reference picker. Loads the client's Vlan records and writes
 * the chosen Vlan.id back through onChange (the second arg is the full VLAN so
 * callers can also seed legacy free-text VLAN fields for display continuity).
 * Inline "+ New VLAN…" POSTs to /api/clients/[id]/vlans, mirroring the
 * asset-interface VLAN picker in app/assets/[id]/page.tsx.
 *
 * Defined at module scope (stable component identity) so its inputs are not
 * unmounted/remounted by the client page's 1s TOTP re-render tick.
 */
export default function VlanPicker({
  clientId, value, onChange, label = "VLAN",
}: {
  clientId: string
  value: string
  onChange: (vlanRefId: string, vlan: VlanOption | null) => void
  label?: string
}) {
  const [vlans, setVlans] = useState<VlanOption[]>([])
  const [showNew, setShowNew] = useState(false)
  const [newForm, setNewForm] = useState({ vlanNumber: "", name: "" })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    fetch(`/api/clients/${clientId}/vlans`)
      .then(r => (r.ok ? r.json() : []))
      .then(d => { if (active) setVlans(Array.isArray(d) ? d : []) })
      .catch(() => {})
    return () => { active = false }
  }, [clientId])

  async function createVlan() {
    if (!newForm.vlanNumber || !newForm.name.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/vlans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vlanNumber: Number(newForm.vlanNumber), name: newForm.name.trim() }),
      })
      if (res.ok) {
        const v: VlanOption = await res.json()
        setVlans(prev => [...prev, v].sort((a, b) => a.vlanNumber - b.vlanNumber))
        onChange(v.id, v)
        setShowNew(false)
        setNewForm({ vlanNumber: "", name: "" })
      } else {
        const e = await res.json().catch(() => ({}))
        alert(e.error || "Failed to create VLAN")
      }
    } finally { setSaving(false) }
  }

  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {showNew ? (
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <input type="number" value={newForm.vlanNumber} onChange={e => setNewForm(f => ({ ...f, vlanNumber: e.target.value }))} placeholder="VID" style={{ ...fieldStyle, width: "70px" }} />
          <input value={newForm.name} onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))} placeholder="Name (e.g. Servers)" style={{ ...fieldStyle, flex: 1 }} />
          <button type="button" onClick={createVlan} disabled={saving || !newForm.vlanNumber || !newForm.name.trim()} style={{ fontSize: "13px", padding: "8px 12px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer", whiteSpace: "nowrap" }}>{saving ? "…" : "Add"}</button>
          <button type="button" onClick={() => setShowNew(false)} style={{ fontSize: "13px", padding: "8px 10px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>✕</button>
        </div>
      ) : (
        <select
          value={value}
          onChange={e => {
            if (e.target.value === "__new__") { setShowNew(true); return }
            const v = vlans.find(x => x.id === e.target.value) || null
            onChange(e.target.value, v)
          }}
          style={fieldStyle}
        >
          <option value="">— none —</option>
          {vlans.map(v => <option key={v.id} value={v.id}>VLAN {v.vlanNumber} – {v.name}</option>)}
          <option value="__new__">+ New VLAN…</option>
        </select>
      )}
    </div>
  )
}
