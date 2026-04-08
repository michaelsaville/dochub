"use client"

import AppShell from "@/components/AppShell"
import { useRouter } from "next/navigation"

const REPORTS = [
  {
    href: "/reports/asset-inventory",
    title: "Asset Inventory",
    description: "All active assets grouped by client and category. Filter by client.",
    icon: "🖥️",
  },
  {
    href: "/reports/warranty-expiry",
    title: "Warranty Expiry",
    description: "Assets with expired or soon-to-expire warranties. Configurable lookahead window.",
    icon: "🛡️",
  },
  {
    href: "/reports/client-summary",
    title: "Client Summary (QBR)",
    description: "One-page overview per client: contacts, assets, licenses, domain status.",
    icon: "📋",
  },
  {
    href: "/reports/custom",
    title: "Custom Reports",
    description: "Build and save your own reports with filters, sorting, and grouping.",
    icon: "🔧",
    custom: true,
  },
]

export default function ReportsPage() {
  const router = useRouter()

  return (
    <AppShell>
    <div style={{ padding: "32px", maxWidth: "860px" }}>
      <h1 style={{ fontSize: "20px", fontWeight: 500, marginBottom: "4px" }}>Reports</h1>
      <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginBottom: "28px" }}>
        Generate and print reports. All reports support browser print-to-PDF.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "12px" }}>
        {REPORTS.map(r => (
          <div
            key={r.href}
            onClick={() => router.push(r.href)}
            style={{
              padding: "20px 22px", borderRadius: "12px", cursor: "pointer",
              background: "var(--color-background-secondary)",
              border: r.custom ? "0.5px solid var(--color-accent)" : "0.5px solid var(--color-border-tertiary)",
              transition: "border-color 0.15s",
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--color-accent)")}
            onMouseLeave={e => (e.currentTarget.style.borderColor = r.custom ? "var(--color-accent)" : "var(--color-border-tertiary)")}
          >
            <div style={{ fontSize: "24px", marginBottom: "10px" }}>{r.icon}</div>
            <div style={{ fontSize: "15px", fontWeight: 500, color: "var(--color-text-primary)", marginBottom: "6px" }}>{r.title}</div>
            <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>{r.description}</div>
          </div>
        ))}
      </div>
    </div>
    </AppShell>
  )
}
