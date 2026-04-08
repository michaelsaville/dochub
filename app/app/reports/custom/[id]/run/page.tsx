"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import ReportShell, { ReportTable, ReportSection } from "@/components/ReportShell"

type RunResult = {
  report: { id: string; name: string; description: string | null }
  entity: string
  headers: string[]
  groups: { label: string; rows: string[][] }[]
  total: number
}

export default function CustomReportRun({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [result, setResult] = useState<RunResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reportId, setReportId] = useState<string | null>(null)

  useEffect(() => {
    params.then(p => {
      setReportId(p.id)
      fetch(`/api/reports/custom/${p.id}/run`)
        .then(r => r.ok ? r.json() : r.json().then(d => Promise.reject(d.error ?? "Error")))
        .then(setResult)
        .catch(e => setError(String(e)))
        .finally(() => setLoading(false))
    })
  }, [params])

  if (loading) {
    return (
      <div style={{ padding: "40px", color: "var(--color-text-secondary)", fontSize: "13px" }}>
        Running report…
      </div>
    )
  }

  if (error || !result) {
    return (
      <div style={{ padding: "40px" }}>
        <div style={{ color: "var(--color-text-danger)", marginBottom: "12px" }}>{error ?? "Unknown error"}</div>
        <button onClick={() => router.push("/reports/custom")} style={{ fontSize: "13px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer" }}>← Back to reports</button>
      </div>
    )
  }

  const singleGroup = result.groups.length === 1 && !result.groups[0].label

  return (
    <ReportShell
      title={result.report.name}
      subtitle={result.report.description ?? result.entity}
    >
      {/* Edit link */}
      <div className="no-print" style={{ marginBottom: "20px" }}>
        <button
          onClick={() => router.push(`/reports/custom/builder?edit=${result.report.id}`)}
          style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "none", border: "0.5px solid var(--color-border-secondary)", borderRadius: "5px", cursor: "pointer", padding: "4px 12px" }}
        >
          Edit report definition
        </button>
      </div>

      <div style={{ fontSize: "13px", color: "var(--color-text-muted)", marginBottom: "20px" }}>
        {result.total} row{result.total !== 1 ? "s" : ""}
        {!singleGroup && ` across ${result.groups.length} group${result.groups.length !== 1 ? "s" : ""}`}
      </div>

      {singleGroup ? (
        <ReportTable headers={result.headers} rows={result.groups[0].rows} />
      ) : (
        result.groups.map((g, i) => (
          <div key={i}>
            <ReportSection title={g.label || "—"} count={g.rows.length} />
            <ReportTable headers={result.headers} rows={g.rows} />
          </div>
        ))
      )}
    </ReportShell>
  )
}
