"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"

type Report = { id: string; name: string; description: string | null; entity: string; updatedAt: string }

const ENTITY_LABELS: Record<string, string> = {
  assets: "Assets",
  licenses: "Licenses",
  contacts: "Contacts",
  domains: "Domains",
  network_devices: "Network Devices",
  clients: "Clients",
}

export default function CustomReportsList() {
  const router = useRouter()
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  function load() {
    setLoading(true)
    fetch("/api/reports/custom")
      .then(r => r.ok ? r.json() : [])
      .then(setReports)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function del(id: string, name: string) {
    if (!confirm(`Delete "${name}"?`)) return
    setDeleting(id)
    await fetch(`/api/reports/custom/${id}`, { method: "DELETE" })
    setDeleting(null)
    load()
  }

  return (
    <div style={{ padding: "32px", maxWidth: "860px", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: 500, margin: 0 }}>Custom Reports</h1>
          <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", margin: "4px 0 0" }}>Saved report definitions you can run at any time.</p>
        </div>
        <button
          onClick={() => router.push("/reports/custom/builder")}
          className="btn btn-primary"
        >
          + New Report
        </button>
      </div>

      {loading && <div style={{ color: "var(--color-text-secondary)", fontSize: "13px" }}>Loading…</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {reports.map(r => (
          <div key={r.id} style={{
            display: "flex", alignItems: "center", gap: "16px",
            padding: "14px 18px", borderRadius: "10px",
            background: "var(--color-background-secondary)",
            border: "0.5px solid var(--color-border-tertiary)",
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-text-primary)" }}>{r.name}</div>
              <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "2px" }}>
                {ENTITY_LABELS[r.entity] ?? r.entity}
                {r.description && ` — ${r.description}`}
              </div>
            </div>
            <div style={{ fontSize: "11px", color: "var(--color-text-muted)", flexShrink: 0 }}>
              {new Date(r.updatedAt).toLocaleDateString()}
            </div>
            <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
              <button
                onClick={() => router.push(`/reports/custom/${r.id}/run`)}
                style={{ padding: "5px 14px", borderRadius: "6px", border: "0.5px solid var(--color-border-secondary)", cursor: "pointer", background: "none", color: "var(--color-text-primary)", fontSize: "12px" }}
              >
                Run
              </button>
              <button
                onClick={() => router.push(`/reports/custom/builder?edit=${r.id}`)}
                className="btn btn-ghost btn-sm"
              >
                Edit
              </button>
              <button
                onClick={() => del(r.id, r.name)}
                disabled={deleting === r.id}
                className="btn btn-danger btn-sm"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {!loading && reports.length === 0 && (
        <div style={{ padding: "48px 0", textAlign: "center", color: "var(--color-text-muted)", fontSize: "14px" }}>
          No custom reports yet. Create one to get started.
        </div>
      )}
    </div>
  )
}
