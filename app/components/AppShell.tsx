"use client"

import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useEffect, useState, useCallback, useRef } from "react"
import Sidebar from "@/components/Sidebar"
import SearchModal from "@/components/SearchModal"

function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

function HamburgerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

const QUICK_LINKS = [
  { label: "Reporting", href: "/reports", icon: "📊" },
  { label: "Global SOPs", href: "/runbooks", icon: "📋" },
  { label: "Global Vendors", href: "/portal-admin", icon: "🏢" },
]

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [searchOpen, setSearchOpen] = useState(false)
  const [alertCount, setAlertCount] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login")
  }, [status, router])

  useEffect(() => {
    fetch("/api/alerts/unified")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d?.stats) return
        setAlertCount((d.stats.expired ?? 0) + (d.stats.critical ?? 0))
      })
      .catch(() => {})
  }, [])

  // Close menu on click outside
  useEffect(() => {
    if (!menuOpen) return
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [menuOpen])

  // Close menu on route change
  useEffect(() => { setMenuOpen(false) }, [children])

  const openSearch = useCallback(() => setSearchOpen(true), [])
  const closeSearch = useCallback(() => setSearchOpen(false), [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setSearchOpen(open => !open)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  if (status === "loading") return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ fontSize: "14px", color: "var(--color-text-secondary)" }}>Loading...</span>
    </div>
  )

  if (!session) return null

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar onOpenSearch={openSearch} />
      <main style={{ flex: 1, overflow: "auto", position: "relative" }}>
        {/* Top-right controls: bell + hamburger menu */}
        <div style={{
          position: "fixed",
          top: "16px",
          right: "20px",
          zIndex: 40,
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}>
          {/* Alert bell */}
          <button
            onClick={() => router.push("/alerts")}
            title={alertCount > 0 ? `${alertCount} expiry alert${alertCount !== 1 ? "s" : ""}` : "No expiry alerts"}
            style={{
              position: "relative",
              background: alertCount > 0 ? "rgba(239, 68, 68, 0.1)" : "var(--color-background-secondary)",
              border: "0.5px solid var(--color-border-tertiary)",
              borderRadius: "8px",
              cursor: "pointer",
              padding: "8px",
              color: alertCount > 0 ? "#f59e0b" : "var(--muted)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "color 0.15s, background 0.15s",
            }}
          >
            <BellIcon />
            {alertCount > 0 && (
              <span style={{
                position: "absolute",
                top: "-4px",
                right: "-4px",
                background: "#ef4444",
                color: "white",
                fontSize: "9px",
                fontWeight: 700,
                lineHeight: 1,
                padding: "2px 5px",
                borderRadius: "8px",
                minWidth: "14px",
                textAlign: "center",
              }}>
                {alertCount > 99 ? "99+" : alertCount}
              </span>
            )}
          </button>

          {/* Hamburger menu */}
          <div ref={menuRef} style={{ position: "relative" }}>
            <button
              onClick={() => setMenuOpen(v => !v)}
              title="More"
              style={{
                background: "var(--color-background-secondary)",
                border: "0.5px solid var(--color-border-tertiary)",
                borderRadius: "8px",
                cursor: "pointer",
                padding: "8px",
                color: "var(--muted)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "color 0.15s",
              }}
            >
              <HamburgerIcon />
            </button>

            {menuOpen && (
              <div style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                right: 0,
                minWidth: "180px",
                background: "var(--color-background-secondary)",
                border: "0.5px solid var(--color-border-tertiary)",
                borderRadius: "10px",
                boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
                overflow: "hidden",
              }}>
                {QUICK_LINKS.map((link, i) => (
                  <a
                    key={link.href}
                    href={link.href}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "10px 14px",
                      fontSize: "13px",
                      color: "var(--color-text-secondary)",
                      textDecoration: "none",
                      borderBottom: i < QUICK_LINKS.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--color-background-hover, rgba(255,255,255,0.05))")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    onClick={() => setMenuOpen(false)}
                  >
                    <span style={{ fontSize: "15px" }}>{link.icon}</span>
                    <span>{link.label}</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>

        {children}
      </main>
      {searchOpen && <SearchModal onClose={closeSearch} />}
    </div>
  )
}
