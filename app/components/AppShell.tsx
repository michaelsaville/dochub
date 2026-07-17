"use client"

import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import React, { useEffect, useState, useCallback, useRef } from "react"
import Sidebar from "@/components/Sidebar"
import SearchModal from "@/components/SearchModal"
import QuickAddFab from "@/components/QuickAddFab"
import MobileBottomBar from "@/components/MobileBottomBar"
import AuxDisplayReceiver from "@/components/AuxDisplayReceiver"

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

const QUICK_LINKS: { label: string; href: string; icon: string; adminOnly?: boolean }[] = [
  { label: "Flexible Assets", href: "/flex", icon: "🧬" },
  { label: "Reporting", href: "/reports", icon: "📊" },
  { label: "Global SOPs", href: "/runbooks", icon: "📋" },
  { label: "Templates", href: "/templates", icon: "🧩" },
  { label: "Review Queue", href: "/docs/review", icon: "🚩" },
  { label: "Client Portal", href: "/portal", icon: "🌐" },
  { label: "Portal Admin", href: "/portal-admin", icon: "🔧" },
  { label: "Audit Log", href: "/admin/audit", icon: "🪵", adminOnly: true },
  { label: "Tech Access", href: "/admin/access", icon: "🔑", adminOnly: true },
  { label: "My Vault", href: "/settings?section=my-vault", icon: "🔐" },
  { label: "Aux Display", href: "/aux-display", icon: "📲" },
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
  const [helpOpen, setHelpOpen] = useState(false)

  useEffect(() => {
    // Two-key vim-style combos: first press records the leader, second
    // press fires the shortcut if it lands within 1500ms.
    let leader: string | null = null
    let leaderTimer: ReturnType<typeof setTimeout> | null = null

    function isTyping(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false
      const tag = target.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true
      if (target.isContentEditable) return true
      return false
    }

    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setSearchOpen(open => !open)
        return
      }

      if (isTyping(e.target)) return

      // Shift + / (aka ?) → help
      if (e.key === "?") {
        e.preventDefault()
        setHelpOpen(open => !open)
        return
      }

      if (leader === "g") {
        if (e.key === "c") { router.push("/clients"); leader = null; return }
        if (e.key === "d") { router.push("/dashboard"); leader = null; return }
        if (e.key === "r") { router.push("/runbooks"); leader = null; return }
        if (e.key === "v") { router.push("/settings?section=my-vault"); leader = null; return }
        if (e.key === "e") { router.push("/expirations"); leader = null; return }
        leader = null
      }

      if (e.key === "g") {
        leader = "g"
        if (leaderTimer) clearTimeout(leaderTimer)
        leaderTimer = setTimeout(() => { leader = null }, 1500)
        return
      }
    }
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("keydown", onKey)
      if (leaderTimer) clearTimeout(leaderTimer)
    }
  }, [router])

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
                {QUICK_LINKS.filter(
                  (link) => !link.adminOnly || (session?.user as { role?: string })?.role === "ADMIN"
                ).map((link, i, links) => (
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
                      borderBottom: i < links.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none",
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
      <MobileBottomBar onOpenSearch={openSearch} />
      {searchOpen && <SearchModal onClose={closeSearch} />}
      {helpOpen && <ShortcutHelp onClose={() => setHelpOpen(false)} />}
      <QuickAddFab />
      <AuxDisplayReceiver />
    </div>
  )
}

function ShortcutHelp({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const rows: [string, string][] = [
    ["⌘K / Ctrl+K", "Open global search"],
    ["?", "Toggle this help"],
    ["g c", "Go to Clients"],
    ["g d", "Go to Dashboard"],
    ["g r", "Go to Runbooks (Global SOPs)"],
    ["g v", "Go to My Vault"],
    ["g e", "Go to Expirations"],
    ["Esc", "Close any open modal"],
  ]

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-background-primary)",
          border: "0.5px solid var(--color-border-secondary)",
          borderRadius: 12, padding: 24, width: "100%", maxWidth: 440,
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 500, marginBottom: 16 }}>Keyboard shortcuts</h2>
        <div style={{ display: "grid", gridTemplateColumns: "130px 1fr", rowGap: 8, columnGap: 16 }}>
          {rows.map(([k, v]) => (
            <React.Fragment key={k}>
              <code style={{
                fontFamily: "ui-monospace, monospace",
                background: "var(--color-background-secondary)",
                padding: "3px 8px", borderRadius: 6, fontSize: 12, textAlign: "center",
                border: "0.5px solid var(--color-border-tertiary)",
              }}>
                {k}
              </code>
              <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>{v}</span>
            </React.Fragment>
          ))}
        </div>
        <div style={{ marginTop: 20, fontSize: 11, color: "var(--color-text-muted)" }}>
          Press <kbd style={{ fontFamily: "ui-monospace, monospace" }}>Esc</kbd> or click outside to close.
        </div>
      </div>
    </div>
  )
}
