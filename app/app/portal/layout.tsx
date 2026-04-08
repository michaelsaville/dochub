"use client"

import { useState, useEffect, createContext, useContext } from "react"
import { useRouter, usePathname } from "next/navigation"

type PortalUser = {
  id: string
  name: string
  email: string
  client: { id: string; name: string }
  permissions: Record<string, boolean>
}

const PortalCtx = createContext<PortalUser | null>(null)
export function usePortalUser() { return useContext(PortalCtx) }

const NAV_SECTIONS = [
  { key: "dashboard", label: "Overview",  href: "/portal/dashboard" },
  { key: "assets",    label: "Assets",    href: "/portal/assets" },
  { key: "documents", label: "Documents", href: "/portal/documents" },
  { key: "contacts",  label: "Contacts",  href: "/portal/contacts" },
  { key: "locations", label: "Locations", href: "/portal/locations" },
  { key: "licenses",  label: "Licenses",  href: "/portal/licenses" },
  { key: "domains",   label: "Domains",   href: "/portal/domains" },
]

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PortalUser | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (pathname === "/portal/login") { setLoading(false); return }
    fetch("/api/portal/auth/me")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) { router.push("/portal/login"); return }
        setUser(d)
      })
      .catch(() => router.push("/portal/login"))
      .finally(() => setLoading(false))
  }, [pathname, router])

  async function logout() {
    await fetch("/api/portal/auth/logout", { method: "POST" })
    router.push("/portal/login")
  }

  if (pathname === "/portal/login") return <>{children}</>

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-background-primary)" }}>
        <div style={{ fontSize: "14px", color: "var(--color-text-muted)" }}>Loading...</div>
      </div>
    )
  }

  const visibleNav = NAV_SECTIONS.filter(s =>
    s.key === "dashboard" || (user?.permissions[s.key])
  )

  return (
    <PortalCtx.Provider value={user}>
      <div style={{ minHeight: "100vh", background: "var(--color-background-primary)", display: "flex", flexDirection: "column" }}>
        {/* Top nav */}
        <header style={{
          borderBottom: "0.5px solid var(--color-border-tertiary)",
          background: "var(--color-background-secondary)",
          padding: "0 24px",
          display: "flex", alignItems: "center", gap: "24px", height: "52px",
          flexShrink: 0,
        }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: "11px", fontWeight: 600, color: "var(--accent)", letterSpacing: "0.08em", flexShrink: 0 }}>
            CLIENT PORTAL
          </div>
          {user && (
            <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-secondary)", flexShrink: 0 }}>
              {user.client.name}
            </div>
          )}

          {/* Nav */}
          <nav style={{ display: "flex", gap: "2px", flex: 1, overflowX: "auto" }}>
            {visibleNav.map(s => {
              const active = pathname === s.href
              return (
                <a key={s.key} href={s.href} style={{
                  padding: "0 14px", height: "52px", display: "flex", alignItems: "center",
                  fontSize: "13px", fontWeight: active ? 500 : 400, textDecoration: "none",
                  color: active ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                  borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
                  whiteSpace: "nowrap", flexShrink: 0,
                }}>
                  {s.label}
                </a>
              )
            })}
          </nav>

          {/* User + logout */}
          {user && (
            <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
              <div style={{ fontSize: "13px", color: "var(--color-text-muted)" }}>{user.name}</div>
              <button onClick={logout} style={{ fontSize: "12px", color: "var(--color-text-muted)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                Sign out
              </button>
            </div>
          )}
        </header>

        {/* Content */}
        <main style={{ flex: 1, padding: "32px 24px", maxWidth: "1100px", width: "100%", margin: "0 auto" }}>
          {children}
        </main>
      </div>
    </PortalCtx.Provider>
  )
}
