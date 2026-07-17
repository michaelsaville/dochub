"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"

/**
 * Floating "+" button bottom-right. Menu options change based on URL:
 *  - On /clients/[id] (or any sub-route): offers to add assets/creds/docs
 *    within that client, routing to the appropriate tab with ?new=1
 *    which the client detail page reads to auto-open its add form.
 *  - Elsewhere: just "New client" + "Create note" shortcuts.
 */
export default function QuickAddFab() {
  const router = useRouter()
  const pathname = usePathname()
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

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // Hide on a handful of routes where the FAB would collide with
  // full-screen / modal-heavy content.
  if (pathname?.startsWith("/shared/")) return null
  if (pathname?.startsWith("/portal")) return null
  if (pathname?.startsWith("/login")) return null

  const clientMatch = pathname?.match(/^\/clients\/([^/?]+)/)
  const clientId = clientMatch?.[1] && clientMatch[1] !== "merge" ? clientMatch[1] : null

  const options: { label: string; icon: string; onClick: () => void }[] = clientId
    ? [
        { label: "New credential",  icon: "🔑", onClick: () => router.push(`/clients/${clientId}?tab=Credentials&new=1`) },
        { label: "New asset",       icon: "💻", onClick: () => router.push(`/clients/${clientId}?tab=Assets&new=1`) },
        { label: "New document",    icon: "📄", onClick: () => router.push(`/clients/${clientId}?tab=Documents&new=1`) },
        { label: "New SOP",         icon: "📋", onClick: () => router.push(`/clients/${clientId}?tab=SOPs&new=1`) },
        { label: "New license",     icon: "📜", onClick: () => router.push(`/clients/${clientId}?tab=Licenses&new=1`) },
        { label: "New contact",     icon: "👤", onClick: () => router.push(`/clients/${clientId}?tab=People&new=1`) },
        { label: "New client",      icon: "🏢", onClick: () => router.push("/clients?new=1") },
      ]
    : [
        { label: "New client",      icon: "🏢", onClick: () => router.push("/clients?new=1") },
        { label: "New SOP",         icon: "📋", onClick: () => router.push("/runbooks?new=1") },
      ]

  return (
    <div ref={ref} className="pcc-fab" style={{ position: "fixed", bottom: 28, right: 28, zIndex: 40 }}>
      {open && (
        <div
          style={{
            position: "absolute",
            bottom: 64,
            right: 0,
            minWidth: 240,
            background: "var(--color-background-primary)",
            border: "0.5px solid var(--color-border-secondary)",
            borderRadius: 12,
            boxShadow: "0 12px 32px rgba(0,0,0,0.28)",
            padding: 6,
            overflow: "hidden",
          }}
        >
          {clientId && (
            <div style={{
              fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5,
              color: "var(--color-text-muted)",
              padding: "6px 10px",
            }}>
              On this client
            </div>
          )}
          {options.map((opt) => (
            <button
              key={opt.label}
              onClick={() => { opt.onClick(); setOpen(false) }}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                width: "100%", textAlign: "left",
                padding: "10px 12px",
                background: "transparent", border: "none", cursor: "pointer",
                borderRadius: 8,
                fontSize: 13, color: "var(--color-text-primary)",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-background-secondary)" }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
            >
              <span style={{ fontSize: 16, width: 22, textAlign: "center" }}>{opt.icon}</span>
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      )}

      <button
        onClick={() => setOpen(v => !v)}
        aria-label="Quick add"
        title="Quick add (click)"
        style={{
          width: 52, height: 52, borderRadius: "50%",
          background: "#3b82f6", color: "#fff",
          border: "none", cursor: "pointer",
          fontSize: 28, fontWeight: 300, lineHeight: 1,
          boxShadow: "0 6px 16px rgba(59,130,246,0.45)",
          transform: open ? "rotate(45deg)" : "none",
          transition: "transform 0.15s",
        }}
      >
        +
      </button>
    </div>
  )
}
