"use client"

import { useState, useEffect } from "react"
import { DEFAULT_PERMISSIONS, type PortalPermissions } from "@/lib/portal-types"

type PortalUser = {
  id: string
  name: string
  email: string
  isActive: boolean
  isPortalOwner?: boolean
  permissions: PortalPermissions
  lastLoginAt: string | null
  createdAt: string
}

const SECTIONS: { key: keyof PortalPermissions; label: string; description: string }[] = [
  { key: "assets",    label: "Assets",    description: "View devices and equipment" },
  { key: "documents", label: "Documents", description: "View shared documents" },
  { key: "contacts",  label: "Contacts",  description: "View contact directory" },
  { key: "locations", label: "Locations", description: "View office/site locations" },
  { key: "licenses",  label: "Licenses",  description: "View software licenses (no keys)" },
  { key: "domains",   label: "Domains",   description: "View domain & SSL status" },
]

const inp: React.CSSProperties = {
  width: "100%", padding: "8px 12px", fontSize: "14px",
  border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px",
  background: "var(--color-background-primary)", color: "var(--color-text-primary)",
  boxSizing: "border-box",
}
const lbl: React.CSSProperties = { fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }

export default function PortalUsersPanel({ clientId, people = [] }: { clientId: string; people?: { id: string; name: string; email: string | null }[] }) {
  const [users, setUsers] = useState<PortalUser[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [newForm, setNewForm] = useState({ name: "", email: "", password: "", personId: "", permissions: { ...DEFAULT_PERMISSIONS } })
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [resetId, setResetId] = useState<string | null>(null)
  const [resetPassword, setResetPassword] = useState("")
  const [resetting, setResetting] = useState(false)
  const [savingPerms, setSavingPerms] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/clients/${clientId}/portal-users`)
      .then(r => r.json()).then(setUsers).finally(() => setLoading(false))
  }, [clientId])

  async function createUser() {
    if (!newForm.name.trim() || !newForm.email.trim() || !newForm.password) return
    setSaving(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/portal-users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newForm),
      })
      if (res.ok) {
        const user = await res.json()
        setUsers(u => [...u, user])
        setNewForm({ name: "", email: "", password: "", personId: "", permissions: { ...DEFAULT_PERMISSIONS } })
        setShowNew(false)
      } else {
        const e = await res.json()
        alert(e.error || "Failed to create user")
      }
    } finally { setSaving(false) }
  }

  async function toggleOwner(user: PortalUser) {
    const res = await fetch(`/api/portal-users/${user.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPortalOwner: !user.isPortalOwner }),
    })
    if (res.ok) {
      const updated = await res.json()
      setUsers(u => u.map(x => x.id === user.id ? { ...x, ...updated } : x))
    }
  }

  async function toggleActive(user: PortalUser) {
    const res = await fetch(`/api/portal-users/${user.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !user.isActive }),
    })
    if (res.ok) {
      const updated = await res.json()
      setUsers(u => u.map(x => x.id === user.id ? { ...x, ...updated } : x))
    }
  }

  async function savePermissions(user: PortalUser, perms: PortalPermissions) {
    setSavingPerms(user.id)
    try {
      const res = await fetch(`/api/portal-users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: perms }),
      })
      if (res.ok) {
        const updated = await res.json()
        setUsers(u => u.map(x => x.id === user.id ? { ...x, ...updated } : x))
      }
    } finally { setSavingPerms(null) }
  }

  async function deleteUser(id: string) {
    if (!confirm("Remove this portal user? They will no longer be able to log in.")) return
    await fetch(`/api/portal-users/${id}`, { method: "DELETE" })
    setUsers(u => u.filter(x => x.id !== id))
    if (expandedId === id) setExpandedId(null)
  }

  async function doResetPassword(id: string) {
    if (!resetPassword || resetPassword.length < 8) { alert("Password must be at least 8 characters"); return }
    setResetting(true)
    try {
      const res = await fetch(`/api/portal-users/${id}/set-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: resetPassword }),
      })
      if (res.ok) { setResetId(null); setResetPassword(""); alert("Password updated. All active sessions have been invalidated.") }
      else { const e = await res.json(); alert(e.error || "Failed") }
    } finally { setResetting(false) }
  }

  // The customer portal moved to the unified super-portal — /portal here just
  // redirects there, so hand customers the real login URL.
  const portalUrl = "https://portal.pcc2k.com/"

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <div style={{ fontSize: "13px", color: "var(--color-text-muted)" }}>
          Portal login: <code style={{ fontFamily: "monospace", fontSize: "12px" }}>{portalUrl}</code>
        </div>
        <button onClick={() => setShowNew(true)} style={{ fontSize: "14px", fontWeight: 500, padding: "8px 16px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: "pointer" }}>
          Add portal user
        </button>
      </div>

      {/* New user form */}
      {showNew && (
        <div style={{ background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: "10px", padding: "20px", marginBottom: "16px" }}>
          <div style={{ fontSize: "15px", fontWeight: 500, marginBottom: "16px" }}>New portal user</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
            {people.length > 0 && (
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={lbl}>Link to person (fills name + email)</label>
                <select value={newForm.personId} onChange={e => {
                  const p = people.find(x => x.id === e.target.value)
                  // Link a portal user to the directory Person and prefill name/email
                  // from it (blank-only) so the same human isn't re-typed.
                  setNewForm(f => ({ ...f, personId: e.target.value, name: f.name || (p?.name ?? ""), email: f.email || (p?.email ?? "") }))
                }} style={inp}>
                  <option value="">— not linked —</option>
                  {people.map(p => <option key={p.id} value={p.id}>{p.name}{p.email ? ` (${p.email})` : ""}</option>)}
                </select>
              </div>
            )}
            <div>
              <label style={lbl}>Name *</label>
              <input autoFocus value={newForm.name} onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))} style={inp} placeholder="Jane Smith" />
            </div>
            <div>
              <label style={lbl}>Email *</label>
              <input type="email" value={newForm.email} onChange={e => setNewForm(f => ({ ...f, email: e.target.value }))} style={inp} placeholder="jane@client.com" />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={lbl}>Initial password *</label>
              <input type="password" value={newForm.password} onChange={e => setNewForm(f => ({ ...f, password: e.target.value }))} style={inp} placeholder="Min. 8 characters" />
            </div>
          </div>
          <div style={{ marginBottom: "16px" }}>
            <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: "10px" }}>Section access</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "8px" }}>
              {SECTIONS.map(s => (
                <label key={s.key} style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "10px 12px", background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "8px", cursor: "pointer" }}>
                  <input type="checkbox" checked={newForm.permissions[s.key]} onChange={e => setNewForm(f => ({ ...f, permissions: { ...f.permissions, [s.key]: e.target.checked } }))} style={{ marginTop: "2px", flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-primary)" }}>{s.label}</div>
                    <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "1px" }}>{s.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={createUser} disabled={saving} style={{ fontSize: "14px", fontWeight: 500, padding: "8px 18px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>
              {saving ? "Creating..." : "Create user"}
            </button>
            <button onClick={() => setShowNew(false)} style={{ fontSize: "14px", padding: "8px 14px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>Cancel</button>
          </div>
        </div>
      )}

      {loading && <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>Loading...</div>}
      {!loading && users.length === 0 && !showNew && (
        <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>No portal users yet. Add one to give this client access to their portal.</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {users.map(user => {
          const expanded = expandedId === user.id
          const perms: PortalPermissions = {
            assets: !!(user.permissions as any).assets,
            documents: !!(user.permissions as any).documents,
            contacts: !!(user.permissions as any).contacts,
            locations: !!(user.permissions as any).locations,
            licenses: !!(user.permissions as any).licenses,
            domains: !!(user.permissions as any).domains,
          }
          const enabledSections = SECTIONS.filter(s => perms[s.key]).map(s => s.label)

          return (
            <div key={user.id} style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "10px", overflow: "hidden" }}>
              {/* Header row */}
              <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px", background: "var(--color-background-secondary)", cursor: "pointer" }}
                onClick={() => setExpandedId(expanded ? null : user.id)}>
                {/* Active indicator */}
                <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: user.isActive ? "#22c55e" : "#4a5568", flexShrink: 0 }} title={user.isActive ? "Active" : "Disabled"} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-text-primary)" }}>{user.name}</div>
                    {user.isPortalOwner && (
                      <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4, background: "rgba(168,85,247,0.16)", color: "#a855f7", textTransform: "uppercase", letterSpacing: "0.04em" }}>Owner</span>
                    )}
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "1px" }}>
                    {user.email}
                    {user.lastLoginAt && <span> · Last login {new Date(user.lastLoginAt).toLocaleDateString()}</span>}
                    {!user.lastLoginAt && <span> · Never logged in</span>}
                  </div>
                </div>
                <div style={{ fontSize: "12px", color: "var(--color-text-muted)", flexShrink: 0 }}>
                  {enabledSections.length === 0 ? "No access" : enabledSections.join(", ")}
                </div>
                <span style={{ fontSize: "12px", color: "var(--color-text-muted)", flexShrink: 0 }}>{expanded ? "▲" : "▼"}</span>
              </div>

              {/* Expanded panel */}
              {expanded && (
                <div style={{ padding: "16px 20px", background: "var(--color-background-primary)" }}>
                  {/* Status toggle */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", paddingBottom: "16px", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-primary)" }}>Account status</div>
                      <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "2px" }}>
                        {user.isActive ? "User can log in to the portal" : "Login is disabled — existing sessions are invalidated"}
                      </div>
                    </div>
                    <button
                      onClick={() => toggleActive(user)}
                      style={{
                        fontSize: "13px", padding: "6px 14px", borderRadius: "8px", cursor: "pointer",
                        border: "none", fontWeight: 500,
                        background: user.isActive ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)",
                        color: user.isActive ? "#ef4444" : "#22c55e",
                      }}
                    >
                      {user.isActive ? "Disable access" : "Enable access"}
                    </button>
                  </div>

                  {/* Owner toggle */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", paddingBottom: "16px", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-primary)" }}>Vault owner</div>
                      <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "2px" }}>
                        {user.isPortalOwner
                          ? "Sees every credential in this client's portal vault, including private items from other employees. Used for recovery."
                          : "Standard portal user — sees only their own private items plus team and MSP-shared credentials."}
                      </div>
                    </div>
                    <button
                      onClick={() => toggleOwner(user)}
                      style={{
                        fontSize: "13px", padding: "6px 14px", borderRadius: "8px", cursor: "pointer",
                        border: "none", fontWeight: 500,
                        background: user.isPortalOwner ? "rgba(168,85,247,0.16)" : "rgba(148,163,184,0.16)",
                        color: user.isPortalOwner ? "#a855f7" : "var(--color-text-secondary)",
                      }}
                    >
                      {user.isPortalOwner ? "Owner — click to revoke" : "Make vault owner"}
                    </button>
                  </div>

                  {/* Section permissions */}
                  <div style={{ marginBottom: "16px", paddingBottom: "16px", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                    <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-primary)", marginBottom: "10px" }}>Section access</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "8px", marginBottom: "12px" }}>
                      {SECTIONS.map(s => {
                        const checked = perms[s.key]
                        return (
                          <label key={s.key} style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "10px 12px", background: "var(--color-background-secondary)", border: `0.5px solid ${checked ? "var(--color-accent)" : "var(--color-border-tertiary)"}`, borderRadius: "8px", cursor: "pointer" }}>
                            <input type="checkbox" checked={checked} onChange={e => {
                              const newPerms = { ...perms, [s.key]: e.target.checked }
                              setUsers(u => u.map(x => x.id === user.id ? { ...x, permissions: newPerms } : x))
                            }} style={{ marginTop: "2px", flexShrink: 0 }} />
                            <div>
                              <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-primary)" }}>{s.label}</div>
                              <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "1px" }}>{s.description}</div>
                            </div>
                          </label>
                        )
                      })}
                    </div>
                    <button
                      onClick={() => savePermissions(user, perms)}
                      disabled={savingPerms === user.id}
                      style={{ fontSize: "13px", fontWeight: 500, padding: "7px 16px", borderRadius: "7px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer", opacity: savingPerms === user.id ? 0.6 : 1 }}
                    >
                      {savingPerms === user.id ? "Saving..." : "Save permissions"}
                    </button>
                  </div>

                  {/* Password reset */}
                  <div style={{ marginBottom: "16px", paddingBottom: "16px", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                    <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-primary)", marginBottom: "8px" }}>Reset password</div>
                    {resetId === user.id ? (
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <input
                          type="password"
                          autoFocus
                          value={resetPassword}
                          onChange={e => setResetPassword(e.target.value)}
                          placeholder="New password (min. 8 characters)"
                          style={{ ...inp, maxWidth: "320px" }}
                        />
                        <button onClick={() => doResetPassword(user.id)} disabled={resetting} style={{ fontSize: "13px", fontWeight: 500, padding: "7px 14px", borderRadius: "7px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>
                          {resetting ? "Saving..." : "Set password"}
                        </button>
                        <button onClick={() => { setResetId(null); setResetPassword("") }} style={{ fontSize: "13px", padding: "7px 12px", borderRadius: "7px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => { setResetId(user.id); setResetPassword("") }} style={{ fontSize: "13px", padding: "6px 14px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-secondary)", cursor: "pointer", color: "var(--color-text-secondary)" }}>
                        Reset password
                      </button>
                    )}
                  </div>

                  {/* Delete */}
                  <button onClick={() => deleteUser(user.id)} style={{ fontSize: "13px", color: "var(--color-text-danger)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                    Remove portal user
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
