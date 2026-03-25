"use client"

import AppShell from "@/components/AppShell"
import { useSession } from "next-auth/react"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"

type Stats = {
  clients: number
  assets: number
  alarms: number
  licensesExpiring: number
}

export default function DashboardPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    fetch("/api/dashboard")
      .then(r => r.json())
      .then(setStats)
      .catch(() => {})
  }, [])

  const cards = [
    { label: "Active clients", value: stats?.clients, href: "/clients" },
    { label: "Active assets", value: stats?.assets, href: "/clients" },
    { label: "Open alarms", value: stats?.alarms, href: "/alarms" },
    { label: "Licenses expiring", value: stats?.licensesExpiring, href: "/clients" },
  ]

  return (
    <AppShell>
      <div style={{ padding: "32px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 500, marginBottom: "4px" }}>Dashboard</h1>
        <p style={{ fontSize: "14px", color: "var(--color-text-secondary)", marginBottom: "32px" }}>
          Welcome back, {session?.user?.name?.split(" ")[0]}
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", maxWidth: "800px" }}>
          {cards.map((card) => (
            <div
              key={card.label}
              onClick={() => router.push(card.href)}
              style={{
                background: "var(--color-background-secondary)",
                borderRadius: "10px", padding: "16px",
                border: "0.5px solid var(--color-border-tertiary)",
                cursor: "pointer",
              }}
              onMouseEnter={e => (e.currentTarget.style.border = "0.5px solid var(--color-border-secondary)")}
              onMouseLeave={e => (e.currentTarget.style.border = "0.5px solid var(--color-border-tertiary)")}
            >
              <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginBottom: "6px" }}>
                {card.label}
              </div>
              <div style={{ fontSize: "28px", fontWeight: 500 }}>
                {card.value ?? "—"}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  )
}
