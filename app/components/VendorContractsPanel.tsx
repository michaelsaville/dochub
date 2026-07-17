"use client"

import { useEffect, useState } from "react"

type Contract = {
  id: string
  name: string
  contractType: string | null
  startDate: string | null
  endDate: string | null
  autoRenew: boolean
  renewalDate: string | null
  cost: number | null
  costPeriod: string | null
  documentUrl: string | null
  notes: string | null
  client: { id: string; name: string } | null
}

const TYPES = ["MSA", "SLA", "LEASE", "SUBSCRIPTION", "NDA", "OTHER"]
const PERIODS = ["ANNUAL", "MONTHLY", "ONE_TIME"]

const inp: React.CSSProperties = {
  width: "100%", padding: "8px 12px", fontSize: 14,
  border: "0.5px solid var(--color-border-secondary)", borderRadius: 8,
  background: "var(--color-background-primary)", color: "var(--color-text-primary)",
}

function formatDate(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function formatCost(cents: number | null, period: string | null) {
  if (cents == null) return "—"
  const dollars = (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })
  if (!period || period === "ONE_TIME") return dollars
  if (period === "MONTHLY") return `${dollars} / mo`
  if (period === "ANNUAL") return `${dollars} / yr`
  return dollars
}

function urgencyColor(endDate: string | null): { bg: string; fg: string } {
  if (!endDate) return { bg: "rgba(148,163,184,0.14)", fg: "var(--color-text-secondary)" }
  const days = Math.floor((new Date(endDate).getTime() - Date.now()) / 86_400_000)
  if (days < 0) return { bg: "rgba(239,68,68,0.14)", fg: "#dc2626" }
  if (days <= 30) return { bg: "rgba(245,158,11,0.14)", fg: "#b45309" }
  return { bg: "rgba(34,197,94,0.14)", fg: "#16a34a" }
}

