"use client"

import AppShell from "@/components/AppShell"
import { useEffect, useState } from "react"
import Link from "next/link"

type FlaggedDoc = {
  id: string
  title: string
  category: string | null
  reviewNote: string | null
  flaggedAt: string | null
  flaggedBy: string | null
  updatedAt: string
  client: { id: string; name: string }
  folder: { id: string; name: string } | null
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

  useEffect(() => { fetchDocs() }, [])

  async function fetchDocs() {
    setLoading(true)
    try {
      const res = await fetch("/api/documents/flagged")
      if (!res.ok) return
      setDocs(await res.json())
    } finally {
      setLoading(false)
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
              : docs.length === 0
                ? "Nothing flagged for review right now."
                : `${docs.length} document${docs.length === 1 ? "" : "s"} flagged for review`}
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
                    href={`/clients/${d.client.id}?tab=Documents`}
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
                  {d.reviewNote || <span style={{ fontStyle: "italic", color: "var(--color-text-muted)" }}>no note</span>}
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
                      background: marking === d.id ? "var(--color-background-secondary)" : "rgba(34,197,94,0.12)",
                      color: "#16a34a", cursor: marking === d.id ? "wait" : "pointer",
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
      </div>
    </AppShell>
  )
}
