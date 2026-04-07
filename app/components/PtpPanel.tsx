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

const FREQ_BANDS = ["5.8 GHz", "5 GHz", "2.4 GHz", "60 GHz", "24 GHz", "900 MHz", "3 GHz", "Other"]
const CHANNEL_WIDTHS = ["20 MHz", "40 MHz", "80 MHz", "100 MHz", "250 MHz", "500 MHz"]

type Location = { id: string; name: string }
type Credential = { id: string; label: string }

type PtpLink = {
  id: string
  name: string
  make: string | null
  model: string | null
  frequencyBand: string | null
  channelWidth: string | null
  distanceFt: number | null
  managementUrl: string | null
  credentialId: string | null
  credential: { id: string; label: string } | null
  notes: string | null
  isActive: boolean
  sideAName: string | null
  sideALocationId: string | null
  sideALocation: { id: string; name: string } | null
  sideAIp: string | null
  sideAMac: string | null
  sideASerial: string | null
  sideASignalDbm: number | null
  sideATxPower: string | null
  sideBName: string | null
  sideBLocationId: string | null
  sideBLocation: { id: string; name: string } | null
  sideBIp: string | null
  sideBMac: string | null
  sideBSerial: string | null
  sideBSignalDbm: number | null
  sideBTxPower: string | null
}

type Props = {
  links: PtpLink[]
  locations: Location[]
  credentials: Credential[]
  clientId: string
  onLinksChange: (links: PtpLink[]) => void
}

const emptyForm = () => ({
  name: "", make: "", model: "", frequencyBand: "", channelWidth: "", distanceFt: "",
  managementUrl: "", credentialId: "", notes: "",
  sideAName: "", sideALocationId: "", sideAIp: "", sideAMac: "", sideASerial: "", sideASignalDbm: "", sideATxPower: "",
  sideBName: "", sideBLocationId: "", sideBIp: "", sideBMac: "", sideBSerial: "", sideBSignalDbm: "", sideBTxPower: "",
})

function signalColor(dbm: number | null): string {
  if (dbm === null) return "var(--color-text-secondary)"
  if (dbm >= -60) return "#22c55e"
  if (dbm >= -70) return "#86efac"
  if (dbm >= -80) return "#f59e0b"
  return "#ef4444"
}

function signalLabel(dbm: number | null): string {
  if (dbm === null) return "—"
  if (dbm >= -60) return "Excellent"
  if (dbm >= -70) return "Good"
  if (dbm >= -80) return "Fair"
  return "Poor"
}

