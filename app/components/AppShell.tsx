"use client"

import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useEffect, useState, useCallback } from "react"
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

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [searchOpen, setSearchOpen] = useState(false)
  const [alertCount, setAlertCount] = useState(0)

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login")
  }, [status, router])

  useEffect(() => {
    fetch("/api/alerts?days=90")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return
        const count = (d.domains?.length ?? 0) + (d.sslCerts?.length ?? 0) + (d.licenses?.length ?? 0) + (d.credentials?.length ?? 0)
        setAlertCount(count)
      })
      .catch(() => {})
  }, [])

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
        {/* Alert bell — top right of main content area */}
        <button
          onClick={() => router.push("/alerts")}
          title={alertCount > 0 ? `${alertCount} expiry alert${alertCount !== 1 ? "s" : ""}` : "No expiry alerts"}
          style={{
            position: "fixed",
            top: "16px",
            right: "20px",
            zIndex: 40,
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
        {children}
      </main>
      {searchOpen && <SearchModal onClose={closeSearch} />}
    </div>
  )
}
