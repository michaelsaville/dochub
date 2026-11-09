"use client"

import AppShell from "@/components/AppShell"
import { useEffect, useState } from "react"
import Link from "next/link"

type FlaggedDoc = {
  id: string
  title: string
  category: string | null
  needsReview: boolean
  reviewOverdue: boolean
  reviewDueAt: string | null
  reviewIntervalDays: number | null
  sourceTicketId: string | null
  owner: { id: string; name: string | null; email: string } | null
  reviewNote: string | null
  flaggedAt: string | null
  flaggedBy: string | null
  updatedAt: string
  client: { id: string; name: string }
  folder: { id: string; name: string } | null
}

type DueRunbook = {
  id: string
  title: string
  reviewDueAt: string
  reviewIntervalDays: number | null
  owner: { id: string; name: string | null; email: string } | null
  client: { id: string; name: string } | null
}

function overdueLabel(iso: string | null): string {
  if (!iso) return ""
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  return days < 1 ? "Review due today" : `Review overdue ${days} day${days === 1 ? "" : "s"}`
}

function relativeDays(iso: string | null): string {
  if (!iso) return "—"
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days < 1) return "today"
  if (days === 1) return "1 day ago"
  return `${days} days ago`
}

export default function DocReviewQueuePage() {
  const [docs, setDocs] = useState<FlaggedDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [marking, setMarking] = useState<string | null>(null)
  const [runbooks, setRunbooks] = useState<DueRunbook[]>([])

  useEffect(() => { fetchDocs() }, [])

  async function fetchDocs() {
    setLoading(true)
    try {
      const [res, rb] = await Promise.all([
        fetch("/api/documents/flagged"),
        fetch("/api/runbooks/review-due").catch(() => null),
      ])
      if (rb?.ok) setRunbooks(await rb.json())
      if (!res.ok) return
      setDocs(await res.json())
    } finally {
      setLoading(false)
    }
  }

  async function markRunbookReviewed(id: string) {
    setMarking(id)
    try {
      const res = await fetch(`/api/runbooks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewed: true }),
      })
      if (res.ok) setRunbooks(prev => prev.filter(r => r.id !== id))
    } finally {
      setMarking(null)
    }
  }

  async function markReviewed(docId: string) {
    setMarking(docId)
    try {
      const res = await fetch(`/api/documents/${docId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ needsReview: false }),
      })
      if (res.ok) {
        setDocs(prev => prev.filter(d => d.id !== docId))
      }
    } finally {
      setMarking(null)
    }
  }

  return (
    <AppShell>
      <div style={{ padding: "32px" }}>
        <div style={{ marginBottom: "24px" }}>
          <h1 style={{ fontSize: "22px", fontWeight: 500, marginBottom: "4px" }}>Review queue</h1>
          <p style={{ fontSize: "14px", color: "var(--color-text-secondary)" }}>
            {loading
              ? "Loading..."
              : docs.length === 0 && runbooks.length === 0
                ? "Nothing flagged or overdue for review right now."
                : [
                    docs.length ? `${docs.length} document${docs.length === 1 ? "" : "s"} to review` : null,
                    runbooks.length ? `${runbooks.length} SOP${runbooks.length === 1 ? "" : "s"} past review date` : null,
                  ].filter(Boolean).join(" · ")}
          </p>
        </div>

        {!loading && docs.length > 0 && (
          <div style={{
            border: "0.5px solid var(--color-border-tertiary)",
            borderRadius: "10px",
            overflow: "hidden",
          }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: "1.2fr 1fr 2fr 120px 120px",
              padding: "10px 16px",
              borderBottom: "0.5px solid var(--color-border-tertiary)",
              background: "var(--color-background-secondary)",
            }}>
              {["Document", "Client", "Reason", "Flagged", "Action"].map(h => (
                <div key={h} style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-secondary)" }}>{h}</div>
              ))}
            </div>
            {docs.map((d, i) => (
              <div key={d.id} style={{
                display: "grid",
                gridTemplateColumns: "1.2fr 1fr 2fr 120px 120px",
                padding: "12px 16px",
                borderBottom: i < docs.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none",
                background: "var(--color-background-primary)",
                alignItems: "center",
              }}>
                <div>
                  <Link
                    href={`/clients/${d.client.id}?tab=Documents&doc=${d.id}`}
                    style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-text-primary)", textDecoration: "none" }}
                  >
                    {d.title}
                  </Link>
                  {d.folder && (
                    <div style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>{d.folder.name}</div>
                  )}
                </div>
                <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>
                  <Link
                    href={`/clients/${d.client.id}`}
                    style={{ color: "var(--color-text-secondary)", textDecoration: "none" }}
                  >
                    {d.client.name}
                  </Link>
                </div>
                <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>
                  {d.reviewOverdue && (
                    <div style={{ color: "var(--color-text-warning)", fontWeight: 500 }}>
                      {overdueLabel(d.reviewDueAt)}
                      {d.reviewIntervalDays ? <span style={{ fontWeight: 400, color: "var(--color-text-muted)" }}> · every {d.reviewIntervalDays}d</span> : null}
                    </div>
                  )}
                  {d.needsReview
                    ? (d.reviewNote || <span style={{ fontStyle: "italic", color: "var(--color-text-muted)" }}>no note</span>)
                    : null}
                  {d.owner && (
                    <div style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>Owner: {d.owner.name ?? d.owner.email}</div>
                  )}
                </div>
                <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
                  <div>{relativeDays(d.flaggedAt)}</div>
                  {d.flaggedBy && (
                    <div style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>by {d.flaggedBy}</div>
                  )}
                </div>
                <div>
                  <button
                    onClick={() => markReviewed(d.id)}
                    disabled={marking === d.id}
                    style={{
                      fontSize: "12px", padding: "6px 12px",
                      borderRadius: "6px",
                      border: "0.5px solid var(--color-border-secondary)",
                      background: marking === d.id ? "var(--color-background-secondary)" : "rgba(0,212,170,0.12)",
                      color: "var(--accent2)", cursor: marking === d.id ? "wait" : "pointer",
                      fontWeight: 500,
                    }}
                  >
                    {marking === d.id ? "Marking..." : "Mark reviewed"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && runbooks.length > 0 && (
          <div style={{ marginTop: "28px" }}>
            <h2 style={{ fontSize: "15px", fontWeight: 500, marginBottom: "10px" }}>SOPs past their review date</h2>
            <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "10px", overflow: "hidden" }}>
              {runbooks.map((r, i) => (
                <div key={r.id} style={{
                  display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center",
                  padding: "12px 16px",
                  borderBottom: i < runbooks.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none",
                  background: "var(--color-background-primary)",
                }}>
                  <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                    <Link href={`/runbooks/${r.id}`} style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-text-primary)", textDecoration: "none" }}>{r.title}</Link>
                    <div style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
                      {r.client ? r.client.name : "Global SOP"}
                      {r.owner ? ` · Owner: ${r.owner.name ?? r.owner.email}` : ""}
                    </div>
                  </div>
                  <div style={{ fontSize: "13px", color: "var(--color-text-warning)", fontWeight: 500 }}>
                    {overdueLabel(r.reviewDueAt)}
                    {r.reviewIntervalDays ? <span style={{ fontWeight: 400, color: "var(--color-text-muted)" }}> · every {r.reviewIntervalDays}d</span> : null}
                  </div>
                  <button
                    onClick={() => markRunbookReviewed(r.id)}
                    disabled={marking === r.id}
                    style={{
                      fontSize: "12px", padding: "6px 12px", minHeight: "36px",
                      borderRadius: "6px",
                      border: "0.5px solid var(--color-border-secondary)",
                      background: marking === r.id ? "var(--color-background-secondary)" : "rgba(0,212,170,0.12)",
                      color: "var(--accent2)", cursor: marking === r.id ? "wait" : "pointer",
                      fontWeight: 500,
                    }}
                  >
                    {marking === r.id ? "Marking..." : "Mark reviewed"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