export default function VendorContractsPanel({ vendorId }: { vendorId: string }) {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<any>(emptyForm())

  useEffect(() => { fetchContracts() }, [vendorId])

  async function fetchContracts() {
    setLoading(true)
    try {
      const res = await fetch(`/api/vendors/${vendorId}/contracts`)
      if (res.ok) setContracts(await res.json())
    } finally { setLoading(false) }
  }

  function emptyForm() {
    return {
      name: "", contractType: "MSA",
      startDate: "", endDate: "", autoRenew: false, renewalDate: "",
      cost: "", costPeriod: "ANNUAL",
      documentUrl: "", notes: "",
    }
  }

  function startEdit(c: Contract) {
    setEditingId(c.id)
    setForm({
      name: c.name,
      contractType: c.contractType ?? "MSA",
      startDate: c.startDate ? c.startDate.slice(0, 10) : "",
      endDate: c.endDate ? c.endDate.slice(0, 10) : "",
      autoRenew: c.autoRenew,
      renewalDate: c.renewalDate ? c.renewalDate.slice(0, 10) : "",
      cost: c.cost != null ? (c.cost / 100).toFixed(2) : "",
      costPeriod: c.costPeriod ?? "ANNUAL",
      documentUrl: c.documentUrl ?? "",
      notes: c.notes ?? "",
    })
    setShowAdd(true)
  }

  async function save() {
    const url = editingId
      ? `/api/vendors/${vendorId}/contracts/${editingId}`
      : `/api/vendors/${vendorId}/contracts`
    const method = editingId ? "PATCH" : "POST"
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      await fetchContracts()
      setShowAdd(false); setEditingId(null); setForm(emptyForm())
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this contract?")) return
    const res = await fetch(`/api/vendors/${vendorId}/contracts/${id}`, { method: "DELETE" })
    if (res.ok) setContracts(prev => prev.filter(c => c.id !== id))
  }

  return (
    <div style={{ marginTop: 32 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 500 }}>Contracts</h2>
        <button
          onClick={() => { setShowAdd(true); setEditingId(null); setForm(emptyForm()) }}
          style={{
            fontSize: 12, padding: "6px 12px", borderRadius: 6,
            border: "0.5px solid var(--color-border-secondary)",
            background: "var(--color-background-primary)", cursor: "pointer",
            color: "var(--color-text-primary)",
          }}
        >
          + Add contract
        </button>
      </div>

      {showAdd && (
        <div style={{
          background: "var(--color-background-secondary)",
          border: "0.5px solid var(--color-border-secondary)",
          borderRadius: 10, padding: 16, marginBottom: 16,
        }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <Field label="Name *">
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Annual MSA" autoFocus style={inp} />
            </Field>
            <Field label="Type">
              <select value={form.contractType} onChange={e => setForm({ ...form, contractType: e.target.value })} style={inp}>
                {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Start date">
              <input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} style={inp} />
            </Field>
            <Field label="End date">
              <input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} style={inp} />
            </Field>
            <Field label="Cost ($)">
              <input value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })}
                placeholder="0.00" type="number" step="0.01" style={inp} />
            </Field>
            <Field label="Cost period">
              <select value={form.costPeriod} onChange={e => setForm({ ...form, costPeriod: e.target.value })} style={inp}>
                {PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="">
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                <input type="checkbox" checked={form.autoRenew} onChange={e => setForm({ ...form, autoRenew: e.target.checked })} />
                Auto-renew
              </label>
            </Field>
            <Field label="Renewal date">
              <input type="date" value={form.renewalDate} onChange={e => setForm({ ...form, renewalDate: e.target.value })} style={inp} />
            </Field>
            <Field label="Document URL"><input value={form.documentUrl} onChange={e => setForm({ ...form, documentUrl: e.target.value })} placeholder="https://..." style={inp} /></Field>
            <Field label="Notes"><input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={inp} /></Field>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={save} disabled={!form.name.trim()}
              style={{
                fontSize: 13, fontWeight: 500, padding: "8px 16px",
                background: "#3b82f6", color: "#fff",
                border: "none", borderRadius: 6, cursor: "pointer",
                opacity: form.name.trim() ? 1 : 0.5,
              }}>
              {editingId ? "Save changes" : "Create contract"}
            </button>
            <button onClick={() => { setShowAdd(false); setEditingId(null) }}
              style={{
                fontSize: 13, padding: "8px 16px",
                background: "transparent", color: "var(--color-text-secondary)",
                border: "0.5px solid var(--color-border-secondary)",
                borderRadius: 6, cursor: "pointer",
              }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p style={{ color: "var(--color-text-secondary)", fontSize: 14 }}>Loading...</p>
      ) : contracts.length === 0 ? (
        <p style={{ color: "var(--color-text-secondary)", fontSize: 14 }}>No contracts yet.</p>
      ) : (
        <div style={{
          border: "0.5px solid var(--color-border-tertiary)",
          borderRadius: 10, overflow: "hidden",
        }}>
          {contracts.map((c, i) => {
            const u = urgencyColor(c.endDate)
            return (
              <div key={c.id} style={{
                padding: "14px 16px",
                borderBottom: i < contracts.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none",
                background: "var(--color-background-primary)",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 14, fontWeight: 500 }}>{c.name}</span>
                      {c.contractType && (
                        <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 4, background: "var(--color-background-secondary)", color: "var(--color-text-secondary)" }}>
                          {c.contractType}
                        </span>
                      )}
                      {c.autoRenew && (
                        <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 4, background: "rgba(59,130,246,0.14)", color: "#3b82f6" }}>
                          AUTO-RENEW
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 16, marginTop: 6, fontSize: 12, color: "var(--color-text-secondary)", flexWrap: "wrap" }}>
                      <span>Term: {formatDate(c.startDate)} → {formatDate(c.endDate)}</span>
                      {c.endDate && (
                        <span style={{ background: u.bg, color: u.fg, padding: "1px 6px", borderRadius: 4, fontWeight: 500 }}>
                          {Math.floor((new Date(c.endDate).getTime() - Date.now()) / 86_400_000)} days
                        </span>
                      )}
                      <span>Cost: {formatCost(c.cost, c.costPeriod)}</span>
                      {c.renewalDate && <span>Renews: {formatDate(c.renewalDate)}</span>}
                    </div>
                    {c.notes && <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 6 }}>{c.notes}</p>}
                    {c.documentUrl && (
                      <a href={c.documentUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#3b82f6", textDecoration: "none", marginTop: 4, display: "inline-block" }}>
                        Document ↗
                      </a>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => startEdit(c)} style={ghostBtn}>Edit</button>
                    <button onClick={() => remove(c.id)} style={{ ...ghostBtn, color: "var(--color-text-danger)" }}>Delete</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      {label && <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>{label}</label>}
      {children}
    </div>
  )
}

const ghostBtn: React.CSSProperties = {
  fontSize: 12, padding: "4px 10px", borderRadius: 6,
  border: "0.5px solid var(--color-border-secondary)",
  background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)",
}
