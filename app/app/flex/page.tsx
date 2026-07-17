"use client"

import React, { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import AppShell from "@/components/AppShell"
import type { FlexLayoutSummary } from "@/components/flex/types"

// =============================================================================
// /flex — Flexible Assets hub. Lists every active layout as a card that deep-
// links to its instance index (/flex/[slug]). Admins get a shortcut to the
// layout designer in Settings. This is the destination of the AppShell
// "Flexible Assets" quick link.
// =============================================================================

export default function FlexHubPage(): React.ReactElement {
  const router = useRouter()
  const { data: session } = useSession()
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "ADMIN"

  const [layouts, setLayouts] = useState<FlexLayoutSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/flex-layouts")
      .then(r => (r.ok ? r.json() : []))
      .then(d => setLayouts(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <AppShell>
      <div style={{ padding: "var(--space-8)", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--space-4)", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ marginBottom: 4 }}>Flexible Assets</h1>
            <p style={{ fontSize: "var(--text-base)", color: "var(--muted)", marginBottom: "var(--space-6)" }}>
              Custom documentation types — SSL certs, apps, vendors of record, and anything else with its own field schema.
            </p>
          </div>
          {isAdmin && (
            <a href="/settings/flex" className="btn btn-secondary">
              ⚙ Manage layouts
            </a>
          )}
        </div>

        {loading ? (
          <div className="state-box">
            <span>Loading layouts…</span>
          </div>
        ) : layouts.length === 0 ? (
          <div className="state-box">
            <span>No flexible-asset layouts yet.</span>
            {isAdmin ? (
              <a href="/settings/flex" className="btn btn-primary">
                Create your first layout
              </a>
            ) : (
              <span style={{ fontSize: "var(--text-xs)" }}>An admin can create one in Settings → Flexible Assets.</span>
            )}
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: "var(--space-4)",
            }}
          >
            {layouts.map(l => (
              <button
                key={l.id}
                onClick={() => router.push(`/flex/${l.slug}`)}
                style={{
                  textAlign: "left",
                  cursor: "pointer",
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderLeft: `3px solid ${l.color || "var(--accent)"}`,
                  borderRadius: 10,
                  padding: "var(--space-4)",
                  minHeight: 96,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                <div style={{ fontSize: 26, lineHeight: 1 }}>{l.icon || "📄"}</div>
                <div style={{ fontSize: "var(--text-lg)", fontWeight: 600, color: "var(--text)" }}>{l.name}</div>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--muted)" }}>
                  {l.fieldCount} field{l.fieldCount === 1 ? "" : "s"}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
