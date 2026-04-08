"use client"

import { useState, useEffect } from "react"
import ReportShell, { ReportTable, ReportSection } from "@/components/ReportShell"

type Asset = {
  id: string; name: string; friendlyName: string | null; category: string | null
  status: string; make: string | null; model: string | null; serial: string | null
  assetTag: string | null; purchaseDate: string | null; warrantyExpiry: string | null
  location: { name: string; city: string | null; client: { name: string } } | null
  assetType: { name: string } | null
}
type Client = { id: string; name: string }

export default function AssetInventoryReport() {
  const [clients, setClients] = useState<Client[]>([])
  const [assets, setAssets] = useState<Asset[]>([])
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
    const url = "/api/reports/asset-inventory" + (selectedClient ? `?clientId=${selectedClient}` : "")
    fetch(url)
      .then(r => r.ok ? r.json() : { assets: [] })
      .then(d => { setAssets(d.assets ?? []); setGenerated(true) })
      .finally(() => setLoading(false))
  }

  const clientName = clients.find(c => c.id === selectedClient)?.name

  // Group by client
  const grouped: Record<string, Asset[]> = {}
  for (const a of assets) {
    const key = a.location?.client?.name ?? "Unknown Client"
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(a)
  }

  const now = new Date()

  function warrantyColor(date: string | null) {
    if (!date) return undefined
    const d = new Date(date)
    if (d < now) return "var(--color-text-danger)"
    const soon = new Date(now.getTime() + 90 * 86400 * 1000)
    if (d < soon) return "#f59e0b"
    return undefined
  }

  return (
    <ReportShell
      title="Asset Inventory"
      subtitle="All active assets by client and category"
      clientName={clientName}
    >
      {/* Filter bar */}
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

      {generated && (
        <>
          <div style={{ fontSize: "13px", color: "var(--color-text-muted)", marginBottom: "20px" }}>
            {assets.length} asset{assets.length !== 1 ? "s" : ""} across {Object.keys(grouped).length} client{Object.keys(grouped).length !== 1 ? "s" : ""}
          </div>
          {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([clientName, clientAssets]) => (
            <div key={clientName}>
              <ReportSection title={clientName} count={clientAssets.length} />
              <ReportTable
                headers={["Name", "Type", "Category", "Make / Model", "Serial", "Location", "Warranty"]}
                rows={clientAssets.map(a => [
                  a.friendlyName || a.name,
                  a.assetType?.name ?? null,
                  a.category ?? null,
                  [a.make, a.model].filter(Boolean).join(" ") || null,
                  a.serial ?? null,
                  [a.location?.name, a.location?.city].filter(Boolean).join(", ") || null,
                  a.warrantyExpiry ? new Date(a.warrantyExpiry).toLocaleDateString() : null,
                ])}
              />
            </div>
          ))}
        </>
      )}
    </ReportShell>
  )
}
