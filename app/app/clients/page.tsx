"use client"

import AppShell from "@/components/AppShell"
import { useState } from "react"

export default function ClientsPage() {
  const [search, setSearch] = useState("")

  return (
    <AppShell>
      <div style={{ padding: "32px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }}>
          <div>
            <h1 style={{ fontSize: "22px", fontWeight: 500, marginBottom: "4px" }}>Clients</h1>
            <p style={{ fontSize: "14px", color: "var(--color-text-secondary)" }}>
              All business and residential clients
            </p>
          </div>
          <button style={{
            fontSize: "14px",
            fontWeight: 500,
            padding: "8px 16px",
            borderRadius: "8px",
            border: "0.5px solid var(--color-border-secondary)",
            background: "var(--color-background-primary)",
            cursor: "pointer",
            color: "var(--color-text-primary)",
          }}>
            Add client
          </button>
        </div>

        <div style={{ marginBottom: "16px", maxWidth: "400px" }}>
          <input
            type="text"
            placeholder="Search clients..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 12px",
              fontSize: "14px",
              border: "0.5px solid var(--color-border-secondary)",
              borderRadius: "8px",
              background: "var(--color-background-primary)",
              color: "var(--color-text-primary)",
            }}
          />
        </div>

        <div style={{
          border: "0.5px solid var(--color-border-tertiary)",
          borderRadius: "10px",
          overflow: "hidden",
        }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 120px 120px 100px",
            padding: "10px 16px",
            borderBottom: "0.5px solid var(--color-border-tertiary)",
            background: "var(--color-background-secondary)",
          }}>
            {["Client name", "Type", "Locations", "Status"].map((h) => (
              <div key={h} style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-secondary)" }}>
                {h}
              </div>
            ))}
          </div>

          <div style={{
            padding: "48px 16px",
            textAlign: "center",
            color: "var(--color-text-secondary)",
            fontSize: "14px",
          }}>
            No clients yet. Add your first client to get started.
          </div>
        </div>
      </div>
    </AppShell>
  )
}
