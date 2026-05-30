"use client"

import { useEffect, useState } from "react"

type Seat = {
  id: string
  seatUsername: string | null
  hasPassword: boolean
  notes: string | null
  person: { id: string; name: string; email: string | null } | null
}

/**
 * Per-application seat assignments (LOB apps). Mirrors LicenseSeats; the
 * assigned count is derived from the rows. Adding a seat with a password +
 * a person auto-pushes an app credential to that person's portal vault
 * (handled server-side in /api/applications/[id]/seats).
 */
export default function AppSeats({
  applicationId, totalSeats, initialAssigned, people,
}: {
  applicationId: string
  totalSeats: number | null
  initialAssigned: number
  people: { id: string; name: string; email?: string | null }[]
}) {
  const [open, setOpen] = useState(false)
  const [seats, setSeats] = useState<Seat[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ personId: "", seatUsername: "", seatPassword: "" })
  const [saving, setSaving] = useState(false)

  const assigned = seats ? seats.length : initialAssigned
  const free = totalSeats != null ? totalSeats - assigned : null
  const over = totalSeats != null && assigned > totalSeats

  useEffect(() => {
    if (!open || seats) return
    setLoading(true)
    fetch(`/api/applications/${applicationId}/seats`)
      .then(r => r.ok ? r.json() : [])
      .then((d: Seat[]) => setSeats(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false))
  }, [open, applicationId, seats])

  async function addSeat() {
    if (!form.personId && !form.seatUsername.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/applications/${applicationId}/seats`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        const seat = await res.json()
        setSeats(prev => [...(prev ?? []), seat])
        setForm({ personId: "", seatUsername: "", seatPassword: "" })
        setAdding(false)
      }
    } finally { setSaving(false) }
  }

  async function removeSeat(seatId: string) {
    const res = await fetch(`/api/applications/${applicationId}/seats`, {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seatId }),
    })
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
                  <span>{s.person ? s.person.name : s.seatUsername ?? "—"}{s.seatUsername && s.person ? ` (${s.seatUsername})` : ""}{s.hasPassword ? " 🔑" : ""}</span>
                  <button onClick={() => removeSeat(s.id)} style={{ fontSize: 11, background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)" }}>Remove</button>
                </li>
              ))}
            </ul>
          )}
          {adding ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
              <select style={inp} value={form.personId} onChange={e => setForm(f => ({ ...f, personId: e.target.value }))}>
                <option value="">— person —</option>
                {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <input style={{ ...inp, width: 110 }} value={form.seatUsername} onChange={e => setForm(f => ({ ...f, seatUsername: e.target.value }))} placeholder="username" />
              <input style={{ ...inp, width: 110 }} type="password" value={form.seatPassword} onChange={e => setForm(f => ({ ...f, seatPassword: e.target.value }))} placeholder="password" />
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
