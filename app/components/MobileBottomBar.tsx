"use client"

import { useRouter, usePathname } from "next/navigation"

interface Props {
  onOpenSearch?: () => void
  onOpenNav?: () => void
}

/**
 * Mobile-only bottom nav. The desktop sidebar is CSS-hidden below md
 * via globals.css; this bar takes its place and keeps the core routes
 * + search reachable without eating a sidebar's worth of viewport.
 */
export default function MobileBottomBar({ onOpenSearch, onOpenNav }: Props) {
  const router = useRouter()
  const pathname = usePathname() ?? ""

  // Inside a client, the menu button opens THAT client's sections (the sheet
  // renders the context sidebar), so it's labelled accordingly.
  const inClient = /^\/clients\/(?!merge|new|import)[^/]+/.test(pathname)
  const items: { label: string; icon: string; onClick: () => void; match: string }[] = [
    { label: "Home",    icon: "🏠", onClick: () => router.push("/dashboard"), match: "/dashboard" },
    { label: "Clients", icon: "🏢", onClick: () => router.push("/clients"),   match: "/clients" },
    { label: "Search",  icon: "🔍", onClick: () => onOpenSearch?.(),           match: "" },
    { label: "Scan",    icon: "📷", onClick: () => router.push("/scan"),       match: "/scan" },
    { label: inClient ? "Sections" : "More", icon: "☰", onClick: () => onOpenNav?.(), match: "" },
  ]

  return (
    <nav className="dochub-bottombar" aria-label="Mobile navigation">
      {items.map(it => {
        const active = !!it.match && pathname.startsWith(it.match)
        return (
          <button
            key={it.label}
            onClick={it.onClick}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
              padding: "8px 4px",
              minHeight: 52,
              background: "none",
              border: "none",
              cursor: "pointer",
              color: active ? "var(--color-text-primary)" : "var(--color-text-secondary)",
              fontWeight: active ? 600 : 400,
              fontSize: 10,
            }}
          >
            <span style={{ fontSize: 20 }}>{it.icon}</span>
            <span>{it.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
