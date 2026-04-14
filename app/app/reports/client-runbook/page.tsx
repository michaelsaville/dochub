"use client"

import AppShell from "@/components/AppShell"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"

type Client = { id: string; name: string }

export default function ClientRunbookPicker() {
  const router = useRouter()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")

  useEffect(() => {
    fetch("/api/clients")
      .then(r => r.json())
      .then(d => setClients(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false))
  }, [])

  const filtered = clients.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <AppShell>
      <div style={{ padding: "32px", maxWidth: "640px" }}>
        <a href="/reports" style={{ fontSize: "12px", color: "var(--color-text-secondary)", textDecoration: "none" }}>&larr; Reports</a>
        <h1 style={{ fontSize: "20px", fontWeight: 500, marginTop: "8px", marginBottom: "4px" }}>Client Runbook</h1>
        <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginBottom: "20px" }}>
          Select a client to generate a printable runbook report.
        </p>

        <input
          type="text"
          placeholder="Search clients..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box", marginBottom: "12px" }}
        />

        {loading ? (
          <div style={{ color: "var(--color-text-secondary)", fontSize: "13px" }}>Loading clients...</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {filtered.map(c => (
              <button
                key={c.id}
                onClick={() => router.push(`/clients/${c.id}/runbook`)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "12px 16px", borderRadius: "8px",
                  border: "0.5px solid var(--color-border-tertiary)",
                  background: "var(--color-background-secondary)",
                  cursor: "pointer", color: "var(--color-text-primary)",
                  fontSize: "14px", fontWeight: 500, textAlign: "left",
                  transition: "background 0.1s",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--color-background-hover, rgba(255,255,255,0.05))")}
                onMouseLeave={e => (e.currentTarget.style.background = "var(--color-background-secondary)")}
              >
                {c.name}
                <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>&rarr;</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <div style={{ color: "var(--color-text-secondary)", fontSize: "13px", padding: "20px 0", textAlign: "center" }}>
                No clients found.
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  )
}
