"use client"

import AppShell from "@/components/AppShell"
import { useEffect, useState } from "react"

type StaffRow = { id: string; name: string | null; email: string; role: string; clientIds: string[] }
type ClientRow = { id: string; name: string }

export default function AccessControlPage() {
  const [staff, setStaff] = useState<StaffRow[]>([])
  const [clients, setClients] = useState<ClientRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  async function load() {
    setLoading(true); setError(null)
    try {
      const res = await fetch("/api/admin/staff-client-assignments")
      if (res.status === 401 || res.status === 403) { setError("You must be an admin to manage access."); return }
      const data = await res.json()
      setStaff(data.staff); setClients(data.clients)
    } catch { setError("Failed to load.") }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  function toggle(staffId: string, clientId: string) {
    setStaff(prev => prev.map(s => s.id === staffId
      ? { ...s, clientIds: s.clientIds.includes(clientId) ? s.clientIds.filter(c => c !== clientId) : [...s.clientIds, clientId] }
      : s))
  }

  async function save(s: StaffRow) {
    setSavingId(s.id); setToast(null)
    try {
      const res = await fetch("/api/admin/staff-client-assignments", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffUserId: s.id, clientIds: s.clientIds }),
      })
      setToast(res.ok ? `Saved access for ${s.name || s.email}` : "Save failed")
    } catch { setToast("Save failed") }
    finally { setSavingId(null); setTimeout(() => setToast(null), 3500) }
  }

  return (
    <AppShell>
      <div style={{ padding: "32px", maxWidth: "900px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 600, marginBottom: "4px" }}>Tech access control</h1>
        <p style={{ fontSize: "14px", color: "var(--muted)", marginBottom: "24px" }}>
          Restrict a technician to specific clients. A tech with <strong>no</strong> clients selected sees <strong>all</strong> clients
          (unrestricted). Admins always see everything.
        </p>

        {loading ? (
          <div className="state-box"><div className="spinner" /></div>
        ) : error ? (
          <div style={{ color: "var(--danger)", fontSize: 14, padding: "16px", border: "0.5px solid rgba(255,77,109,0.4)", borderRadius: 8, background: "rgba(255,77,109,0.08)" }}>{error}</div>
        ) : staff.length === 0 ? (
          <div className="state-box"><div className="state-title">No non-admin staff</div>There are no technicians to scope — everyone is an admin (sees all clients).</div>
        ) : staff.map(s => {
          const unrestricted = s.clientIds.length === 0
          return (
            <div key={s.id} style={{ border: "0.5px solid var(--border)", borderRadius: 8, padding: 16, marginBottom: 12, background: "var(--surface)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 500 }}>{s.name || s.email}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)", fontFamily: "var(--mono)" }}>{s.email} · {s.role}</div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, fontFamily: "var(--mono)", fontWeight: 600,
                    background: unrestricted ? "rgba(255,179,71,0.14)" : "rgba(0,212,170,0.13)",
                    color: unrestricted ? "var(--warn)" : "var(--accent2)" }}>
                    {unrestricted ? "ALL CLIENTS" : `${s.clientIds.length} SCOPED`}
                  </span>
                  <button className="btn btn-primary btn-sm" onClick={() => save(s)} disabled={savingId === s.id}>
                    {savingId === s.id ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {clients.map(c => {
                  const on = s.clientIds.includes(c.id)
                  return (
                    <button key={c.id} onClick={() => toggle(s.id, c.id)}
                      style={{ fontSize: 12, padding: "4px 10px", borderRadius: 6, cursor: "pointer",
                        border: `0.5px solid ${on ? "var(--accent)" : "var(--border)"}`,
                        background: on ? "rgba(61,111,255,0.13)" : "transparent",
                        color: on ? "var(--accent)" : "var(--muted)" }}>
                      {c.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      {toast && <div className="toast success" style={{ position: "fixed", top: 20, right: 20, zIndex: 9999 }}>{toast}</div>}
    </AppShell>
  )
}
