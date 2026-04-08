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
  if (!sessions.length) return false
  return new Date(sessions[0].expiresAt) > new Date()
}

export default function PortalAdminPage() {
  const router = useRouter()
  const [users, setUsers] = useState<PortalUser[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filterClient, setFilterClient] = useState("")
  const [filterActive, setFilterActive] = useState<"all" | "active" | "inactive">("all")

  useEffect(() => {
    fetch("/api/portal-admin")
      .then(r => r.ok ? r.json() : [])
      .then(d => { setUsers(Array.isArray(d) ? d : []) })
      .finally(() => setLoading(false))
  }, [])

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

  const activeCount = users.filter(u => u.isActive).length
  const sessionCount = users.filter(u => hasActiveSession(u.sessions)).length

  return (
    <AppShell>
      <div style={{ padding: "32px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }}>
          <div>
            <h1 style={{ fontSize: "22px", fontWeight: 500, marginBottom: "4px" }}>Client Portal</h1>
            <p style={{ fontSize: "14px", color: "var(--muted)" }}>
              {loading ? "Loading..." : `${users.length} portal users across ${clients.length} clients`}
            </p>
          </div>
        </div>

        {/* Stats row */}
        {!loading && (
          <div style={{ display: "flex", gap: "12px", marginBottom: "24px" }}>
            {[
              { label: "Total users", value: users.length, color: "var(--text)" },
              { label: "Active accounts", value: activeCount, color: "var(--accent2)" },
              { label: "Live sessions", value: sessionCount, color: "var(--accent)" },
              { label: "Inactive", value: users.length - activeCount, color: "var(--muted)" },
            ].map(s => (
              <div key={s.label} style={{
                background: "var(--surface)", border: "0.5px solid var(--border)",
                borderRadius: "10px", padding: "14px 18px", minWidth: "120px",
              }}>
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
            style={{
              padding: "7px 12px", fontSize: "13px", borderRadius: "7px",
              border: "0.5px solid var(--border)", background: "var(--bg)",
              color: "var(--text)", width: "240px",
            }}
          />
          <select
            value={filterClient}
            onChange={e => setFilterClient(e.target.value)}
            style={{
              padding: "7px 12px", fontSize: "13px", borderRadius: "7px",
              border: "0.5px solid var(--border)", background: "var(--bg)", color: "var(--text)",
            }}
          >
            <option value="">All clients</option>
            {clients.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
          <select
            value={filterActive}
            onChange={e => setFilterActive(e.target.value as "all" | "active" | "inactive")}
            style={{
              padding: "7px 12px", fontSize: "13px", borderRadius: "7px",
              border: "0.5px solid var(--border)", background: "var(--bg)", color: "var(--text)",
            }}
          >
            <option value="all">All status</option>
            <option value="active">Active only</option>
            <option value="inactive">Inactive only</option>
          </select>
        </div>

        {/* Table */}
        <div style={{ border: "0.5px solid var(--border)", borderRadius: "10px", overflow: "hidden" }}>
          {/* Header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1.5fr 2fr 1.5fr 1fr 1fr 120px",
            padding: "9px 16px",
            background: "var(--surface)",
            borderBottom: "0.5px solid var(--border)",
          }}>
            {["Name", "Email", "Client", "Last login", "Status", "Permissions"].map(h => (
              <div key={h} className="pcc-th">{h}</div>
            ))}
          </div>

          {loading ? (
            <div style={{ padding: "48px", textAlign: "center", color: "var(--muted)", fontSize: "13px" }}>
              Loading portal users...
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: "48px", textAlign: "center", color: "var(--muted)", fontSize: "13px" }}>
              {search || filterClient || filterActive !== "all" ? "No users match your filters." : "No portal users yet. Add them from a client's Portal tab."}
            </div>
          ) : (
            filtered.map((user, i) => {
              const perms = user.permissions as Record<string, boolean>
              const enabledPerms = Object.entries(PERMISSION_LABELS)
                .filter(([key]) => perms[key])
                .map(([, label]) => label)
              const active = hasActiveSession(user.sessions)

              return (
                <div
                  key={user.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.5fr 2fr 1.5fr 1fr 1fr 120px",
                    padding: "11px 16px",
                    borderBottom: i < filtered.length - 1 ? "0.5px solid var(--border)" : "none",
                    background: "var(--bg)",
                    alignItems: "center",
                    cursor: "pointer",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--surface)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "var(--bg)")}
                  onClick={() => router.push(`/clients/${user.client.id}?tab=Portal`)}
                >
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--text)" }}>{user.name}</div>
                    {active && (
                      <span style={{ fontSize: "10px", color: "var(--accent2)", fontWeight: 600, letterSpacing: "0.05em" }}>
                        ● ONLINE
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--muted)", fontFamily: "var(--mono)" }}>{user.email}</div>
                  <div
                    style={{ fontSize: "13px", color: "var(--accent)", cursor: "pointer", textDecoration: "none" }}
                    onClick={e => { e.stopPropagation(); router.push(`/clients/${user.client.id}?tab=Portal`) }}
                  >
                    {user.client.name}
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--muted)" }}>{formatDate(user.lastLoginAt)}</div>
                  <div>
                    <span style={{
                      fontSize: "11px", padding: "2px 8px", borderRadius: "5px", fontWeight: 500,
                      background: user.isActive ? "rgba(0,212,170,0.12)" : "rgba(100,116,139,0.12)",
                      color: user.isActive ? "var(--accent2)" : "var(--muted)",
                    }}>
                      {user.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "3px" }}>
                    {enabledPerms.length === 0 ? (
                      <span style={{ fontSize: "11px", color: "var(--muted)" }}>None</span>
                    ) : enabledPerms.map(p => (
                      <span key={p} style={{
                        fontSize: "10px", padding: "1px 5px", borderRadius: "4px",
                        background: "rgba(61,111,255,0.1)", color: "var(--accent)",
                        fontWeight: 500,
                      }}>{p}</span>
                    ))}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {!loading && filtered.length > 0 && (
          <div style={{ marginTop: "10px", fontSize: "12px", color: "var(--muted)" }}>
            {filtered.length} user{filtered.length !== 1 ? "s" : ""} — click a row to manage in client Portal tab
          </div>
        )}
      </div>
    </AppShell>
  )
}
