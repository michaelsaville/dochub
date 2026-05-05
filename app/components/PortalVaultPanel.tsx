"use client"

import { useState, useEffect } from "react"

type SharedCred = {
  id: string
  label: string
  username: string | null
  url: string | null
  notes: string | null
  password: string | null
  totpCode: string | null
  hasTotp: boolean
  ownedByUserId: string | null
  createdByStaffId: string | null
  createdAt: string
  updatedAt: string
}

const inp: React.CSSProperties = {
  width: "100%", padding: "8px 12px", fontSize: "14px",
  border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px",
  background: "var(--color-background-primary)", color: "var(--color-text-primary)",
  boxSizing: "border-box",
}

export default function PortalVaultPanel({ clientId }: { clientId: string }) {
  const [items, setItems] = useState<SharedCred[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ label: "", username: "", password: "", totp: "", url: "", notes: "" })
  const [reveal, setReveal] = useState<Record<string, boolean>>({})
  const [secLeft, setSecLeft] = useState(30 - (Math.floor(Date.now() / 1000) % 30))

  useEffect(() => { load() }, [clientId])
  useEffect(() => {
    const t = setInterval(() => {
      const s = 30 - (Math.floor(Date.now() / 1000) % 30)
      setSecLeft(s)
      if (s === 30) load() // refresh TOTP at boundary
    }, 1000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function load() {
    const r = await fetch(`/api/clients/${clientId}/portal-vault`)
    if (r.ok) setItems(await r.json())
    setLoading(false)
  }

  async function add() {
    if (!form.label.trim()) { alert("Label is required"); return }
    const r = await fetch(`/api/clients/${clientId}/portal-vault`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
    if (!r.ok) { alert("Failed to add"); return }
    setForm({ label: "", username: "", password: "", totp: "", url: "", notes: "" })
    setShowAdd(false)
    load()
  }

  async function del(id: string) {
    if (!confirm("Delete this shared credential? This will also remove it from the client portal.")) return
    const r = await fetch(`/api/clients/${clientId}/portal-vault/${id}`, { method: "DELETE" })
    if (!r.ok) { alert("Delete failed"); return }
    setItems(prev => prev.filter(x => x.id !== id))
  }

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text)
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: "13px", color: "var(--color-text-muted)" }}>
          Credentials shared by this client's portal users with the MSP. Items added here are visible to all portal users in their vault.
        </div>
        {!showAdd && (
          <button onClick={() => setShowAdd(true)} style={{ fontSize: 14, fontWeight: 500, padding: "8px 16px", borderRadius: 8, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: "pointer", flexShrink: 0 }}>
            Add shared credential
          </button>
        )}
      </div>

      {showAdd && (
        <div style={{ background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: 10, padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 16 }}>New shared credential</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input placeholder="Label *" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} style={inp} />
            <input placeholder="Username" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} style={inp} />
            <input placeholder="Password" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} style={inp} />
            <input placeholder="TOTP secret (base32, optional)" value={form.totp} onChange={e => setForm(f => ({ ...f, totp: e.target.value }))} style={inp} />
            <input placeholder="URL" value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} style={inp} />
            <input placeholder="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={inp} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={add} style={{ fontSize: 14, fontWeight: 500, padding: "8px 18px", borderRadius: 8, border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>Save</button>
              <button onClick={() => setShowAdd(false)} style={{ fontSize: 14, padding: "8px 14px", borderRadius: 8, border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {loading && <div style={{ color: "var(--color-text-secondary)", fontSize: 14 }}>Loading...</div>}
      {!loading && items.length === 0 && (
        <div style={{ color: "var(--color-text-secondary)", fontSize: 14 }}>No shared credentials yet.</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map(item => {
          const isRevealed = !!reveal[item.id]
          return (
            <div key={item.id} style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: 10, padding: "12px 16px", background: "var(--color-background-secondary)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)" }}>{item.label}</div>
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 2 }}>
                    {item.username && <span>{item.username} · </span>}
                    {item.ownedByUserId
                      ? <span>shared by client</span>
                      : <span>added by MSP</span>}
                  </div>
                  {item.url && <div style={{ fontSize: 12, marginTop: 2 }}><a href={item.url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>{item.url}</a></div>}
                  {item.notes && <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4, whiteSpace: "pre-wrap" }}>{item.notes}</div>}
                </div>
                <button onClick={() => del(item.id)} style={{ fontSize: 12, color: "#ef4444", background: "transparent", border: "0.5px solid #ef4444", borderRadius: 6, padding: "4px 10px", cursor: "pointer", flexShrink: 0 }}>Delete</button>
              </div>
              <div style={{ marginTop: 10, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                {item.password && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <code style={{ fontSize: 12, background: "var(--color-background-primary)", padding: "3px 10px", borderRadius: 4, fontFamily: "monospace" }}>
                      {isRevealed ? item.password : "••••••••••"}
                    </code>
                    <button onClick={() => setReveal(p => ({ ...p, [item.id]: !p[item.id] }))} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "transparent", color: "var(--color-text-secondary)", cursor: "pointer" }}>
                      {isRevealed ? "Hide" : "Reveal"}
                    </button>
                    <button onClick={() => copy(item.password!, "Password")} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "transparent", color: "var(--color-text-secondary)", cursor: "pointer" }}>Copy</button>
                  </div>
                )}
                {item.totpCode && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <code style={{ fontSize: 14, fontWeight: 600, letterSpacing: "0.1em", color: secLeft <= 5 ? "#f59e0b" : "var(--color-text-primary)" }}>{item.totpCode}</code>
                    <span style={{ fontSize: 11, color: secLeft <= 5 ? "#f59e0b" : "var(--color-text-secondary)" }}>{secLeft}s</span>
                    <button onClick={() => copy(item.totpCode!, "TOTP code")} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "transparent", color: "var(--color-text-secondary)", cursor: "pointer" }}>Copy</button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
