"use client"

import { useEffect, useState } from "react"

type Seat = {
  id: string
  notes: string | null
  person: { id: string; name: string; email: string | null } | null
  asset: { id: string; name: string; friendlyName: string | null } | null
}

/**
 * Per-license seat assignments. The assigned count is DERIVED from the rows
 * here (length), not a hand-typed integer — so "X / Y seats" can't drift.
 * Lazy-loads on expand; lets a tech assign a person or asset to a seat.
 */
export default function LicenseSeats({
  licenseId, totalSeats, initialAssigned, people, assets,
}: {
  licenseId: string
  totalSeats: number | null
  initialAssigned: number
  people: { id: string; name: string; email?: string | null }[]
  assets: { id: string; name: string; friendlyName: string | null }[]
}) {
  const [open, setOpen] = useState(false)
  const [seats, setSeats] = useState<Seat[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ personId: "", assetId: "", notes: "" })
  const [saving, setSaving] = useState(false)

  const assigned = seats ? seats.length : initialAssigned
  const free = totalSeats != null ? totalSeats - assigned : null
  const over = totalSeats != null && assigned > totalSeats

  useEffect(() => {
    if (!open || seats) return
    setLoading(true)
    fetch(`/api/licenses/${licenseId}/seats`)
      .then(r => r.ok ? r.json() : [])
      .then((d: Seat[]) => setSeats(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false))
  }, [open, licenseId, seats])

  async function addSeat() {
    if (!form.personId && !form.assetId && !form.notes.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/licenses/${licenseId}/seats`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        const seat = await res.json()
        setSeats(prev => [...(prev ?? []), seat])
        setForm({ personId: "", assetId: "", notes: "" })
        setAdding(false)
      }
    } finally { setSaving(false) }
  }

  async function removeSeat(seatId: string) {
    const res = await fetch(`/api/licenses/${licenseId}/seats/${seatId}`, { method: "DELETE" })
    if (res.ok) setSeats(prev => (prev ?? []).filter(s => s.id !== seatId))
  }

  const inp = { padding: "5px 8px", fontSize: 12, border: "0.5px solid var(--color-border-secondary)", borderRadius: 6, background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }

  return (
    <div style={{ marginTop: 4 }}>
      <button onClick={() => setOpen(v => !v)} style={{ fontSize: 11, background: "none", border: "none", cursor: "pointer", padding: 0, display: "inline-flex", alignItems: "center", gap: 6, color: "var(--color-text-muted)" }}>
        {open ? "▼" : "▶"}
        <span style={{ fontSize: 11, fontWeight: 500, padding: "1px 7px", borderRadius: 4, background: over ? "rgba(239,68,68,0.14)" : "var(--color-background-hover)", color: over ? "#ef4444" : "var(--color-text-secondary)" }}>
          {assigned}{totalSeats != null ? ` / ${totalSeats}` : ""} seats{free != null ? (free >= 0 ? ` · ${free} free` : ` · ${-free} over`) : ""}
        </span>
      </button>
      {open && (
        <div style={{ marginTop: 6, padding: "8px 12px", background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 6 }}>
          {loading && <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Loading...</span>}
          {seats && seats.length === 0 && !adding && <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>No seats assigned yet.</span>}
          {seats && seats.length > 0 && (
            <ul style={{ margin: "0 0 6px", paddingLeft: 0, listStyle: "none" }}>
              {seats.map(s => (
                <li key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, padding: "3px 0", color: "var(--color-text-secondary)" }}>
                  <span>{s.person ? s.person.name : s.asset ? (s.asset.friendlyName ?? s.asset.name) : s.notes ?? "—"}{s.person && s.asset ? "" : s.asset ? " (device)" : ""}</span>
                  <button onClick={() => removeSeat(s.id)} style={{ fontSize: 11, background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)" }}>Remove</button>
                </li>
              ))}
            </ul>
          )}
          {adding ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
              <select style={inp} value={form.personId} onChange={e => setForm(f => ({ ...f, personId: e.target.value, assetId: e.target.value ? "" : f.assetId }))}>
                <option value="">— person —</option>
                {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select style={inp} value={form.assetId} onChange={e => setForm(f => ({ ...f, assetId: e.target.value, personId: e.target.value ? "" : f.personId }))}>
                <option value="">— or device —</option>
                {assets.map(a => <option key={a.id} value={a.id}>{a.friendlyName ?? a.name}</option>)}
              </select>
              <button onClick={addSeat} disabled={saving} style={{ fontSize: 11, padding: "5px 10px", borderRadius: 6, border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>{saving ? "…" : "Assign"}</button>
              <button onClick={() => setAdding(false)} style={{ fontSize: 11, padding: "5px 8px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>Cancel</button>
            </div>
          ) : (
            <button onClick={() => setAdding(true)} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 5, border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>+ Assign seat</button>
          )}
        </div>
      )}
    </div>
  )
}
