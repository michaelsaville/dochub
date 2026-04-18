"use client"

import { useSession, signOut } from "next-auth/react"
import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"
import { useState, useEffect } from "react"
import { useTheme } from "@/components/ThemeProvider"

const nav = [
  { label: "Dashboard",   href: "/dashboard"      },
  { label: "Clients",     href: "/clients"        },
  { label: "AI Intake",   href: "/intake"         },
  { label: "Settings",    href: "/settings"       },
]


export default function Sidebar({ onOpenSearch }: { onOpenSearch?: () => void }) {
  const { data: session } = useSession()
  const pathname = usePathname()
  const router = useRouter()
  const { themeId, setThemeId } = useTheme()
  const isLight = themeId === "pcc-light"
  const [logoExists, setLogoExists] = useState(false)

  useEffect(() => {
    fetch("/api/settings/logo", { method: "HEAD" })
      .then(r => setLogoExists(r.ok))
      .catch(() => {})
  }, [])

  return (
    <aside style={{
      width: "220px",
      height: "100vh",
      position: "sticky",
      top: 0,
      borderRight: "0.5px solid var(--color-border-tertiary)",
      background: "var(--color-background-secondary)",
      display: "flex",
      flexDirection: "column",
      flexShrink: 0,
      overflowY: "auto",
    }}>

      {/* Brand */}
      <div style={{
        padding: "18px 20px 16px",
        borderBottom: "0.5px solid var(--color-border-tertiary)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        {logoExists ? (
          <img
            src="/api/settings/logo"
            alt="Company logo"
            style={{ maxHeight: "32px", maxWidth: "140px", objectFit: "contain" }}
          />
        ) : (
          <div style={{ fontFamily: "var(--mono)", fontSize: "11px", fontWeight: 600, color: "var(--accent)", letterSpacing: "0.08em" }}>
            PCC<span style={{ color: "var(--muted)", fontWeight: 400 }}> // </span>DOCHUB
          </div>
        )}
      </div>

      {/* Search button */}
      <div style={{ padding: "8px 8px 4px" }}>
        <button
          onClick={onOpenSearch}
          style={{
            display: "flex", alignItems: "center", gap: "8px",
            width: "100%", padding: "7px 10px", borderRadius: "6px",
            background: "rgba(61,111,255,0.06)", border: "0.5px solid var(--color-border-tertiary)",
            cursor: "pointer", color: "var(--muted)", fontSize: "12px",
            fontFamily: "var(--sans)",
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span style={{ flex: 1, textAlign: "left" }}>Search...</span>
          <span style={{ fontSize: "10px", opacity: 0.6, fontFamily: "var(--mono)" }}>⌘K</span>
        </button>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "6px 8px" }}>
        {nav.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/")
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "7px 12px",
                borderRadius: "5px",
                fontSize: "13px",
                fontWeight: active ? 500 : 400,
                color: active ? "var(--text)" : "var(--muted)",
                background: active ? "rgba(61, 111, 255, 0.1)" : "transparent",
                textDecoration: "none",
                marginBottom: "2px",
                borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
                paddingLeft: "10px",
                transition: "color 0.15s, background 0.15s",
              }}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div style={{
        padding: "12px 16px",
        borderTop: "0.5px solid var(--color-border-tertiary)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-primary)" }}>
              {session?.user?.name}
            </div>
            <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "2px" }}>
              {session?.user?.email}
            </div>
          </div>
          <button
            onClick={() => setThemeId(isLight ? "pcc-dark" : "pcc-light")}
            title={isLight ? "Switch to dark mode" : "Switch to light mode"}
            style={{
              background: "none", border: "none", cursor: "pointer", padding: "2px",
              color: "var(--muted)", fontSize: "15px", lineHeight: 1, flexShrink: 0,
            }}
          >
            {isLight ? "☾" : "☀"}
          </button>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          style={{
            marginTop: "10px",
            fontSize: "12px",
            color: "var(--color-text-muted)",
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
          }}
        >
          Sign out
        </button>
      </div>
    </aside>
  )
}
