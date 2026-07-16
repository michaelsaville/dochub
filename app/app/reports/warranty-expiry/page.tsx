"use client"

import { useState, useEffect } from "react"
import ReportShell, { ReportTable, ReportSection, ReportStat } from "@/components/ReportShell"

type Asset = {
  id: string; name: string; friendlyName: string | null; category: string | null
  make: string | null; model: string | null; serial: string | null
  warrantyExpiry: string | null; purchaseDate: string | null
  location: { name: string; client: { name: string } } | null
  assetType: { name: string } | null
}
type Client = { id: string; name: string }

export default function WarrantyExpiryReport() {
  const [clients, setClients] = useState<Client[]>([])
  const [assets, setAssets] = useState<Asset[]>([])
  const [selectedClient, setSelectedClient] = useState("")
  const [days, setDays] = useState("90")
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
    const params = new URLSearchParams({ days })
    if (selectedClient) params.set("clientId", selectedClient)
    fetch(`/api/reports/warranty-expiry?${params}`)
      .then(r => r.ok ? r.json() : { assets: [] })
      .then(d => { setAssets(d.assets ?? []); setGenerated(true) })
      .finally(() => setLoading(false))
  }

  const clientName = clients.find(c => c.id === selectedClient)?.name

  const now = new Date()
  const cutoff = new Date(now.getTime() + parseInt(days, 10) * 86400 * 1000)

  const expired = assets.filter(a => a.warrantyExpiry && new Date(a.warrantyExpiry) < now)
  const expiringSoon = assets.filter(a => {
    if (!a.warrantyExpiry) return false
    const d = new Date(a.warrantyExpiry)
    return d >= now && d < cutoff
  })
  const valid = assets.filter(a => a.warrantyExpiry && new Date(a.warrantyExpiry) >= cutoff)

  function warrantyStatus(date: string | null): { label: string; color: string } {
    if (!date) return { label: "—", color: "var(--color-text-muted)" }
    const d = new Date(date)
    if (d < now) return { label: `Expired ${d.toLocaleDateString()}`, color: "var(--color-text-danger)" }
    if (d < cutoff) return { label: `Expires ${d.toLocaleDateString()}`, color: "var(--warn)" }
    return { label: d.toLocaleDateString(), color: "var(--color-text-primary)" }
  }

  function assetRows(list: Asset[]) {
    return list.map(a => {
      const ws = warrantyStatus(a.warrantyExpiry)
      return [
        a.location?.client?.name ?? null,
        a.friendlyName || a.name,
        [a.make, a.model].filter(Boolean).join(" ") || null,
        a.assetType?.name ?? null,
        a.serial ?? null,
        ws.label,
      ]
    })
  }

  return (
    <ReportShell
      title="Warranty Expiry"
      subtitle={`Assets with warranty status within ${days} days`}
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
        <div>
          <label style={{ display: "block", fontSize: "11px", color: "var(--color-text-muted)", marginBottom: "4px" }}>EXPIRY WINDOW</label>
          <select
            value={days}
            onChange={e => setDays(e.target.value)}
            style={{ padding: "7px 10px", borderRadius: "6px", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-secondary)", color: "var(--color-text-primary)", fontSize: "13px" }}
          >
            <option value="30">30 days</option>
            <option value="60">60 days</option>
            <option value="90">90 days</option>
            <option value="180">180 days</option>
            <option value="365">1 year</option>
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

      {generated && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "28px" }}>
            <ReportStat label="Expired" value={expired.length} color={expired.length > 0 ? "var(--color-text-danger)" : undefined} />
            <ReportStat label={`Expiring within ${days} days`} value={expiringSoon.length} color={expiringSoon.length > 0 ? "var(--warn)" : undefined} />
            <ReportStat label="Valid" value={valid.length} color={valid.length > 0 ? "var(--accent2)" : undefined} />
          </div>

          {expired.length > 0 && (
            <>
              <ReportSection title="Expired" count={expired.length} />
              <ReportTable
                headers={["Client", "Asset", "Make / Model", "Type", "Serial", "Warranty"]}
                rows={assetRows(expired)}
              />
            </>
          )}

          {expiringSoon.length > 0 && (
            <>
              <ReportSection title={`Expiring within ${days} days`} count={expiringSoon.length} />
              <ReportTable
                headers={["Client", "Asset", "Make / Model", "Type", "Serial", "Warranty"]}
                rows={assetRows(expiringSoon)}
              />
            </>
          )}

          {valid.length > 0 && (
            <>
              <ReportSection title="Valid" count={valid.length} />
              <ReportTable
                headers={["Client", "Asset", "Make / Model", "Type", "Serial", "Warranty"]}
                rows={assetRows(valid)}
              />
            </>
          )}
        </>
      )}
    </ReportShell>
  )
}
