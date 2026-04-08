"use client"

import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useEffect, useState, useCallback } from "react"
import Sidebar from "@/components/Sidebar"
import SearchModal from "@/components/SearchModal"

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login")
  }, [status, router])

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
      <main style={{ flex: 1, overflow: "auto" }}>
        {children}
      </main>
      {searchOpen && <SearchModal onClose={closeSearch} />}
    </div>
  )
}
