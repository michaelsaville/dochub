"use client"

import { useState, useEffect, useRef } from "react"
import { usePortalUser } from "../layout"

type Visibility = "PRIVATE" | "TEAM" | "MSP_SHARED"
type VaultEntry = {
  id: string
  label: string
  username: string | null
  url: string | null
  notes: string | null
  hasTotp: boolean
  visibility: Visibility
  ownedByUserId: string | null
  createdByStaffId: string | null
  createdAt: string
  updatedAt: string
}
type Revealed = { password: string | null; totpCode: string | null; totpSecret: string | null }

const inp: React.CSSProperties = {
  width: "100%", padding: "8px 12px", fontSize: "14px",
  border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px",
  background: "var(--color-background-primary)", color: "var(--color-text-primary)",
  boxSizing: "border-box",
}
const card: React.CSSProperties = {
  background: "var(--color-background-secondary)",
  border: "0.5px solid var(--color-border-tertiary)",
  borderRadius: "10px",
  padding: "20px",
  marginBottom: "16px",
}
const btnPrimary: React.CSSProperties = {
  padding: "7px 14px", fontSize: "13px", fontWeight: 500, borderRadius: "7px",
  background: "var(--accent)", color: "#fff", border: "none", cursor: "pointer",
}
const btnSecondary: React.CSSProperties = {
  padding: "7px 14px", fontSize: "13px", borderRadius: "7px",
  background: "transparent", color: "var(--color-text-secondary)",
  border: "0.5px solid var(--color-border-secondary)", cursor: "pointer",
}
const btnDanger: React.CSSProperties = {
  padding: "5px 10px", fontSize: "12px", borderRadius: "6px",
  background: "transparent", color: "#ef4444",
  border: "0.5px solid #ef4444", cursor: "pointer",
}

const EMPTY_FORM = { label: "", username: "", password: "", totp: "", url: "", notes: "", visibility: "PRIVATE" as Visibility }

const visibilityLabel: Record<Visibility, string> = {
  PRIVATE: "Private",
  TEAM: "Team",
  MSP_SHARED: "Shared with MSP",
}
const visibilityColor: Record<Visibility, string> = {
  PRIVATE: "#6b7280",
  TEAM: "#3b82f6",
  MSP_SHARED: "#a855f7",
}

