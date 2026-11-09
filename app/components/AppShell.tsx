"use client"

import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import React, { useEffect, useState, useCallback, Suspense } from "react"
import Sidebar from "@/components/Sidebar"
import SearchModal from "@/components/SearchModal"
import QuickAddFab from "@/components/QuickAddFab"
import MobileBottomBar from "@/components/MobileBottomBar"
import AuxDisplayReceiver from "@/components/AuxDisplayReceiver"

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [searchOpen, setSearchOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)

  // The client page's mobile "section" button (and anything else) can ask for
  // the nav sheet without prop-drilling.
  useEffect(() => {
    const open = () => setNavOpen(true)
    window.addEventListener("dochub:open-nav", open)
    return () => window.removeEventListener("dochub:open-nav", open)
  }, [])
  useEffect(() => {
    if (!navOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setNavOpen(false) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [navOpen])

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
        if (e.key === "a") { router.push("/alerts"); leader = null; return }
        if (e.key === "i") { router.push("/inbox"); leader = null; return }
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
      <Suspense fallback={<div className="dochub-sidebar" style={{ width: 232, flexShrink: 0 }} />}>
        <Sidebar onOpenSearch={openSearch} />
      </Suspense>
      <main style={{ flex: 1, minWidth: 0, overflow: "auto", position: "relative" }}>
        {children}
      </main>
      <MobileBottomBar onOpenSearch={openSearch} onOpenNav={() => setNavOpen(true)} />
      {navOpen && (
        <>
          <div className="dh-sheet-backdrop" onClick={() => setNavOpen(false)} />
          <div className="dh-sheet-panel" role="dialog" aria-modal="true" aria-label="Navigation">
            <div className="dh-sheet-grab">
              <span style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600, color: "var(--accent)", letterSpacing: ".08em" }}>DOCHUB</span>
              <button type="button" onClick={() => setNavOpen(false)} aria-label="Close navigation"
                style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 22, minWidth: 44, minHeight: 44, cursor: "pointer" }}>×</button>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <Suspense fallback={null}>
                <Sidebar variant="sheet" onOpenSearch={openSearch} onNavigate={() => setNavOpen(false)} />
              </Suspense>
            </div>
          </div>
        </>
      )}
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
    ["g a", "Go to Alerts"],
    ["g i", "Go to Inbox"],
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
