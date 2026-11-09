"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import AppShell from "@/components/AppShell"

type Counts = { aiIntake: number; notesIntake: number; docReview: number; total: number }

const QUEUES: { key: keyof Omit<Counts, "total">; title: string; href: string; blurb: string }[] = [
  { key: "notesIntake", title: "Notes Intake", href: "/notes-intake", blurb: "Facts pulled from Apple Notes / Obsidian / uploads, waiting for you to commit or reject." },
  { key: "aiIntake", title: "AI Intake", href: "/intake", blurb: "Drop a photo, PDF or export — Claude proposes the client, asset and fields. Review before anything is saved." },
  { key: "docReview", title: "Docs flagged for review", href: "/docs/review", blurb: "Documents someone marked as wrong or out of date." },
]

export default function InboxPage() {
  const [counts, setCounts] = useState<Counts | null>(null)
  useEffect(() => {
    fetch("/api/inbox/counts").then((r) => (r.ok ? r.json() : null)).then(setCounts).catch(() => {})
  }, [])

  return (
    <AppShell>
      <div className="dochub-page" style={{ padding: "32px", maxWidth: 960 }}>
        <h1 style={{ fontSize: 22, fontWeight: 500, marginBottom: 4 }}>Inbox</h1>
        <p style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: 24 }}>
          Everything waiting for a human decision before it becomes documentation.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
          {QUEUES.map((q) => {
            const n = counts?.[q.key]
            return (
              <Link key={q.key} href={q.href} style={{
                display: "block", padding: "18px 20px", borderRadius: 10, textDecoration: "none",
                background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)",
                color: "var(--color-text-primary)",
              }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 500 }}>{q.title}</span>
                  <span style={{ fontSize: 26, fontWeight: 300, color: n ? "var(--accent)" : "var(--color-text-muted)" }}>
                    {n ?? "–"}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 8, lineHeight: 1.5 }}>{q.blurb}</div>
                <div style={{ fontSize: 12, color: "var(--accent)", marginTop: 12 }}>{n ? "Review now →" : "Open →"}</div>
              </Link>
            )
          })}
        </div>
      </div>
    </AppShell>
  )
}