export default function PortalVaultPage() {
  const user = usePortalUser()
  const [unlocked, setUnlocked] = useState(false)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [unlockPassword, setUnlockPassword] = useState("")
  const [unlocking, setUnlocking] = useState(false)
  const [items, setItems] = useState<VaultEntry[]>([])
  const [revealed, setRevealed] = useState<Record<string, Revealed>>({})
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ ...EMPTY_FORM })
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ ...EMPTY_FORM })
  const [filter, setFilter] = useState<"ALL" | Visibility>("ALL")
  const [search, setSearch] = useState("")
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null)
  const [secLeft, setSecLeft] = useState(30 - (Math.floor(Date.now() / 1000) % 30))
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => { loadSession() }, [])
  useEffect(() => { if (unlocked) loadItems() }, [unlocked])

  // TOTP boundary refresh
  useEffect(() => {
    refreshTimer.current = setInterval(() => {
      const s = 30 - (Math.floor(Date.now() / 1000) % 30)
      setSecLeft(s)
      if (s === 30) {
        Object.keys(revealed).forEach(id => { if (revealed[id].totpSecret) refetchReveal(id) })
      }
    }, 1000)
    return () => { if (refreshTimer.current) clearInterval(refreshTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed])

  function flash(type: "ok" | "err", text: string) {
    setMsg({ type, text })
    setTimeout(() => setMsg(null), 4000)
  }

  async function loadSession() {
    const r = await fetch("/api/portal/vault/session")
    if (r.ok) {
      const d = await r.json()
      setUnlocked(d.unlocked)
      setExpiresAt(d.expiresAt || null)
    }
  }

  async function loadItems() {
    const r = await fetch("/api/portal/vault")
    if (r.ok) setItems(await r.json())
  }

  async function unlock() {
    if (!unlockPassword) { flash("err", "Enter your portal password"); return }
    setUnlocking(true)
    try {
      const r = await fetch("/api/portal/vault/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: unlockPassword }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        flash("err", d.error || "Unlock failed")
        return
      }
      const d = await r.json()
      setUnlocked(true)
      setExpiresAt(d.expiresAt)
      setUnlockPassword("")
      flash("ok", "Vault unlocked for 15 minutes")
    } finally {
      setUnlocking(false)
    }
  }

  async function lock() {
    await fetch("/api/portal/vault/session", { method: "DELETE" })
    setUnlocked(false)
    setExpiresAt(null)
    setItems([])
    setRevealed({})
  }

  async function reveal(id: string) {
    const r = await fetch(`/api/portal/vault/${id}/reveal`)
    if (!r.ok) { flash("err", "Could not reveal — vault may be locked"); return }
    const d = await r.json()
    setRevealed(prev => ({ ...prev, [id]: d }))
  }

  async function refetchReveal(id: string) {
    const r = await fetch(`/api/portal/vault/${id}/reveal`)
    if (!r.ok) return
    const d = await r.json()
    setRevealed(prev => ({ ...prev, [id]: d }))
  }

  async function addItem() {
    if (!addForm.label.trim()) { flash("err", "Label is required"); return }
    const r = await fetch("/api/portal/vault", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(addForm),
    })
    if (!r.ok) { flash("err", "Failed to add"); return }
    setShowAdd(false)
    setAddForm({ ...EMPTY_FORM })
    loadItems()
    flash("ok", "Added")
  }

  async function saveEdit(id: string) {
    const r = await fetch(`/api/portal/vault/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    })
    if (!r.ok) { flash("err", "Failed to save"); return }
    setEditId(null)
    loadItems()
    flash("ok", "Saved")
  }

  async function deleteItem(id: string) {
    if (!confirm("Delete this credential?")) return
    const r = await fetch(`/api/portal/vault/${id}`, { method: "DELETE" })
    if (!r.ok) { flash("err", "Delete failed"); return }
    setItems(prev => prev.filter(x => x.id !== id))
    flash("ok", "Deleted")
  }

  function startEdit(item: VaultEntry) {
    setEditId(item.id)
    setEditForm({
      label: item.label,
      username: item.username || "",
      password: "",
      totp: "",
      url: item.url || "",
      notes: item.notes || "",
      visibility: item.visibility,
    })
  }

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => flash("ok", `${label} copied`))
  }

  function canEdit(item: VaultEntry): boolean {
    if (!user) return false
    if (item.ownedByUserId === user.id) return true
    if (user.isPortalOwner) return true
    return false
  }

  const filtered = items.filter(i => {
    if (filter !== "ALL" && i.visibility !== filter) return false
    if (search) {
      const s = search.toLowerCase()
      if (!i.label.toLowerCase().includes(s) &&
          !(i.username || "").toLowerCase().includes(s) &&
          !(i.url || "").toLowerCase().includes(s)) return false
    }
    return true
  })

  return (
    <>
      {msg && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 9999,
          padding: "10px 16px", borderRadius: "8px", fontSize: "13px",
          background: msg.type === "ok" ? "#166534" : "#7f1d1d",
          color: "#fff", boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        }}>{msg.text}</div>
      )}

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: "22px", fontWeight: 600, marginBottom: 4 }}>Password Vault</h1>
        <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>
          Store passwords for your team. Mark them <em>Private</em>, share with the <em>Team</em>, or share with your <em>MSP</em>.
          {user?.isPortalOwner && <span style={{ marginLeft: 6, color: "var(--accent)" }}>· Owner mode: you can see everything</span>}
        </div>
      </div>

      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: "15px" }}>
              {unlocked ? "Vault Unlocked" : "Vault Locked"}
            </div>
            <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>
              {unlocked
                ? `Expires ${expiresAt ? new Date(expiresAt).toLocaleTimeString() : "soon"}`
                : "Re-enter your portal password to view stored credentials"}
            </div>
          </div>
          {unlocked ? (
            <button style={btnSecondary} onClick={lock}>Lock</button>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="password"
                placeholder="Portal password"
                value={unlockPassword}
                onChange={e => setUnlockPassword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && unlock()}
                style={{ ...inp, width: 220 }}
              />
              <button style={btnPrimary} onClick={unlock} disabled={unlocking}>
                {unlocking ? "Unlocking…" : "Unlock"}
              </button>
            </div>
          )}
        </div>
      </div>

      {unlocked && (
        <>
          <div style={card}>
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              <input
                placeholder="Search…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ ...inp, maxWidth: 260 }}
              />
              <select value={filter} onChange={e => setFilter(e.target.value as any)} style={{ ...inp, maxWidth: 200 }}>
                <option value="ALL">All credentials</option>
                <option value="PRIVATE">Private only</option>
                <option value="TEAM">Team only</option>
                <option value="MSP_SHARED">Shared with MSP</option>
              </select>
              <div style={{ flex: 1 }} />
              {!showAdd && (
                <button style={btnPrimary} onClick={() => setShowAdd(true)}>+ Add Credential</button>
              )}
            </div>

            {showAdd && (
              <div style={{ padding: 12, background: "var(--color-background-primary)", borderRadius: 8, border: "0.5px solid var(--color-border-secondary)", marginBottom: 16 }}>
                <div style={{ fontWeight: 500, fontSize: "13px", marginBottom: 10 }}>New Credential</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <input placeholder="Label *" value={addForm.label} onChange={e => setAddForm(f => ({ ...f, label: e.target.value }))} style={inp} />
                  <input placeholder="Username" value={addForm.username} onChange={e => setAddForm(f => ({ ...f, username: e.target.value }))} style={inp} />
                  <input placeholder="Password" type="password" value={addForm.password} onChange={e => setAddForm(f => ({ ...f, password: e.target.value }))} style={inp} />
                  <input placeholder="TOTP secret (base32, optional)" value={addForm.totp} onChange={e => setAddForm(f => ({ ...f, totp: e.target.value }))} style={inp} />
                  <input placeholder="URL" value={addForm.url} onChange={e => setAddForm(f => ({ ...f, url: e.target.value }))} style={inp} />
                  <input placeholder="Notes" value={addForm.notes} onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))} style={inp} />
                  <select value={addForm.visibility} onChange={e => setAddForm(f => ({ ...f, visibility: e.target.value as Visibility }))} style={inp}>
                    <option value="PRIVATE">Private — only me</option>
                    <option value="TEAM">Team — everyone in {user?.client.name}</option>
                    <option value="MSP_SHARED">Shared with MSP — your team + the MSP</option>
                  </select>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button style={btnPrimary} onClick={addItem}>Add</button>
                    <button style={btnSecondary} onClick={() => { setShowAdd(false); setAddForm({ ...EMPTY_FORM }) }}>Cancel</button>
                  </div>
                </div>
              </div>
            )}

            {filtered.length === 0 && (
              <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", textAlign: "center", padding: "32px 0" }}>
                {items.length === 0 ? "No credentials yet — add one to get started." : "Nothing matches your filter."}
              </div>
            )}

            {filtered.map(item => {
              const editable = canEdit(item)
              const isMine = user && item.ownedByUserId === user.id
              return (
                <div key={item.id} style={{ marginBottom: 12, padding: 12, background: "var(--color-background-primary)", borderRadius: 8, border: "0.5px solid var(--color-border-secondary)" }}>
                  {editId === item.id ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <input placeholder="Label *" value={editForm.label} onChange={e => setEditForm(f => ({ ...f, label: e.target.value }))} style={inp} />
                      <input placeholder="Username" value={editForm.username} onChange={e => setEditForm(f => ({ ...f, username: e.target.value }))} style={inp} />
                      <input placeholder="Password (leave blank to keep)" type="password" value={editForm.password} onChange={e => setEditForm(f => ({ ...f, password: e.target.value }))} style={inp} />
                      <input placeholder="TOTP secret (leave blank to keep)" value={editForm.totp} onChange={e => setEditForm(f => ({ ...f, totp: e.target.value }))} style={inp} />
                      <input placeholder="URL" value={editForm.url} onChange={e => setEditForm(f => ({ ...f, url: e.target.value }))} style={inp} />
                      <input placeholder="Notes" value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} style={inp} />
                      <select value={editForm.visibility} onChange={e => setEditForm(f => ({ ...f, visibility: e.target.value as Visibility }))} style={inp}>
                        <option value="PRIVATE">Private</option>
                        <option value="TEAM">Team</option>
                        <option value="MSP_SHARED">Shared with MSP</option>
                      </select>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button style={btnPrimary} onClick={() => saveEdit(item.id)}>Save</button>
                        <button style={btnSecondary} onClick={() => setEditId(null)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <div style={{ fontWeight: 500, fontSize: "14px" }}>{item.label}</div>
                          <span style={{
                            fontSize: "10px", fontWeight: 600, letterSpacing: "0.04em",
                            padding: "2px 6px", borderRadius: 4,
                            background: visibilityColor[item.visibility] + "22",
                            color: visibilityColor[item.visibility],
                            textTransform: "uppercase",
                          }}>{visibilityLabel[item.visibility]}</span>
                          {!isMine && item.ownedByUserId && (
                            <span style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>· shared</span>
                          )}
                        </div>
                        {editable && (
                          <div style={{ display: "flex", gap: 6 }}>
                            <button style={btnSecondary} onClick={() => startEdit(item)}>Edit</button>
                            <button style={btnDanger} onClick={() => deleteItem(item.id)}>Delete</button>
                          </div>
                        )}
                      </div>
                      {item.username && <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: 2 }}>{item.username}</div>}
                      {item.url && <div style={{ fontSize: "12px", marginTop: 2 }}><a href={item.url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>{item.url}</a></div>}
                      {item.notes && <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: 4, whiteSpace: "pre-wrap" }}>{item.notes}</div>}
                      <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {!revealed[item.id] ? (
                          <button style={{ ...btnSecondary, fontSize: "12px", padding: "4px 10px" }} onClick={() => reveal(item.id)}>Reveal</button>
                        ) : (
                          <>
                            {revealed[item.id].password && (
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <code style={{ fontSize: "12px", background: "var(--color-background-secondary)", padding: "2px 8px", borderRadius: 4 }}>{revealed[item.id].password}</code>
                                <button style={{ ...btnSecondary, fontSize: "11px", padding: "2px 8px" }} onClick={() => copy(revealed[item.id].password!, "Password")}>Copy</button>
                              </div>
                            )}
                            {revealed[item.id].totpCode && (
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <code style={{ fontSize: "14px", fontWeight: 600, letterSpacing: "0.1em", color: secLeft <= 5 ? "#f59e0b" : "var(--color-text-primary)" }}>
                                  {revealed[item.id].totpCode}
                                </code>
                                <span style={{ fontSize: "11px", color: secLeft <= 5 ? "#f59e0b" : "var(--color-text-secondary)" }}>{secLeft}s</span>
                                <button style={{ ...btnSecondary, fontSize: "11px", padding: "2px 8px" }} onClick={() => copy(revealed[item.id].totpCode!, "TOTP code")}>Copy</button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </>
  )
}
