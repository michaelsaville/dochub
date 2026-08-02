"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

/**
 * Cable-run capture.
 *
 * Design constraint that drives everything here: this gets filled in by a technician
 * standing in a wiring closet holding an iPad, not by someone at a desk with an hour
 * free. So — every field except the jack label is optional, "verify" is one tap and
 * never requires opening a form, and the empty state offers something to act on
 * instead of a blank canvas.
 *
 * Deliberately NOT a diagram. The payoff is the 2am lookup, which is a text answer.
 */

type Location = { id: string; name: string }
type AssetLite = {
  id: string
  name: string
  friendlyName: string | null
  category: string
  portCount: number | null
}

export type CableRun = {
  id: string
  clientId: string
  locationId: string
  jackLabel: string
  room: string | null
  panelAssetId: string | null
  panelLabel: string | null
  panelPort: number | null
  switchAssetId: string | null
  switchPortNumber: number | null
  switchPortId: string | null
  cableType: string | null
  photoStorageName: string | null
  notes: string | null
  lastVerifiedAt: string | null
  verifiedBy: string | null
  location: { id: string; name: string } | null
  panelAsset: { id: string; name: string; friendlyName: string | null } | null
  switchAsset: { id: string; name: string; friendlyName: string | null } | null
}

type Props = {
  clientId: string
  locations: Location[]
  assets: AssetLite[]
  /** Optional deep-link target from global search (?run=<id>) — scrolls to and flashes the row. */
  focusRunId?: string | null
}

const CABLE_TYPES = ["Cat5e", "Cat6", "Cat6a", "OM4", "OS2"]
const STALE_AFTER_DAYS = 365

const deviceName = (a: { name: string; friendlyName: string | null } | null | undefined) =>
  a ? a.friendlyName || a.name : null

/**
 * `B-114 → PP-A/12 → sw-mdf:14` — screen only, so a real arrow is fine here.
 * The print/PDF path uses cableRunChain() in lib/cable-runs.ts, which is ASCII-only
 * because @react-pdf's bundled Helvetica silently corrupts non-ASCII glyphs.
 */
function chainOf(r: CableRun): string {
  const parts: string[] = [r.jackLabel]
  const panel = deviceName(r.panelAsset) || r.panelLabel
  if (panel) parts.push(r.panelPort != null ? `${panel}/${r.panelPort}` : panel)
  const sw = deviceName(r.switchAsset)
  if (sw) parts.push(r.switchPortNumber != null ? `${sw}:${r.switchPortNumber}` : sw)
  else if (r.switchPortNumber != null) parts.push(`port ${r.switchPortNumber}`)
  return parts.join(" → ")
}

function isStale(at: string | null): boolean {
  if (!at) return true
  return Date.now() - new Date(at).getTime() > STALE_AFTER_DAYS * 864e5
}

function verifiedLabel(r: CableRun): string {
  if (!r.lastVerifiedAt) return "never verified"
  const days = Math.floor((Date.now() - new Date(r.lastVerifiedAt).getTime()) / 864e5)
  const when = days === 0 ? "today" : days === 1 ? "yesterday" : `${days}d ago`
  return r.verifiedBy ? `${when} by ${r.verifiedBy}` : when
}

const BLANK = {
  jackLabel: "", room: "", panelLabel: "", panelPort: "",
  switchAssetId: "", switchPortNumber: "", cableType: "", notes: "",
}

const input: React.CSSProperties = {
  width: "100%", padding: "10px 12px", fontSize: "14px",
  border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px",
  background: "var(--color-background-primary)", color: "var(--color-text-primary)",
  boxSizing: "border-box",
}
const lbl: React.CSSProperties = {
  fontSize: "12px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px",
}

