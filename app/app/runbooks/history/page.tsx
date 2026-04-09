"use client"

import AppShell from "@/components/AppShell"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"

type Run = {
  id: string
  startedAt: string
  completedAt: string | null
  startedBy: string
  notes: string | null
  runbook: { id: string; title: string }
  client: { id: string; name: string }
  steps: { completed: boolean }[]
}

function relativeTime(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60) return "just now"
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function duration(startedAt: string, completedAt: string | null): string {
  if (!completedAt) return "In progress"
  const secs = Math.floor((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  return `${mins}m`
}

export default function RunbookHistoryPage() {
  const router = useRouter()
  const [runs, setRuns] = useState<Run[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")

  useEffect(() => {
    fetch("/api/runbook-runs")
      .then(r => r.json())
      .then(d => setRuns(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false))
  }, [])

  const filtered = runs.filter(r => {
    if (!search) return true
    const q = search.toLowerCase()
    return r.runbook.title.toLowerCase().includes(q) || r.client.name.toLowerCase().includes(q) || r.startedBy.toLowerCase().includes(q)
  })

  return (
    <AppShell>
      <div style={{ padding: "32px", maxWidth: "960px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }}>
          <div>
            <h1 style={{ fontSize: "22px", fontWeight: 500, marginBottom: "4px" }}>Runbook History</h1>
            <p style={{ fontSize: "14px", color: "var(--color-text-secondary)" }}>
              All runbook executions across all clients and runbooks.
            </p>
          </div>
          <button
            onClick={() => router.push("/runbooks")}
            style={{ fontSize: "13px", padding: "7px 14px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: "pointer", color: "var(--color-text-secondary)" }}
          >
            ← Runbooks
          </button>
        </div>

        <div style={{ marginBottom: "16px" }}>
          <input
            type="text"
            placeholder="Search runbook, client, or started by..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ padding: "7px 12px", fontSize: "13px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "7px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", width: "320px" }}
          />
        </div>

        {loading ? (
          <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>
            {search ? "No runs match your search." : "No runbook runs yet."}
          </div>
        ) : (
          <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "10px", overflow: "hidden" }}>
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 180px 120px 80px 80px 80px",
              padding: "8px 16px", background: "var(--color-background-secondary)",
              borderBottom: "0.5px solid var(--color-border-tertiary)",
            }}>
              {["Runbook", "Client", "Started by", "Steps", "Duration", "When"].map(h => (
                <div key={h} style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-secondary)" }}>{h}</div>
              ))}
            </div>
            {filtered.map((run, i) => {
              const total     = run.steps.length
              const completed = run.steps.filter(s => s.completed).length
              const pct       = total > 0 ? Math.round((completed / total) * 100) : 0
              const done      = !!run.completedAt || completed === total
              return (
                <div
                  key={run.id}
                  onClick={() => router.push(`/runbooks/${run.runbook.id}`)}
                  style={{
                    display: "grid", gridTemplateColumns: "1fr 180px 120px 80px 80px 80px",
                    padding: "11px 16px", cursor: "pointer",
                    borderBottom: i < filtered.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none",
                    background: "var(--color-background-primary)",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--color-background-secondary)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "var(--color-background-primary)")}
                >
                  <div style={{ fontSize: "13px", fontWeight: 500 }}>{run.runbook.title}</div>
                  <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>{run.client.name}</div>
                  <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{run.startedBy}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: done ? "#22c55e" : "#f59e0b", flexShrink: 0 }} />
                    <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{completed}/{total}</span>
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{duration(run.startedAt, run.completedAt)}</div>
                  <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }} title={new Date(run.startedAt).toLocaleString()}>{relativeTime(run.startedAt)}</div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </AppShell>
  )
}
