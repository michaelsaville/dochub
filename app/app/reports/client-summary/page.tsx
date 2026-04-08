"use client"

import { useState, useEffect } from "react"
import ReportShell, { ReportSection, ReportStat } from "@/components/ReportShell"

type ClientSummary = {
  id: string; name: string
  contacts: { id: string; name: string; role: string | null; email: string | null; phone: string | null; isPrimary: boolean }[]
  locations: { id: string; name: string; city: string | null; state: string | null; address: string | null }[]
  totalAssets: number; warrantyCritical: number; warrantyWarn: number
  totalLicenses: number; expiredLicenses: number; expiringLicenses: number
  totalDomains: number; expiredDomains: number; expiredSSL: number
}
type Client = { id: string; name: string }

export default function ClientSummaryReport() {
  const [clients, setClients] = useState<Client[]>([])
  const [summaries, setSummaries] = useState<ClientSummary[]>([])
  const [selectedClient, setSelectedClient] = useState("")
  const [loading, setLoading] = useState(false)
  const [generated, setGenerated] = useState(false)

  useEffect(() => {
    fetch("/api/clients?limit=999")
      .then(r => r.ok ? r.json() : [])
      .then(d => setClients(Array.isArray(d) ? d : []))
  }, [])

  function generate() {
    setLoading(true)
    setGenerated(false)
    const url = "/api/reports/client-summary" + (selectedClient ? `?clientId=${selectedClient}` : "")
    fetch(url)
      .then(r => r.ok ? r.json() : { clients: [] })
      .then(d => { setSummaries(d.clients ?? []); setGenerated(true) })
      .finally(() => setLoading(false))
  }

  const clientName = clients.find(c => c.id === selectedClient)?.name

  return (
    <ReportShell
      title="Client Summary"
      subtitle="QBR-ready overview of client assets, licenses, and contacts"
      clientName={clientName}
    >
      <div className="no-print" style={{ display: "flex", gap: "12px", marginBottom: "28px", alignItems: "flex-end" }}>
        <div>
          <label style={{ display: "block", fontSize: "11px", color: "var(--color-text-muted)", marginBottom: "4px" }}>CLIENT</label>
          <select
            value={selectedClient}
            onChange={e => setSelectedClient(e.target.value)}
            style={{ padding: "7px 10px", borderRadius: "6px", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-secondary)", color: "var(--color-text-primary)", fontSize: "13px", minWidth: "220px" }}
          >
            <option value="">All Clients</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <button
          onClick={generate}
          disabled={loading}
          style={{ padding: "7px 20px", borderRadius: "6px", border: "none", cursor: "pointer", background: "var(--color-accent)", color: "#fff", fontSize: "13px", fontWeight: 500 }}
        >
          {loading ? "Loading…" : "Generate"}
        </button>
      </div>

      {generated && summaries.map(c => (
        <div key={c.id} style={{ marginBottom: "48px" }}>
          <ReportSection title={c.name} />

          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: "10px", marginBottom: "24px" }}>
            <ReportStat label="Total Assets" value={c.totalAssets} />
            <ReportStat label="Warranty Expired" value={c.warrantyCritical} color={c.warrantyCritical > 0 ? "var(--color-text-danger)" : undefined} />
            <ReportStat label="Warranty Warning" value={c.warrantyWarn} color={c.warrantyWarn > 0 ? "#f59e0b" : undefined} />
            <ReportStat label="Active Licenses" value={c.totalLicenses} />
            <ReportStat label="Expired Licenses" value={c.expiredLicenses} color={c.expiredLicenses > 0 ? "var(--color-text-danger)" : undefined} />
            <ReportStat label="Total Domains" value={c.totalDomains} />
            {c.expiredDomains > 0 && <ReportStat label="Expired Domains" value={c.expiredDomains} color="var(--color-text-danger)" />}
            {c.expiredSSL > 0 && <ReportStat label="Expired SSL" value={c.expiredSSL} color="var(--color-text-danger)" />}
          </div>

          {/* Contacts */}
          {c.contacts.length > 0 && (
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "8px" }}>Contacts</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {c.contacts.map(ct => (
                  <div key={ct.id} style={{ display: "flex", gap: "16px", fontSize: "13px", color: "var(--color-text-primary)" }}>
                    <span style={{ fontWeight: ct.isPrimary ? 600 : 400, minWidth: "160px" }}>{ct.name}{ct.isPrimary ? " ★" : ""}</span>
                    {ct.role && <span style={{ color: "var(--color-text-muted)", minWidth: "140px" }}>{ct.role}</span>}
                    {ct.email && <span style={{ color: "var(--color-text-secondary)" }}>{ct.email}</span>}
                    {ct.phone && <span style={{ color: "var(--color-text-muted)" }}>{ct.phone}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Locations */}
          {c.locations.length > 0 && (
            <div>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "8px" }}>Locations</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {c.locations.map(loc => (
                  <div key={loc.id} style={{ fontSize: "13px", color: "var(--color-text-primary)" }}>
                    {loc.name}{(loc.city || loc.state) ? ` — ${[loc.city, loc.state].filter(Boolean).join(", ")}` : ""}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
      {generated && summaries.length === 0 && (
        <div style={{ color: "var(--color-text-muted)", fontSize: "14px" }}>No data found.</div>
      )}
    </ReportShell>
  )
}
