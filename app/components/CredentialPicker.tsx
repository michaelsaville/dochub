"use client"

import { useState } from "react"

type Cred = { id: string; label: string; username?: string | null }

/**
 * Shared credential picker with inline "create-and-link" so a tech never has
 * to leave the panel, go to the Credentials tab, create a login, and come back.
 *
 * Self-contained on purpose: it keeps a local list of credentials it created
 * this session and merges them with the passed-in `credentials`, so the new
 * entry appears in the dropdown immediately without depending on the parent
 * refetching (the old `↻ refresh` + stale-prop-guard workaround). The selected
 * id is reported via onChange; the parent persists it on its own save.
 */
export default function CredentialPicker({
  clientId, value, onChange, credentials,
  label = "Credential", emptyLabel = "— None —",
  prefillLabel = "", prefillUsername = "",
}: {
  clientId: string
  value: string
  onChange: (id: string) => void
  credentials: Cred[]
  label?: string
  emptyLabel?: string
  prefillLabel?: string
  prefillUsername?: string
}) {
  const [created, setCreated] = useState<Cred[]>([])
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ label: "", username: "", password: "" })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const all = [...credentials, ...created.filter(c => !credentials.some(x => x.id === c.id))]

  const inp = { width: "100%", padding: "8px 12px", fontSize: 14, border: "0.5px solid var(--color-border-secondary)", borderRadius: 8, background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }
  const lbl = { fontSize: 13, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }

  function openAdd() {
    setForm({ label: prefillLabel, username: prefillUsername, password: "" })
    setErr(null)
    setAdding(true)
  }

  async function create() {
    if (!form.label.trim() || !form.password.trim()) { setErr("Label and password are required"); return }
    setSaving(true); setErr(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/credentials`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: form.label.trim(), username: form.username.trim() || null, password: form.password }),
      })
      if (res.ok) {
        const c = await res.json()
        setCreated(prev => [...prev, { id: c.id, label: c.label, username: c.username }])
        onChange(c.id)
        setAdding(false)
      } else {
        const e = await res.json().catch(() => ({}))
        setErr(e.error || "Failed to create credential")
      }
    } finally { setSaving(false) }
  }

  return (
    <div>
      <label style={lbl}>{label}</label>
      {adding ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: 8, border: "0.5px solid var(--color-border-secondary)", borderRadius: 8, background: "var(--color-background-secondary)" }}>
          <input style={inp} autoFocus value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="Label (e.g. Office WiFi PSK)" />
          <input style={inp} value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder="Username (optional)" />
          <input style={inp} type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Password / PSK" />
          {err && <span style={{ fontSize: 12, color: "#ef4444" }}>{err}</span>}
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" onClick={create} disabled={saving} style={{ fontSize: 12, fontWeight: 500, padding: "5px 12px", borderRadius: 6, border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>{saving ? "Saving…" : "Save to vault"}</button>
            <button type="button" onClick={() => setAdding(false)} style={{ fontSize: 12, padding: "5px 10px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>Cancel</button>
          </div>
        </div>
      ) : (
        <select style={inp} value={value} onChange={e => { if (e.target.value === "__new__") openAdd(); else onChange(e.target.value) }}>
          <option value="">{emptyLabel}</option>
          {all.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          <option value="__new__">+ New credential…</option>
        </select>
      )}
    </div>
  )
}
