"use client"

import { useState, useRef, useEffect } from "react"

/**
 * Admin-only "Export CSV" menu. Lists entity options (assets, credentials,
 * licenses, contacts) and opens the /api/export/[entity] endpoint which
 * triggers a file download. Passwords/license-keys are redacted server-side.
 */
export default function ExportCsvMenu({ clientId }: { clientId?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current) return
      if (!ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener("mousedown", onClick)
    return () => window.removeEventListener("mousedown", onClick)
  }, [])

  const scope = clientId ? `?clientId=${clientId}` : ""
  const items = [
    { label: "Assets", href: `/api/export/assets${scope}` },
    { label: "Credentials (redacted)", href: `/api/export/credentials${scope}` },
    { label: "Licenses", href: `/api/export/licenses${scope}` },
    { label: "Contacts", href: `/api/export/contacts${scope}` },
  ]

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          fontSize: "12px", padding: "3px 10px",
          borderRadius: "10px",
          border: "0.5px solid var(--color-border-secondary)",
          background: "var(--color-background-secondary)",
          color: "var(--color-text-secondary)",
          cursor: "pointer",
          display: "flex", alignItems: "center", gap: "6px",
        }}
      >
        <span style={{ opacity: 0.7 }}>⬇</span>
        Export CSV
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", right: 0,
          minWidth: 200, zIndex: 20,
          background: "var(--color-background-primary)",
          border: "0.5px solid var(--color-border-secondary)",
          borderRadius: 8, padding: 4,
          boxShadow: "0 8px 20px rgba(0,0,0,0.18)",
        }}>
          {items.map(it => (
            <a
              key={it.label}
              href={it.href}
              download
              onClick={() => setOpen(false)}
              style={{
                display: "block", padding: "8px 12px",
                fontSize: 13, color: "var(--color-text-primary)",
                borderRadius: 6, textDecoration: "none",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-background-secondary)" }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
            >
              {it.label}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
