"use client"

import { useEffect, useState } from "react"

interface ReportShellProps {
  title: string
  subtitle?: string
  clientName?: string
  children: React.ReactNode
}

export default function ReportShell({ title, subtitle, clientName, children }: ReportShellProps) {
  const [logoExists, setLogoExists] = useState(false)
  const [logoUrl, setLogoUrl] = useState("")

  useEffect(() => {
    fetch("/api/settings/logo", { method: "HEAD" })
      .then(r => {
        if (r.ok) {
          setLogoExists(true)
          setLogoUrl("/api/settings/logo")
        }
      })
      .catch(() => {})
  }, [])

  const now = new Date()
  const dateStr = now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-background-primary)" }}>
      {/* Toolbar — hidden when printing */}
      <div className="no-print" style={{
        position: "sticky", top: 0, zIndex: 10,
        background: "var(--color-background-secondary)",
        borderBottom: "0.5px solid var(--color-border-tertiary)",
        padding: "10px 24px", display: "flex", alignItems: "center", gap: "12px",
      }}>
        <button
          onClick={() => window.history.back()}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-secondary)", fontSize: "13px", display: "flex", alignItems: "center", gap: "6px" }}
        >
          ← Back
        </button>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => window.print()}
          style={{
            padding: "7px 18px", borderRadius: "7px", border: "none", cursor: "pointer",
            background: "var(--color-accent)", color: "#fff", fontSize: "13px", fontWeight: 500,
          }}
        >
          Print / Export PDF
        </button>
      </div>

      {/* Report content */}
      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "40px 32px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "32px", paddingBottom: "20px", borderBottom: "1px solid var(--color-border-tertiary)" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "22px", fontWeight: 600, color: "var(--color-text-primary)" }}>{title}</div>
            {subtitle && <div style={{ fontSize: "14px", color: "var(--color-text-secondary)", marginTop: "4px" }}>{subtitle}</div>}
            <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "8px" }}>
              {clientName && <span style={{ marginRight: "16px" }}>Client: {clientName}</span>}
              Generated: {dateStr}
            </div>
          </div>
          {logoExists && (
            <img
              src={logoUrl}
              alt="Company Logo"
              style={{ maxHeight: "48px", maxWidth: "160px", objectFit: "contain", marginLeft: "24px" }}
            />
          )}
        </div>

        {/* Report body */}
        {children}
      </div>
    </div>
  )
}

// Reusable table for reports
export function ReportTable({ headers, rows }: { headers: string[]; rows: (string | number | null)[][] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} style={{
                textAlign: "left", padding: "8px 12px",
                background: "var(--color-background-tertiary)",
                color: "var(--color-text-secondary)",
                fontWeight: 500, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.04em",
                borderBottom: "1px solid var(--color-border-secondary)",
              }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} style={{ borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
              {row.map((cell, ci) => (
                <td key={ci} style={{ padding: "9px 12px", color: "var(--color-text-primary)", verticalAlign: "top" }}>
                  {cell ?? "—"}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={headers.length} style={{ padding: "24px 12px", textAlign: "center", color: "var(--color-text-muted)" }}>
                No data found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// Section header for grouped reports
export function ReportSection({ title, count }: { title: string; count?: number }) {
  return (
    <div style={{
      marginTop: "28px", marginBottom: "10px",
      paddingBottom: "6px", borderBottom: "1px solid var(--color-border-secondary)",
      display: "flex", alignItems: "baseline", gap: "10px",
    }}>
      <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-text-primary)" }}>{title}</span>
      {count != null && <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>{count} item{count !== 1 ? "s" : ""}</span>}
    </div>
  )
}

// Summary stat box
export function ReportStat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{
      padding: "16px 20px", borderRadius: "10px",
      background: "var(--color-background-secondary)",
      border: "0.5px solid var(--color-border-tertiary)",
      textAlign: "center",
    }}>
      <div style={{ fontSize: "24px", fontWeight: 600, color: color ?? "var(--color-text-primary)" }}>{value}</div>
      <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "4px" }}>{label}</div>
    </div>
  )
}
