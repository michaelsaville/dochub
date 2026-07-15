"use client"

import { useState, useEffect } from "react"
import ReportShell, { ReportTable, ReportSection, ReportStat } from "@/components/ReportShell"

type AssetRow = {
  id: string; name: string; friendlyName: string | null; clientName: string | null
  locationName: string | null; typeName: string | null; category: string | null
  make: string | null; model: string | null; serial: string | null; status: string
  purchaseDate: string | null; refreshDate: string | null; refreshBasis: string | null
  cost: number | null; ageYears: number | null
}
type Bucket = {
  key: string; label: string; rangeStart: string | null; rangeEnd: string | null
  count: number; totalCostCents: number; assets: AssetRow[]
}
type Totals = {
  count: number; totalCostCents: number; scheduledCostCents: number
  overdueCostCents: number; unscheduledCount: number; costedCount: number
}
type Client = { id: string; name: string }

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

function fmtMoney(cents: number | null): string {
  if (cents == null) return "—"
  return "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
function fmtMoney2(cents: number | null): string {
  if (cents == null) return "—"
  return "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const selectStyle = { padding: "7px 10px", borderRadius: "6px", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-secondary)", color: "var(--color-text-primary)", fontSize: "13px" } as const
const labelStyle = { display: "block", fontSize: "11px", color: "var(--color-text-muted)", marginBottom: "4px" } as const

export default function AssetLifecycleReport() {
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClient, setSelectedClient] = useState("")
  const [fiscalStartMonth, setFiscalStartMonth] = useState("1")
  const [buckets, setBuckets] = useState<Bucket[]>([])
  const [totals, setTotals] = useState<Totals | null>(null)
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
    const params = new URLSearchParams({ fiscalStartMonth })
    if (selectedClient) params.set("clientId", selectedClient)
    fetch(`/api/reports/asset-lifecycle?${params}`)
      .then(r => r.ok ? r.json() : { buckets: [], totals: null })
      .then(d => { setBuckets(d.buckets ?? []); setTotals(d.totals ?? null); setGenerated(true) })
      .finally(() => setLoading(false))
  }

  const clientName = clients.find(c => c.id === selectedClient)?.name

  function ageLabel(y: number | null): string {
    if (y == null) return "—"
    return `${y} yr${y === 1 ? "" : "s"}`
  }
  function dateLabel(s: string | null): string {
    return s ? new Date(s).toLocaleDateString() : "—"
  }
  function rangeLabel(b: Bucket): string {
    if (!b.rangeStart || !b.rangeEnd) return ""
    const start = new Date(b.rangeStart)
    const end = new Date(new Date(b.rangeEnd).getTime() - 86400000) // inclusive last day
    return ` (${start.toLocaleDateString()} – ${end.toLocaleDateString()})`
  }
  function bucketRows(list: AssetRow[]) {
    return list.map(a => [
      a.clientName,
      a.friendlyName || a.name,
      a.typeName ?? a.category,
      a.serial,
      ageLabel(a.ageYears),
      a.refreshBasis ?? "—",
      dateLabel(a.refreshDate),
      fmtMoney2(a.cost),
    ])
  }

  return (
    <ReportShell
      title="Asset Lifecycle & Refresh Budget"
      subtitle="Cost-weighted hardware aging by fiscal year — ScalePad-style refresh forecast"
      clientName={clientName}
    >
      <div className="no-print" style={{ display: "flex", gap: "12px", marginBottom: "28px", alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <label style={labelStyle}>CLIENT</label>
          <select value={selectedClient} onChange={e => setSelectedClient(e.target.value)} style={{ ...selectStyle, minWidth: "220px" }}>
            <option value="">All Clients</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>FISCAL YEAR STARTS</label>
          <select value={fiscalStartMonth} onChange={e => setFiscalStartMonth(e.target.value)} style={selectStyle}>
            {MONTHS.map((m, i) => <option key={i} value={String(i + 1)}>{m}</option>)}
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

      {generated && totals && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "20px" }}>
            <ReportStat label="Assets in scope" value={totals.count} />
            <ReportStat label="Total acquisition cost" value={fmtMoney(totals.totalCostCents)} />
            <ReportStat label="Overdue refresh budget" value={fmtMoney(totals.overdueCostCents)} color={totals.overdueCostCents > 0 ? "var(--color-text-danger)" : undefined} />
            <ReportStat label="Unscheduled assets" value={totals.unscheduledCount} color={totals.unscheduledCount > 0 ? "#ffb347" : undefined} />
          </div>

          {totals.costedCount < totals.count && (
            <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginBottom: "20px" }}>
              Note: {totals.count - totals.costedCount} of {totals.count} assets have no recorded cost — budget totals understate actual refresh spend.
            </div>
          )}

          {buckets.length === 0 && (
            <div style={{ fontSize: "13px", color: "var(--color-text-muted)" }}>No assets found for this scope.</div>
          )}

          {buckets.map(b => (
            <div key={b.key}>
              <ReportSection title={`${b.label}${rangeLabel(b)}`} count={b.count} />
              <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px", color: b.key === "OVERDUE" ? "var(--color-text-danger)" : "var(--color-text-primary)" }}>
                Refresh budget: {fmtMoney(b.totalCostCents)}
              </div>
              <ReportTable
                headers={["Client", "Asset", "Type", "Serial", "Age", "Basis", "Refresh by", "Cost"]}
                rows={bucketRows(b.assets)}
              />
            </div>
          ))}
        </>
      )}
    </ReportShell>
  )
}