export default function CablingPanel({ clientId, locations, assets, focusRunId }: Props) {
  const [runs, setRuns] = useState<CableRun[]>([])
  const [rooms, setRooms] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "")
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...BLANK })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [filter, setFilter] = useState("")
  const [busyId, setBusyId] = useState<string | null>(null)

  // Switch-like assets, keyed by ID. Never by name: four separate Assets in this
  // database are all called "USW Lite 16 PoE".
  const switches = useMemo(
    () => assets
      // NETWORK_GEAR is the real enum value ("NETWORK" does not exist and silently
      // matched nothing); portCount and a name match catch the rest.
      .filter(a => a.category === "NETWORK_GEAR" || a.portCount != null || /switch/i.test(a.name))
      .sort((a, b) => (deviceName(a) || "").localeCompare(deviceName(b) || "")),
    [assets]
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [rRes, roomRes] = await Promise.all([
        fetch(`/api/clients/${clientId}/cable-runs`),
        fetch(`/api/clients/${clientId}/rooms`),
      ])
      if (rRes.ok) setRuns(await rRes.json())
      if (roomRes.ok) setRooms(await roomRes.json())
    } finally { setLoading(false) }
  }, [clientId])

  useEffect(() => { load() }, [load])

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return runs
    return runs.filter(r =>
      [r.jackLabel, r.room, r.panelLabel, r.notes, deviceName(r.switchAsset)]
        .some(v => v?.toLowerCase().includes(q))
    )
  }, [runs, filter])

  // Grouped by room so the list reads the way a building is walked.
  const grouped = useMemo(() => {
    const m = new Map<string, CableRun[]>()
    for (const r of visible) {
      const k = r.room?.trim() || "Unassigned"
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(r)
    }
    return [...m.entries()].sort((a, b) =>
      a[0] === "Unassigned" ? 1 : b[0] === "Unassigned" ? -1 : a[0].localeCompare(b[0])
    )
  }, [visible])

  function startEdit(r: CableRun) {
    setEditingId(r.id); setAdding(false); setErr(null)
    setForm({
      jackLabel: r.jackLabel,
      room: r.room ?? "",
      panelLabel: r.panelLabel ?? "",
      panelPort: r.panelPort?.toString() ?? "",
      switchAssetId: r.switchAssetId ?? "",
      switchPortNumber: r.switchPortNumber?.toString() ?? "",
      cableType: r.cableType ?? "",
      notes: r.notes ?? "",
    })
  }

  function startAdd(prefill?: Partial<typeof BLANK>) {
    setAdding(true); setEditingId(null); setErr(null)
    setForm({ ...BLANK, ...prefill })
  }

  const intOrNull = (v: string) => {
    const n = parseInt(v, 10)
    return Number.isFinite(n) ? n : null
  }

  async function save() {
    if (!form.jackLabel.trim()) { setErr("Jack label is required"); return }
    setSaving(true); setErr(null)
    const payload = {
      locationId,
      jackLabel: form.jackLabel,
      room: form.room,
      panelLabel: form.panelLabel,
      panelPort: intOrNull(form.panelPort),
      switchAssetId: form.switchAssetId || null,
      switchPortNumber: intOrNull(form.switchPortNumber),
      cableType: form.cableType,
      notes: form.notes,
    }
    try {
      const res = editingId
        ? await fetch(`/api/clients/${clientId}/cable-runs/${editingId}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch(`/api/clients/${clientId}/cable-runs`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      if (!res.ok) { setErr((await res.json()).error || "Save failed"); return }
      const saved: CableRun = await res.json()
      setRuns(prev => {
        const next = editingId ? prev.map(r => (r.id === saved.id ? saved : r)) : [...prev, saved]
        return next.sort((a, b) =>
          (a.room ?? "").localeCompare(b.room ?? "") || a.jackLabel.localeCompare(b.jackLabel))
      })
      if (saved.room && !rooms.some(x => x.toLowerCase() === saved.room!.toLowerCase())) {
        setRooms(p => [...p, saved.room!].sort((a, b) => a.localeCompare(b)))
      }
      // Keep the form open on add, pre-seeded with the same room — jacks are
      // documented in runs of a dozen, not one at a time.
      if (editingId) { setEditingId(null); setAdding(false) }
      else setForm({ ...BLANK, room: form.room, panelLabel: form.panelLabel, switchAssetId: form.switchAssetId })
    } finally { setSaving(false) }
  }

  async function verify(r: CableRun) {
    setBusyId(r.id)
    try {
      const res = await fetch(`/api/clients/${clientId}/cable-runs/${r.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ verify: true }),
      })
      if (res.ok) { const s: CableRun = await res.json(); setRuns(p => p.map(x => (x.id === s.id ? s : x))) }
    } finally { setBusyId(null) }
  }

  async function remove(r: CableRun) {
    if (!confirm(`Delete cable run ${r.jackLabel}?`)) return
    setBusyId(r.id)
    try {
      const res = await fetch(`/api/clients/${clientId}/cable-runs/${r.id}`, { method: "DELETE" })
      if (res.ok) setRuns(p => p.filter(x => x.id !== r.id))
    } finally { setBusyId(null) }
  }

  const editorOpen = adding || editingId !== null

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", marginBottom: "16px" }}>
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter jacks, rooms, switches..."
          style={{ ...input, width: "auto", flex: "1 1 220px", minWidth: "180px" }}
        />
        {locations.length > 1 && (
          <select value={locationId} onChange={e => setLocationId(e.target.value)} style={{ ...input, width: "auto" }}>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        )}
        <button className="btn btn-primary" onClick={() => startAdd()} style={{ minHeight: "40px" }}>
          + Cable run
        </button>
      </div>

      {/* Editor */}
      {editorOpen && (
        <div style={{
          background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-secondary)",
          borderRadius: "10px", padding: "16px", marginBottom: "20px",
        }}>
          <div style={{ fontSize: "14px", fontWeight: 500, marginBottom: "12px", color: "var(--color-text-primary)" }}>
            {editingId ? "Edit cable run" : "New cable run"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px", marginBottom: "12px" }}>
            <div>
              <label style={lbl}>Jack label *</label>
              <input autoFocus value={form.jackLabel} onChange={e => setForm(f => ({ ...f, jackLabel: e.target.value }))}
                placeholder="B-114" style={{ ...input, fontFamily: "var(--mono)" }} />
            </div>
            <div>
              <label style={lbl}>Room</label>
              <input list="cabling-rooms" value={form.room} onChange={e => setForm(f => ({ ...f, room: e.target.value }))}
                placeholder="MDF" style={input} />
              <datalist id="cabling-rooms">{rooms.map(r => <option key={r} value={r} />)}</datalist>
            </div>
            <div>
              <label style={lbl}>Patch panel</label>
              <input value={form.panelLabel} onChange={e => setForm(f => ({ ...f, panelLabel: e.target.value }))}
                placeholder="PP-A" style={input} />
            </div>
            <div>
              <label style={lbl}>Panel port</label>
              <input inputMode="numeric" value={form.panelPort} onChange={e => setForm(f => ({ ...f, panelPort: e.target.value }))}
                placeholder="12" style={{ ...input, fontFamily: "var(--mono)" }} />
            </div>
            <div>
              <label style={lbl}>Switch</label>
              <select value={form.switchAssetId} onChange={e => setForm(f => ({ ...f, switchAssetId: e.target.value }))} style={input}>
                <option value="">Not recorded</option>
                {switches.map(a => <option key={a.id} value={a.id}>{deviceName(a)}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Switch port</label>
              <input inputMode="numeric" value={form.switchPortNumber} onChange={e => setForm(f => ({ ...f, switchPortNumber: e.target.value }))}
                placeholder="14" style={{ ...input, fontFamily: "var(--mono)" }} />
            </div>
            <div>
              <label style={lbl}>Cable</label>
              <select value={form.cableType} onChange={e => setForm(f => ({ ...f, cableType: e.target.value }))} style={input}>
                <option value="">—</option>
                {CABLE_TYPES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={lbl}>Notes</label>
              <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="e.g. runs above the drop ceiling, shares conduit with the alarm" style={input} />
            </div>
          </div>
          {err && <div style={{ fontSize: "13px", color: "var(--color-text-danger)", marginBottom: "10px" }}>{err}</div>}
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button className="btn btn-primary" onClick={save} disabled={saving} style={{ minHeight: "40px" }}>
              {saving ? "Saving..." : editingId ? "Save" : "Add run"}
            </button>
            <button className="btn btn-secondary" onClick={() => { setAdding(false); setEditingId(null); setErr(null) }}
              style={{ minHeight: "40px" }}>Cancel</button>
            {!editingId && (
              <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
                Room, panel and switch stay filled in for the next jack.
              </span>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: "14px", color: "var(--color-text-secondary)", padding: "24px 0" }}>Loading cable runs...</div>
      ) : runs.length === 0 ? (
        // Not a blank canvas. Offer the smallest possible first action, seeded with
        // a real switch from this client where one exists.
        <div style={{
          border: "1px dashed var(--color-border-secondary)", borderRadius: "10px",
          padding: "24px", maxWidth: "620px",
        }}>
          <div style={{ fontSize: "15px", fontWeight: 500, color: "var(--color-text-primary)", marginBottom: "6px" }}>
            No cable runs documented yet
          </div>
          <div style={{ fontSize: "13px", color: "var(--color-text-muted)", lineHeight: 1.55, marginBottom: "14px" }}>
            One run is one wall jack. Document them as you touch them — the payoff is
            typing a jack label into search at 2am and getting back the switch port,
            without a trip to the closet.
          </div>
          {switches.length > 0 ? (
            <button className="btn btn-primary" style={{ minHeight: "40px" }}
              onClick={() => startAdd({ switchAssetId: switches[0].id })}>
              Start with {deviceName(switches[0])}
            </button>
          ) : (
            <button className="btn btn-primary" style={{ minHeight: "40px" }} onClick={() => startAdd()}>
              Document the first jack
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          {grouped.map(([room, list]) => (
            <div key={room}>
              <div style={{
                fontSize: "12px", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase",
                color: "var(--color-text-secondary)", marginBottom: "6px",
              }}>
                {room} <span style={{ fontWeight: 400, color: "var(--color-text-muted)" }}>· {list.length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {list.map(r => {
                  const stale = isStale(r.lastVerifiedAt)
                  return (
                    <div key={r.id} id={`run-${r.id}`} style={{
                      display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap",
                      padding: "10px 12px", borderRadius: "8px",
                      background: "var(--color-background-secondary)",
                      border: r.id === focusRunId
                        ? "1px solid var(--accent)"
                        : "0.5px solid var(--color-border-secondary)",
                    }}>
                      <span style={{
                        fontFamily: "var(--mono)", fontSize: "14px", fontWeight: 600,
                        color: "var(--color-text-primary)", minWidth: "72px",
                      }}>{r.jackLabel}</span>
                      <span style={{
                        fontFamily: "var(--mono)", fontSize: "12px",
                        color: "var(--color-text-secondary)", flex: "1 1 240px",
                      }}>{chainOf(r)}</span>
                      {r.cableType && (
                        <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>{r.cableType}</span>
                      )}
                      <span title={r.lastVerifiedAt ?? undefined} style={{
                        fontSize: "11px",
                        color: stale ? "var(--color-text-warning)" : "var(--color-text-muted)",
                      }}>
                        {stale ? "⚠ " : ""}{verifiedLabel(r)}
                      </span>
                      <div style={{ display: "flex", gap: "6px", marginLeft: "auto" }}>
                        <button className="btn btn-ghost" disabled={busyId === r.id} onClick={() => verify(r)}
                          title="Confirm this run is still correct" style={{ minHeight: "36px" }}>✓ Verify</button>
                        <button className="btn btn-ghost" onClick={() => startEdit(r)} style={{ minHeight: "36px" }}>Edit</button>
                        <button className="btn btn-ghost" disabled={busyId === r.id} onClick={() => remove(r)}
                          style={{ minHeight: "36px", color: "var(--color-text-danger)" }}>Delete</button>
                      </div>
                      {r.notes && (
                        <div style={{
                          flexBasis: "100%", fontSize: "12px", color: "var(--color-text-muted)", fontStyle: "italic",
                        }}>{r.notes}</div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
