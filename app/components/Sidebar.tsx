"use client"

import { useSession, signOut } from "next-auth/react"
import { usePathname } from "next/navigation"
import Link from "next/link"

const nav = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Clients",   href: "/clients"   },
  { label: "Vendors",   href: "/vendors"   },
  { label: "Licenses",  href: "/licenses"  },
  { label: "Alerts",    href: "/alerts"    },
  { label: "Runbooks",  href: "/runbooks"  },
  { label: "Alarms",    href: "/alarms"    },
  { label: "Settings",  href: "/settings"  },
]

export default function Sidebar() {
  const { data: session } = useSession()
  const pathname = usePathname()

  return (
    <aside style={{
      width: "220px",
      minHeight: "100vh",
      borderRight: "0.5px solid var(--color-border-tertiary)",
      background: "var(--color-background-secondary)",
      display: "flex",
      flexDirection: "column",
      flexShrink: 0,
    }}>

      {/* Brand */}
      <div style={{
        padding: "18px 20px 16px",
        borderBottom: "0.5px solid var(--color-border-tertiary)",
      }}>
        <div style={{ fontFamily: "var(--mono)", fontSize: "11px", fontWeight: 600, color: "var(--accent)", letterSpacing: "0.08em" }}>
          PCC<span style={{ color: "var(--muted)", fontWeight: 400 }}> // </span>DOCHUB
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "10px 8px" }}>
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
        <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-primary)" }}>
          {session?.user?.name}
        </div>
        <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "2px" }}>
          {session?.user?.email}
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
