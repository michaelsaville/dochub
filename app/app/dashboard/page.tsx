"use client"

import AppShell from "@/components/AppShell"
import { useSession } from "next-auth/react"

export default function DashboardPage() {
  const { data: session } = useSession()

  return (
    <AppShell>
      <div style={{ padding: "32px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 500, marginBottom: "4px" }}>
          Dashboard
        </h1>
        <p style={{ fontSize: "14px", color: "var(--color-text-secondary)", marginBottom: "32px" }}>
          Welcome back, {session?.user?.name}
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", maxWidth: "800px" }}>
          {[
            { label: "Clients", value: "—" },
            { label: "Active assets", value: "—" },
            { label: "Open alarms", value: "—" },
            { label: "Licenses expiring", value: "—" },
          ].map((card) => (
            <div key={card.label} style={{
              background: "var(--color-background-secondary)",
              borderRadius: "10px",
              padding: "16px",
            }}>
              <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginBottom: "6px" }}>
                {card.label}
              </div>
              <div style={{ fontSize: "24px", fontWeight: 500 }}>{card.value}</div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  )
}
