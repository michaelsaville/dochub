"use client"

import AppShell from "@/components/AppShell"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"

type Alarm = {
  id: string
  severity: "INFO" | "WARNING" | "CRITICAL"
  status: "ACTIVE" | "DISMISSED" | "RESOLVED"
  type: string
  message: string
  details: string | null
  createdAt: string
  dismissedAt: string | null
  resolvedAt: string | null
  client: { id: string; name: string }
}

type Client = { id: string; name: string }

const severityConfig = {
  CRITICAL: { label: "Critical", color: "var(--danger)", bg: "rgba(255,77,109,0.12)" },
  WARNING:  { label: "Warning",  color: "var(--warn)", bg: "rgba(255,179,71,0.12)" },
  INFO:     { label: "Info",     color: "#818cf8", bg: "rgba(129,140,248,0.14)" },
}

const inputStyle = {
  width: "100%", padding: "8px 12px", fontSize: "14px",
  border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px",
  background: "var(--color-background-primary)", color: "var(--color-text-primary)",
  boxSizing: "border-box" as const,
}
const labelStyle = { fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }

export default function AlarmsPage() {
  const router = useRouter()
  const [alarms, setAlarms] = useState<Alarm[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<"ACTIVE" | "DISMISSED" | "RESOLVED" | "ALL">("ACTIVE")
  const [severityFilter, setSeverityFilter] = useState<"ALL" | "CRITICAL" | "WARNING" | "INFO">("ALL")
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [checkingWarranties, setCheckingWarranties] = useState(false)
  const [warrantyResult, setWarrantyResult] = useState<{ raised: number; skipped: number } | null>(null)
  const [form, setForm] = useState({ clientId: "", severity: "WARNING", type: "", message: "", details: "" })

  useEffect(() => {
    fetchAlarms()
    fetch("/api/clients").then(r => r.json()).then(setClients).catch(() => {})
  }, [statusFilter, severityFilter])

  async function fetchAlarms() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== "ALL") params.set("status", statusFilter)
      if (severityFilter !== "ALL") params.set("severity", severityFilter)
      const res = await fetch("/api/alarms?" + params)
      setAlarms(await res.json())
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function updateAlarm(id: string, action: "dismiss" | "resolve" | "reopen") {
    try {
      const res = await fetch(`/api/alarms/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      if (res.ok) {
        const updated = await res.json()
        setAlarms(a => a.map(x => x.id === id ? updated : x).filter(x =>
          statusFilter === "ALL" || x.status === statusFilter
        ))
      }
    } catch (e) { console.error(e) }
  }

  async function createAlarm() {
    if (!form.clientId || !form.type.trim() || !form.message.trim()) return
    setSaving(true)
    try {
      const res = await fetch("/api/alarms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        setForm({ clientId: "", severity: "WARNING", type: "", message: "", details: "" })
        setShowCreate(false)
        await fetchAlarms()
      }
    } catch (e) { console.error(e) }
    finally { setSaving(false) }
  }

  async function checkWarranties() {
    setCheckingWarranties(true)
    setWarrantyResult(null)
    try {
      const res = await fetch("/api/alarms/check-warranties", { method: "POST" })
      const data = await res.json()
      setWarrantyResult(data)
      await fetchAlarms()
    } catch (e) { console.error(e) }
    finally { setCheckingWarranties(false) }
  }

  const statusTabs: Array<"ACTIVE" | "DISMISSED" | "RESOLVED" | "ALL"> = ["ACTIVE", "DISMISSED", "RESOLVED", "ALL"]
  const counts = { ACTIVE: 0, DISMISSED: 0, RESOLVED: 0, ALL: 0 }

  return (
    <AppShell>
      <div style={{ padding: "32px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }}>
          <div>
            <h1 style={{ fontSize: "22px", fontWeight: 500, marginBottom: "4px" }}>Alarms</h1>
            <p style={{ fontSize: "14px", color: "var(--color-text-secondary)" }}>
              {loading ? "Loading..." : `${alarms.length} alarm${alarms.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={checkWarranties} disabled={checkingWarranties}
              className="btn btn-secondary"
            >
              {checkingWarranties ? "Checking..." : "Check warranties"}
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="btn btn-secondary"
            >
              New alarm
            </button>
          </div>
        </div>

        {warrantyResult && (
          <div style={{ background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", padding: "12px 16px", marginBottom: "16px", fontSize: "13px", color: "var(--color-text-secondary)" }}>
            Warranty check complete — {warrantyResult.raised} new alarm{warrantyResult.raised !== 1 ? "s" : ""} raised, {warrantyResult.skipped} already existed.
          </div>
        )}

        {showCreate && (
          <div style={{ background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: "10px", padding: "20px", marginBottom: "20px", maxWidth: "560px" }}>
            <div style={{ fontSize: "15px", fontWeight: 500, marginBottom: "16px" }}>New alarm</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Client *</label>
                <select value={form.clientId} onChange={e => setForm(f => ({ ...f, clientId: e.target.value }))} style={inputStyle}>
                  <option value="">Select client...</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Severity</label>
                <select value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))} style={inputStyle}>
                  <option value="CRITICAL">Critical</option>
                  <option value="WARNING">Warning</option>
                  <option value="INFO">Info</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Type *</label>
                <input style={inputStyle} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} placeholder="e.g. BACKUP_FAILURE" />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Message *</label>
                <input style={inputStyle} value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Details</label>
                <textarea rows={2} style={{ ...inputStyle, resize: "vertical" }} value={form.details} onChange={e => setForm(f => ({ ...f, details: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={createAlarm} disabled={saving} style={{ fontSize: "14px", fontWeight: 500, padding: "8px 16px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>
                {saving ? "Saving..." : "Create alarm"}
              </button>
              <button onClick={() => setShowCreate(false)} className="btn btn-ghost">Cancel</button>
            </div>
          </div>
        )}

        {/* Filters */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div style={{ display: "flex", gap: "4px", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
            {statusTabs.map(s => (
              <button key={s} onClick={() => setStatusFilter(s)} style={{
                fontSize: "13px", padding: "6px 14px", background: "none", border: "none", cursor: "pointer",
                color: statusFilter === s ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                fontWeight: statusFilter === s ? 500 : 400,
                borderBottom: statusFilter === s ? "2px solid var(--color-text-primary)" : "2px solid transparent",
                marginBottom: "-0.5px",
              }}>{s.charAt(0) + s.slice(1).toLowerCase()}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            {(["ALL", "CRITICAL", "WARNING", "INFO"] as const).map(sev => (
              <button key={sev} onClick={() => setSeverityFilter(sev)} style={{
                fontSize: "12px", padding: "4px 10px", borderRadius: "6px", cursor: "pointer",
                border: "0.5px solid var(--color-border-secondary)",
                background: severityFilter === sev ? "var(--color-text-primary)" : "transparent",
                color: severityFilter === sev ? "var(--color-background-primary)" : "var(--color-text-secondary)",
              }}>
                {sev === "ALL" ? "All severities" : severityConfig[sev].label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "10px", overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "100px 1fr 140px 200px 110px 140px", padding: "10px 16px", background: "var(--color-background-secondary)", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
            {["Severity", "Message", "Client", "Type", "Created", "Actions"].map(h => (
              <div key={h} style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-secondary)" }}>{h}</div>
            ))}
          </div>

          {loading ? (
            <div style={{ padding: "48px 16px", textAlign: "center", fontSize: "14px", color: "var(--color-text-secondary)" }}>Loading...</div>
          ) : alarms.length === 0 ? (
            <div style={{ padding: "48px 16px", textAlign: "center", fontSize: "14px", color: "var(--color-text-secondary)" }}>
              No {statusFilter !== "ALL" ? statusFilter.toLowerCase() : ""} alarms.
            </div>
          ) : alarms.map((alarm, i) => {
            const cfg = severityConfig[alarm.severity]
            return (
              <div key={alarm.id} style={{
                display: "grid", gridTemplateColumns: "100px 1fr 140px 200px 110px 140px",
                padding: "12px 16px", alignItems: "center",
                borderBottom: i < alarms.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none",
                background: "var(--color-background-primary)",
              }}>
                <div>
                  <span style={{
                    fontSize: "11px", fontWeight: 600, padding: "3px 7px", borderRadius: "5px",
                    color: cfg.color, background: cfg.bg, letterSpacing: "0.03em",
                  }}>
                    {cfg.label.toUpperCase()}
                  </span>
                </div>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-primary)" }}>{alarm.message}</div>
                  {alarm.details && <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "2px" }}>{alarm.details}</div>}
                </div>
                <div
                  onClick={() => router.push(`/clients/${alarm.client.id}`)}
                  style={{ fontSize: "13px", color: "var(--color-text-secondary)", cursor: "pointer", textDecoration: "underline", textDecorationColor: "transparent" }}
                  onMouseEnter={e => (e.currentTarget.style.textDecorationColor = "var(--color-text-secondary)")}
                  onMouseLeave={e => (e.currentTarget.style.textDecorationColor = "transparent")}
                >
                  {alarm.client.name}
                </div>
                <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", fontFamily: "monospace" }}>{alarm.type}</div>
                <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
                  {new Date(alarm.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  {alarm.status === "ACTIVE" && <>
                    <button onClick={() => updateAlarm(alarm.id, "resolve")} style={{ fontSize: "12px", color: "var(--accent2)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Resolve</button>
                    <button onClick={() => updateAlarm(alarm.id, "dismiss")} style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Dismiss</button>
                  </>}
                  {(alarm.status === "DISMISSED" || alarm.status === "RESOLVED") && (
                    <button onClick={() => updateAlarm(alarm.id, "reopen")} style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Reopen</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </AppShell>
  )
}