export default function PtpPanel({ links, locations, credentials, clientId, onLinksChange }: Props) {
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Record<string, any>>({})
  const [savingEdit, setSavingEdit] = useState(false)

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const setE = (k: string, v: string) => setEditForm(f => ({ ...f, [k]: v }))

  async function createLink() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/ptp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        const created = await res.json()
        onLinksChange([...links, created])
        setForm(emptyForm())
        setShowAdd(false)
      }
    } finally { setSaving(false) }
  }

  async function saveEdit(linkId: string) {
    setSavingEdit(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/ptp/${linkId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      })
      if (res.ok) {
        const updated = await res.json()
        onLinksChange(links.map(l => l.id === linkId ? updated : l))
        setEditingId(null)
      }
    } finally { setSavingEdit(false) }
  }

  async function deleteLink(linkId: string, name: string) {
    if (!confirm(`Delete PTP link "${name}"? This cannot be undone.`)) return
    const res = await fetch(`/api/clients/${clientId}/ptp/${linkId}`, { method: "DELETE" })
    if (res.ok) onLinksChange(links.filter(l => l.id !== linkId))
  }

  function startEdit(link: PtpLink) {
    setEditingId(link.id)
    setEditForm({
      name: link.name,
      make: link.make ?? "",
      model: link.model ?? "",
      frequencyBand: link.frequencyBand ?? "",
      channelWidth: link.channelWidth ?? "",
      distanceFt: link.distanceFt?.toString() ?? "",
      managementUrl: link.managementUrl ?? "",
      credentialId: link.credentialId ?? "",
      notes: link.notes ?? "",
      sideAName: link.sideAName ?? "",
      sideALocationId: link.sideALocationId ?? "",
      sideAIp: link.sideAIp ?? "",
      sideAMac: link.sideAMac ?? "",
      sideASerial: link.sideASerial ?? "",
      sideASignalDbm: link.sideASignalDbm?.toString() ?? "",
      sideATxPower: link.sideATxPower ?? "",
      sideBName: link.sideBName ?? "",
      sideBLocationId: link.sideBLocationId ?? "",
      sideBIp: link.sideBIp ?? "",
      sideBMac: link.sideBMac ?? "",
      sideBSerial: link.sideBSerial ?? "",
      sideBSignalDbm: link.sideBSignalDbm?.toString() ?? "",
      sideBTxPower: link.sideBTxPower ?? "",
    })
    setExpandedId(link.id)
  }

  const activeLinks = links.filter(l => l.isActive)
  const inactiveLinks = links.filter(l => !l.isActive)

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <div>
          <div style={{ fontSize: "15px", fontWeight: 600 }}>PTP Bridges</div>
          <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginTop: "2px" }}>
            Wireless point-to-point links between sites
          </div>
        </div>
        <button onClick={() => setShowAdd(v => !v)} style={btn("ghost")}>
          {showAdd ? "Cancel" : "Add PTP link"}
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div style={card}>
          <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "16px" }}>New PTP Link</div>
          <LinkForm
            form={form} set={set}
            locations={locations} credentials={credentials}
          />
          <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
            <button onClick={createLink} disabled={saving || !form.name.trim()} style={btn("primary")}>
              {saving ? "Saving..." : "Create"}
            </button>
            <button onClick={() => { setShowAdd(false); setForm(emptyForm()) }} style={btn("ghost")}>Cancel</button>
          </div>
        </div>
      )}

      {/* Link list */}
      {links.length === 0 && !showAdd && (
        <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>No PTP links documented yet.</div>
      )}

      {activeLinks.map(link => (
        <LinkCard
          key={link.id}
          link={link}
          locations={locations}
          credentials={credentials}
          expanded={expandedId === link.id}
          editing={editingId === link.id}
          editForm={editForm}
          savingEdit={savingEdit}
          onToggle={() => { setExpandedId(expandedId === link.id ? null : link.id); setEditingId(null) }}
          onEdit={() => startEdit(link)}
          onSaveEdit={() => saveEdit(link.id)}
          onCancelEdit={() => setEditingId(null)}
          onDelete={() => deleteLink(link.id, link.name)}
          setE={setE}
        />
      ))}

      {inactiveLinks.length > 0 && (
        <div style={{ marginTop: "24px" }}>
          <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" }}>
            Inactive ({inactiveLinks.length})
          </div>
          {inactiveLinks.map(link => (
            <LinkCard
              key={link.id}
              link={link}
              locations={locations}
              credentials={credentials}
              expanded={expandedId === link.id}
              editing={editingId === link.id}
              editForm={editForm}
              savingEdit={savingEdit}
              onToggle={() => { setExpandedId(expandedId === link.id ? null : link.id); setEditingId(null) }}
              onEdit={() => startEdit(link)}
              onSaveEdit={() => saveEdit(link.id)}
              onCancelEdit={() => setEditingId(null)}
              onDelete={() => deleteLink(link.id, link.name)}
              setE={setE}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Shared form fields ────────────────────────────────────────────────────────

function LinkForm({ form, set, locations, credentials }: {
  form: Record<string, any>
  set: (k: string, v: string) => void
  locations: Location[]
  credentials: Credential[]
}) {
  return (
    <div>
      {/* Link-level fields */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "12px" }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={lbl}>Link Name *</label>
          <input style={inp} value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Main Office to Warehouse" />
        </div>
        <div>
          <label style={lbl}>Make</label>
          <input style={inp} value={form.make} onChange={e => set("make", e.target.value)} placeholder="Ubiquiti, MikroTik, Cambium…" />
        </div>
        <div>
          <label style={lbl}>Model</label>
          <input style={inp} value={form.model} onChange={e => set("model", e.target.value)} placeholder="LiteBeam 5AC Gen2" />
        </div>
        <div>
          <label style={lbl}>Frequency Band</label>
          <select style={inp} value={form.frequencyBand} onChange={e => set("frequencyBand", e.target.value)}>
            <option value="">— select —</option>
            {FREQ_BANDS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Channel Width</label>
          <select style={inp} value={form.channelWidth} onChange={e => set("channelWidth", e.target.value)}>
            <option value="">— select —</option>
            {CHANNEL_WIDTHS.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Distance (ft)</label>
          <input style={inp} type="number" value={form.distanceFt} onChange={e => set("distanceFt", e.target.value)} placeholder="e.g. 1200" />
        </div>
        <div>
          <label style={lbl}>Management URL</label>
          <input style={inp} value={form.managementUrl} onChange={e => set("managementUrl", e.target.value)} placeholder="https://192.168.1.1" />
        </div>
        <div>
          <label style={lbl}>Credential</label>
          <select style={inp} value={form.credentialId} onChange={e => set("credentialId", e.target.value)}>
            <option value="">— none —</option>
            {credentials.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={lbl}>Notes</label>
          <textarea style={{ ...inp, resize: "vertical", minHeight: "60px" }} value={form.notes} onChange={e => set("notes", e.target.value)} />
        </div>
      </div>

      {/* Two-column endpoint grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginTop: "8px" }}>
        <EndpointFields side="A" prefix="sideA" form={form} set={set} locations={locations} />
        <EndpointFields side="B" prefix="sideB" form={form} set={set} locations={locations} />
      </div>
    </div>
  )
}

function EndpointFields({ side, prefix, form, set, locations }: {
  side: "A" | "B"
  prefix: string
  form: Record<string, any>
  set: (k: string, v: string) => void
  locations: Location[]
}) {
  const f = (k: string) => form[`${prefix}${k}`] ?? ""
  const s = (k: string, v: string) => set(`${prefix}${k}`, v)

  return (
    <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "8px", padding: "14px" }}>
      <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "12px", color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Side {side}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <div>
          <label style={lbl}>Label</label>
          <input style={inp} value={f("Name")} onChange={e => s("Name", e.target.value)} placeholder={`e.g. ${side === "A" ? "Main Office Rooftop" : "Warehouse Roof"}`} />
        </div>
        <div>
          <label style={lbl}>Location</label>
          <select style={inp} value={f("LocationId")} onChange={e => s("LocationId", e.target.value)}>
            <option value="">— none —</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>IP Address</label>
          <input style={inp} value={f("Ip")} onChange={e => s("Ip", e.target.value)} placeholder="192.168.1.1" />
        </div>
        <div>
          <label style={lbl}>MAC Address</label>
          <input style={inp} value={f("Mac")} onChange={e => s("Mac", e.target.value)} placeholder="AA:BB:CC:DD:EE:FF" />
        </div>
        <div>
          <label style={lbl}>Serial</label>
          <input style={inp} value={f("Serial")} onChange={e => s("Serial", e.target.value)} placeholder="" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <div>
            <label style={lbl}>Signal (dBm)</label>
            <input style={inp} type="number" value={f("SignalDbm")} onChange={e => s("SignalDbm", e.target.value)} placeholder="-65" />
          </div>
          <div>
            <label style={lbl}>TX Power</label>
            <input style={inp} value={f("TxPower")} onChange={e => s("TxPower", e.target.value)} placeholder="23 dBm" />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Link card ─────────────────────────────────────────────────────────────────

function LinkCard({ link, locations, credentials, expanded, editing, editForm, savingEdit, onToggle, onEdit, onSaveEdit, onCancelEdit, onDelete, setE }: {
  link: PtpLink
  locations: Location[]
  credentials: Credential[]
  expanded: boolean
  editing: boolean
  editForm: Record<string, any>
  savingEdit: boolean
  onToggle: () => void
  onEdit: () => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onDelete: () => void
  setE: (k: string, v: string) => void
}) {
  const sideALabel = link.sideAName || link.sideALocation?.name || "Side A"
  const sideBLabel = link.sideBName || link.sideBLocation?.name || "Side B"

  return (
    <div style={{ ...card, opacity: link.isActive ? 1 : 0.6 }}>
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", cursor: "pointer" }} onClick={onToggle}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "15px", fontWeight: 600 }}>{link.name}</span>
            {!link.isActive && (
              <span style={{ fontSize: "11px", padding: "1px 6px", borderRadius: "4px", background: "#6b728022", color: "#6b7280", border: "0.5px solid #6b728044" }}>Inactive</span>
            )}
            {link.frequencyBand && (
              <span style={{ fontSize: "12px", padding: "2px 8px", borderRadius: "20px", background: "#3b82f622", color: "#3b82f6", border: "0.5px solid #3b82f644" }}>{link.frequencyBand}</span>
            )}
            {link.channelWidth && (
              <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{link.channelWidth}</span>
            )}
          </div>
          {/* Link diagram — always visible */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "10px", flexWrap: "wrap" }}>
            <SiteChip label={sideALabel} ip={link.sideAIp} signal={link.sideASignalDbm} />
            <div style={{ flex: 1, minWidth: "40px", borderTop: "1.5px dashed var(--color-border-secondary)", position: "relative" }}>
              {link.distanceFt && (
                <span style={{ position: "absolute", top: "-9px", left: "50%", transform: "translateX(-50%)", fontSize: "10px", background: "var(--color-background-secondary)", padding: "0 4px", color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>
                  {link.distanceFt.toLocaleString()} ft
                </span>
              )}
            </div>
            <SiteChip label={sideBLabel} ip={link.sideBIp} signal={link.sideBSignalDbm} />
          </div>
          {(link.make || link.model) && (
            <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "6px" }}>
              {[link.make, link.model].filter(Boolean).join(" ")}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", marginLeft: "16px", flexShrink: 0 }}>
          {link.managementUrl && (
            <a href={link.managementUrl} target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{ fontSize: "12px", color: "var(--color-text-secondary)", padding: "4px 8px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "5px", textDecoration: "none" }}>
              Manage
            </a>
          )}
          <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && !editing && (
        <div style={{ marginTop: "16px", borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: "16px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
            <EndpointDetail label={`Side A — ${sideALabel}`} link={link} side="A" />
            <EndpointDetail label={`Side B — ${sideBLabel}`} link={link} side="B" />
          </div>
          {link.notes && (
            <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginBottom: "12px" }}>{link.notes}</div>
          )}
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={onEdit} style={btn("ghost")}>Edit</button>
            <button onClick={onDelete} style={btn("danger")}>Delete</button>
          </div>
        </div>
      )}

      {/* Edit form */}
      {expanded && editing && (
        <div style={{ marginTop: "16px", borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: "16px" }}>
          <LinkForm form={editForm} set={setE} locations={locations} credentials={credentials} />
          <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
            <button onClick={onSaveEdit} disabled={savingEdit} style={btn("primary")}>{savingEdit ? "Saving..." : "Save"}</button>
            <button onClick={onCancelEdit} style={btn("ghost")}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

function SiteChip({ label, ip, signal }: { label: string; ip: string | null; signal: number | null }) {
  return (
    <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", padding: "6px 10px", minWidth: "100px", textAlign: "center" }}>
      <div style={{ fontSize: "12px", fontWeight: 500 }}>{label}</div>
      {ip && <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", fontFamily: "monospace", marginTop: "1px" }}>{ip}</div>}
      {signal !== null && (
        <div style={{ fontSize: "11px", marginTop: "3px", color: signalColor(signal), fontWeight: 500 }}>
          {signal} dBm · {signalLabel(signal)}
        </div>
      )}
    </div>
  )
}

function EndpointDetail({ label, link, side }: { label: string; link: PtpLink; side: "A" | "B" }) {
  const prefix = `side${side}` as "sideA" | "sideB"
  const rows: [string, string | null][] = [
    ["Location", side === "A" ? link.sideALocation?.name ?? null : link.sideBLocation?.name ?? null],
    ["IP Address", link[`${prefix}Ip`]],
    ["MAC", link[`${prefix}Mac`]],
    ["Serial", link[`${prefix}Serial`]],
    ["Signal", link[`${prefix}SignalDbm`] !== null ? `${link[`${prefix}SignalDbm`]} dBm` : null],
    ["TX Power", link[`${prefix}TxPower`]],
  ]
  return (
    <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "8px", overflow: "hidden" }}>
      <div style={{ padding: "8px 12px", borderBottom: "0.5px solid var(--color-border-tertiary)", fontSize: "12px", fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </div>
      {rows.filter(([, v]) => v).map(([k, v]) => (
        <div key={k} style={{ padding: "6px 12px", display: "flex", justifyContent: "space-between", fontSize: "13px", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
          <span style={{ color: "var(--color-text-secondary)" }}>{k}</span>
          <span style={{ fontFamily: ["IP Address", "MAC", "Serial"].includes(k) ? "monospace" : "inherit", fontSize: ["IP Address", "MAC", "Serial"].includes(k) ? "12px" : "13px" }}>{v}</span>
        </div>
      ))}
    </div>
  )
}
