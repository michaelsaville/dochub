"use client"

import AppShell from "@/components/AppShell"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"

type PortalUser = {
  id: string
  name: string
  email: string
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
  permissions: Record<string, boolean>
  client: { id: string; name: string }
  sessions: { expiresAt: string }[]
}

const PERMISSION_LABELS: Record<string, string> = {
  assets: "Assets",
  documents: "Docs",
  contacts: "Contacts",
  locations: "Locations",
  licenses: "Licenses",
  domains: "Domains",
}

function formatDate(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function hasActiveSession(sessions: { expiresAt: string }[]): boolean {
  // Any unexpired session counts — don't assume the array is sorted.
  return sessions.some(s => new Date(s.expiresAt) > new Date())
}

export default function PortalAdminPage() {
  const router = useRouter()
  const [users, setUsers] = useState<PortalUser[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filterClient, setFilterClient] = useState("")
  const [filterActive, setFilterActive] = useState<"all" | "active" | "inactive">("all")

  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [resetId, setResetId] = useState<string | null>(null)
  const [resetPassword, setResetPassword] = useState("")
  const [resetting, setResetting] = useState(false)
  const [resetResult, setResetResult] = useState<Record<string, "ok" | "err">>({})
  const [revokingId, setRevokingId] = useState<string | null>(null)

  useEffect(() => {
    fetchUsers()
  }, [])

  function fetchUsers() {
    setLoading(true)
    fetch("/api/portal-admin")
      .then(r => r.ok ? r.json() : [])
      .then(d => setUsers(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false))
  }

  async function toggleActive(user: PortalUser) {
    setTogglingId(user.id)
    try {
      const res = await fetch(`/api/portal-users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !user.isActive }),
      })
      if (res.ok) {
        setUsers(prev => prev.map(u => u.id === user.id
          ? { ...u, isActive: !user.isActive, sessions: !user.isActive ? u.sessions : [] }
          : u
        ))
      }
    } finally {
      setTogglingId(null)
    }
  }

  async function resetPasswordSubmit(userId: string) {
    if (!resetPassword || resetPassword.length < 8) return
    setResetting(true)
    try {
      const res = await fetch(`/api/portal-users/${userId}/set-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: resetPassword }),
      })
      setResetResult(p => ({ ...p, [userId]: res.ok ? "ok" : "err" }))
      if (res.ok) {
        setResetId(null)
        setResetPassword("")
        // Clear sessions from state since reset kills them
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, sessions: [] } : u))
      }
    } finally {
      setResetting(false)
    }
  }

  async function revokeSessions(userId: string) {
    setRevokingId(userId)
    try {
      // Deactivate then reactivate to kill sessions while keeping account active
      await fetch(`/api/portal-users/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      })
      await fetch(`/api/portal-users/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      })
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, sessions: [] } : u))
    } finally {
      setRevokingId(null)
    }
  }

  const clients = Array.from(new Map(users.map(u => [u.client.id, u.client.name])).entries())
    .sort((a, b) => a[1].localeCompare(b[1]))

  const filtered = users.filter(u => {
    if (filterClient && u.client.id !== filterClient) return false
    if (filterActive === "active" && !u.isActive) return false
    if (filterActive === "inactive" && u.isActive) return false
    if (search) {
      const q = search.toLowerCase()
      return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.client.name.toLowerCase().includes(q)
    }
    return true
  })

  const activeCount  = users.filter(u => u.isActive).length
  const sessionCount = users.filter(u => hasActiveSession(u.sessions)).length
  const cols = "1.5fr 2fr 1.5fr 80px 80px 120px 160px"

  return (
    <AppShell>
      <div style={{ padding: "32px", maxWidth: "1100px" }}>
        <div style={{ marginBottom: "24px" }}>
          <h1 style={{ fontSize: "22px", fontWeight: 500, marginBottom: "4px" }}>Client Portal</h1>
          <p style={{ fontSize: "14px", color: "var(--muted)" }}>
            {loading ? "Loading..." : `${users.length} portal users across ${clients.length} clients`}
          </p>
        </div>

        {/* Stats */}
        {!loading && (
          <div style={{ display: "flex", gap: "12px", marginBottom: "24px" }}>
            {[
              { label: "Total users",     value: users.length,                color: "var(--text)"    },
              { label: "Active accounts", value: activeCount,                 color: "var(--accent2)" },
              { label: "Live sessions",   value: sessionCount,                color: "var(--accent)"  },
              { label: "Inactive",        value: users.length - activeCount,  color: "var(--muted)"   },
            ].map(s => (
              <div key={s.label} style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: "10px", padding: "14px 18px", minWidth: "120px" }}>
                <div style={{ fontSize: "22px", fontWeight: 500, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "2px" }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="Search users or clients..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ padding: "7px 12px", fontSize: "13px", borderRadius: "7px", border: "0.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", width: "240px" }}
          />
          <select value={filterClient} onChange={e => setFilterClient(e.target.value)} style={{ padding: "7px 12px", fontSize: "13px", borderRadius: "7px", border: "0.5px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}>
            <option value="">All clients</option>
            {clients.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <select value={filterActive} onChange={e => setFilterActive(e.target.value as any)} style={{ padding: "7px 12px", fontSize: "13px", borderRadius: "7px", border: "0.5px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}>
            <option value="all">All status</option>
            <option value="active">Active only</option>
            <option value="inactive">Inactive only</option>
          </select>
        </div>

        {/* Table */}
        <div style={{ border: "0.5px solid var(--border)", borderRadius: "10px", overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: cols, padding: "9px 16px", background: "var(--surface)", borderBottom: "0.5px solid var(--border)" }}>
            {["Name", "Email", "Client", "Last login", "Status", "Permissions", "Actions"].map(h => (
              <div key={h} style={{ fontSize: "12px", fontWeight: 500, color: "var(--muted)" }}>{h}</div>
            ))}
          </div>

          {loading ? (
            <div style={{ padding: "48px", textAlign: "center", color: "var(--muted)", fontSize: "13px" }}>Loading portal users...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: "48px", textAlign: "center", color: "var(--muted)", fontSize: "13px" }}>
              {search || filterClient || filterActive !== "all" ? "No users match your filters." : "No portal users yet. Add them from a client's Portal tab."}
            </div>
          ) : filtered.map((user, i) => {
            const perms = user.permissions as Record<string, boolean>
            const enabledPerms = Object.entries(PERMISSION_LABELS).filter(([k]) => perms[k]).map(([, l]) => l)
            const online = hasActiveSession(user.sessions)
            const isResetting = resetId === user.id

            return (
              <div key={user.id}>
                {/* Row */}
                <div style={{
                  display: "grid", gridTemplateColumns: cols,
                  padding: "11px 16px", alignItems: "center",
                  borderBottom: (isResetting || i < filtered.length - 1) ? "0.5px solid var(--border)" : "none",
                  background: "var(--bg)",
                }}>
                  {/* Name */}
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--text)" }}>{user.name}</div>
                    {online && <span style={{ fontSize: "10px", color: "var(--accent2)", fontWeight: 600, letterSpacing: "0.05em" }}>● ONLINE</span>}
                  </div>
                  {/* Email */}
                  <div style={{ fontSize: "12px", color: "var(--muted)", fontFamily: "var(--mono)" }}>{user.email}</div>
                  {/* Client */}
                  <div
                    onClick={() => router.push(`/clients/${user.client.id}?tab=Portal`)}
                    style={{ fontSize: "13px", color: "var(--accent)", cursor: "pointer" }}
                  >
                    {user.client.name}
                  </div>
                  {/* Last login */}
                  <div style={{ fontSize: "12px", color: "var(--muted)" }}>
                    {user.lastLoginAt
                      ? formatDate(user.lastLoginAt)
                      : <span style={{ fontSize: "11px", padding: "2px 7px", borderRadius: "5px", fontWeight: 500, background: "rgba(245,158,11,0.14)", color: "#f59e0b" }}>Never logged in</span>}
                  </div>
                  {/* Status badge */}
                  <div>
                    <span style={{
                      fontSize: "11px", padding: "2px 8px", borderRadius: "5px", fontWeight: 500,
                      background: user.isActive ? "rgba(0,212,170,0.12)" : "rgba(100,116,139,0.12)",
                      color: user.isActive ? "var(--accent2)" : "var(--muted)",
                    }}>
                      {user.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                  {/* Permissions */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "3px" }}>
                    {enabledPerms.length === 0 ? (
                      <span style={{ fontSize: "11px", color: "var(--muted)" }}>None</span>
                    ) : enabledPerms.map(p => (
                      <span key={p} style={{ fontSize: "10px", padding: "1px 5px", borderRadius: "4px", background: "rgba(61,111,255,0.1)", color: "var(--accent)", fontWeight: 500 }}>{p}</span>
                    ))}
                  </div>
                  {/* Actions */}
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
                    <button
                      onClick={() => toggleActive(user)}
                      disabled={togglingId === user.id}
                      style={{ fontSize: "11px", padding: "3px 8px", borderRadius: "5px", border: "0.5px solid var(--border)", background: "var(--surface)", color: user.isActive ? "#ef4444" : "var(--accent2)", cursor: "pointer", opacity: togglingId === user.id ? 0.5 : 1 }}
                    >
                      {user.isActive ? "Disable" : "Enable"}
                    </button>
                    <button
                      onClick={() => { setResetId(isResetting ? null : user.id); setResetPassword(""); setResetResult({}) }}
                      style={{ fontSize: "11px", padding: "3px 8px", borderRadius: "5px", border: "0.5px solid var(--border)", background: isResetting ? "var(--accent)" : "var(--surface)", color: isResetting ? "#fff" : "var(--muted)", cursor: "pointer" }}
                    >
                      {isResetting ? "Cancel" : "Reset pw"}
                    </button>
                    {online && (
                      <button
                        onClick={() => revokeSessions(user.id)}
                        disabled={revokingId === user.id}
                        style={{ fontSize: "11px", padding: "3px 8px", borderRadius: "5px", border: "0.5px solid var(--border)", background: "var(--surface)", color: "#f59e0b", cursor: "pointer", opacity: revokingId === user.id ? 0.5 : 1 }}
                      >
                        {revokingId === user.id ? "..." : "Kick"}
                      </button>
                    )}
                  </div>
                </div>

                {/* Password reset inline panel */}
                {isResetting && (
                  <div style={{ padding: "12px 16px", background: "var(--surface)", borderBottom: i < filtered.length - 1 ? "0.5px solid var(--border)" : "none" }}>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <input
                        type="password"
                        placeholder="New password (min 8 chars)"
                        value={resetPassword}
                        onChange={e => setResetPassword(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && resetPasswordSubmit(user.id)}
                        autoFocus
                        style={{ padding: "6px 10px", fontSize: "13px", borderRadius: "6px", border: "0.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", width: "240px" }}
                      />
                      <button
                        onClick={() => resetPasswordSubmit(user.id)}
                        disabled={resetting || resetPassword.length < 8}
                        style={{ fontSize: "13px", fontWeight: 500, padding: "6px 14px", borderRadius: "6px", border: "none", background: "var(--text)", color: "var(--bg)", cursor: "pointer", opacity: resetting || resetPassword.length < 8 ? 0.5 : 1 }}
                      >
                        {resetting ? "Saving..." : "Set password"}
                      </button>
                      {resetResult[user.id] === "ok" && <span style={{ fontSize: "12px", color: "var(--accent2)" }}>Password updated. Sessions revoked.</span>}
                      {resetResult[user.id] === "err" && <span style={{ fontSize: "12px", color: "#ef4444" }}>Failed — try again.</span>}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {!loading && filtered.length > 0 && (
          <div style={{ marginTop: "10px", fontSize: "12px", color: "var(--muted)" }}>
            {filtered.length} user{filtered.length !== 1 ? "s" : ""}
          </div>
        )}
      </div>
    </AppShell>
  )
}
