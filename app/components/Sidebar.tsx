"use client"

import { useSession, signOut } from "next-auth/react"
import { usePathname } from "next/navigation"
import Link from "next/link"

const nav = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Clients", href: "/clients" },
  { label: "Vendors", href: "/vendors" },
  { label: "Runbooks", href: "/runbooks" },
  { label: "Alarms", href: "/alarms" },
  { label: "Settings", href: "/settings" },
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
      padding: "0",
      flexShrink: 0,
    }}>
      <div style={{
        padding: "20px 20px 16px",
        borderBottom: "0.5px solid var(--color-border-tertiary)",
      }}>
        <div style={{ fontSize: "15px", fontWeight: 500, color: "var(--color-text-primary)" }}>DocHub</div>
        <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "2px" }}>PCC2K</div>
      </div>

      <nav style={{ flex: 1, padding: "12px 8px" }}>
        {nav.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/")
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "block",
                padding: "8px 12px",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: active ? 500 : 400,
                color: active ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                background: active ? "var(--color-background-primary)" : "transparent",
                textDecoration: "none",
                marginBottom: "2px",
                border: active ? "0.5px solid var(--color-border-tertiary)" : "0.5px solid transparent",
              }}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div style={{
        padding: "12px 16px",
        borderTop: "0.5px solid var(--color-border-tertiary)",
      }}>
        <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-primary)" }}>
          {session?.user?.name}
        </div>
        <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "1px" }}>
          {session?.user?.email}
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          style={{
            marginTop: "8px",
            fontSize: "12px",
            color: "var(--color-text-secondary)",
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
