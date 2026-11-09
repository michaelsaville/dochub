"use client"

/**
 * Context-switching sidebar.
 *
 *  - Anywhere outside a client: GLOBAL nav (Dashboard, Clients + pinned/recent
 *    clients, Alerts, Inbox, Runbooks, Reports, Library, Admin).
 *  - On /clients/<id>: the sidebar BECOMES that client's menu — every section is
 *    one click away, grouped under plain headings, with counts. Empty sections
 *    are tucked behind "Show N empty". This replaced the old 3-level
 *    section-chip → tab → sub-tab strip on the client page.
 *
 * The client page reads `?tab=` / `?sub=` reactively, so section links are
 * plain hrefs and deep links / back button keep working.
 *
 * `variant="sheet"` renders the same nav full-height inside the mobile sheet
 * (AppShell owns open/close).
 */

import { useSession, signOut } from "next-auth/react"
import { usePathname, useSearchParams } from "next/navigation"
import Link from "next/link"
import { useState, useEffect, useRef, useCallback } from "react"
import { useTheme } from "@/components/ThemeProvider"
import AppSwitcher from "@/components/AppSwitcher"
import { getRecentClients, RECENTS_EVENT } from "@/lib/recents"

// ── Client section model ────────────────────────────────────────────────────
// `tab` values MUST match the client page's tab names (they're the ?tab= value).
type ClientLink = { tab: string; label?: string; core?: boolean }
const CLIENT_GROUPS: { heading?: string; links: ClientLink[] }[] = [
  {
    links: [
      { tab: "Dashboard", label: "Overview", core: true },
      { tab: "Credentials", core: true },
      { tab: "Assets", core: true },
      { tab: "People", core: true },
      { tab: "Locations" },
      { tab: "Documents", core: true },
      { tab: "SOPs" },
    ],
  },
  {
    heading: "Network & telecom",
    links: [
      { tab: "Network", core: true },
      { tab: "Domains" },
      { tab: "Remote Access" },
      { tab: "Phone System" },
      { tab: "Cameras" },
    ],
  },
  {
    heading: "Software & licensing",
    links: [{ tab: "Licenses" }, { tab: "Subscriptions" }, { tab: "Applications" }],
  },
  {
    heading: "Vendors & portals",
    links: [
      { tab: "Vendors" },
      { tab: "Portal", label: "Client Portal" },
      { tab: "Portal Vault" },
      { tab: "Vendor Portal" },
    ],
  },
]
const CLIENT_FOOTER_LINKS: ClientLink[] = [
  { tab: "Audit Trail", label: "Audit trail", core: true },
  { tab: "Client Settings", label: "Client settings", core: true },
]

export const NETWORK_SUBS: { sub: string; label: string }[] = [
  { sub: "ipam", label: "IP plan" },
  { sub: "circuits", label: "Circuits" },
  { sub: "racks", label: "Racks" },
  { sub: "wireless", label: "Wireless" },
  { sub: "ptp", label: "PtP bridges" },
  { sub: "shares", label: "File shares" },
  { sub: "diagram", label: "Topology" },
]

// ── Global model ────────────────────────────────────────────────────────────
const GLOBAL_MAIN = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Clients", href: "/clients" },
  { label: "Alerts", href: "/alerts", badge: "alerts" as const, also: ["/expirations", "/alarms"] },
  { label: "Inbox", href: "/inbox", badge: "inbox" as const, also: ["/intake", "/notes-intake", "/docs/review"] },
  { label: "Runbooks & SOPs", href: "/runbooks" },
  { label: "Reports", href: "/reports" },
]
const GLOBAL_LIBRARY = [
  { label: "Licenses", href: "/licenses" },
  { label: "Vendors", href: "/vendors" },
  { label: "Expirations", href: "/expirations" },
  { label: "Flexible assets", href: "/flex" },
  { label: "Templates", href: "/templates" },
  { label: "Scan a label", href: "/scan" },
]
const GLOBAL_ADMIN = [
  { label: "Portal admin", href: "/portal-admin" },
  { label: "Messages", href: "/admin/messages" },
  { label: "Audit log", href: "/admin/audit" },
  { label: "Platform backups", href: "/admin/backups" },
  { label: "Tech access", href: "/admin/access" },
  { label: "Merge clients", href: "/clients/merge" },
  { label: "Data import", href: "/import" },
]

// /clients/<id> but not /clients/merge, /clients/new …
const NON_CLIENT_IDS = new Set(["merge", "new", "import"])
export function clientIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/clients\/([^/?#]+)/)
  if (!m || NON_CLIENT_IDS.has(m[1])) return null
  return decodeURIComponent(m[1])
}

type ClientNav = { id: string; name: string; type: string; counts: Record<string, number> }
type Pinned = { id: string; name: string }

function isActive(pathname: string, href: string, also: string[] = []) {
  return [href, ...also].some((h) => pathname === h || pathname.startsWith(h + "/"))
}

// Module-scope pieces (inline components remount on every render — DocHub gotcha)
function NavItem({
  href, label, active, count, badge, indent, onNavigate, title,
}: {
  href: string; label: string; active: boolean; count?: number; badge?: number
  indent?: boolean; onNavigate?: () => void; title?: string
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      title={title}
      aria-current={active ? "page" : undefined}
      className={`dh-nav-item${active ? " active" : ""}${indent ? " indent" : ""}`}
    >
      <span className="dh-nav-label">{label}</span>
      {badge ? <span className="dh-nav-badge">{badge > 99 ? "99+" : badge}</span> : null}
      {count !== undefined && count > 0 && !badge ? <span className="dh-nav-count">{count}</span> : null}
    </Link>
  )
}

function Heading({ children, onClick, open }: { children: React.ReactNode; onClick?: () => void; open?: boolean }) {
  if (onClick) {
    return (
      <button type="button" className="dh-nav-heading dh-nav-heading-btn" onClick={onClick} aria-expanded={open}>
        <span>{children}</span>
        <span aria-hidden style={{ fontSize: 9 }}>{open ? "▾" : "▸"}</span>
      </button>
    )
  }
  return <div className="dh-nav-heading">{children}</div>
}

export default function Sidebar({
  onOpenSearch,
  variant = "rail",
  onNavigate,
}: {
  onOpenSearch?: () => void
  variant?: "rail" | "sheet"
  onNavigate?: () => void
}) {
  const { data: session } = useSession()
  const pathname = usePathname() ?? ""
  const searchParams = useSearchParams()
  const { themeId, setThemeId } = useTheme()
  const isLight = themeId === "pcc-light"
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "ADMIN"
  const [logoExists, setLogoExists] = useState(false)

  const clientId = clientIdFromPath(pathname)
  const activeTab = searchParams?.get("tab") || "Dashboard"
  const activeSub = searchParams?.get("sub") || "ipam"

  const [clientNav, setClientNav] = useState<ClientNav | null>(null)
  const [showEmpty, setShowEmpty] = useState(false)
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const switcherRef = useRef<HTMLDivElement>(null)
  const [pinned, setPinned] = useState<Pinned[]>([])
  const [recent, setRecent] = useState<{ id: string; name: string }[]>([])
  const [alertCount, setAlertCount] = useState(0)
  const [inboxCount, setInboxCount] = useState(0)
  const [adminOpen, setAdminOpen] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(true)

  useEffect(() => {
    fetch("/api/settings/logo", { method: "HEAD" }).then((r) => setLogoExists(r.ok)).catch(() => {})
    fetch("/api/alerts/unified")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.stats) setAlertCount((d.stats.expired ?? 0) + (d.stats.critical ?? 0)) })
      .catch(() => {})
    fetch("/api/inbox/counts").then((r) => (r.ok ? r.json() : null)).then((d) => d && setInboxCount(d.total ?? 0)).catch(() => {})
    try {
      setAdminOpen(localStorage.getItem("dochub:nav-admin-open") === "1")
      setLibraryOpen(localStorage.getItem("dochub:nav-library-open") !== "0")
    } catch { /* ignore */ }
  }, [])

  const loadPins = useCallback(() => {
    fetch("/api/me/pinned-clients").then((r) => (r.ok ? r.json() : null)).then((d) => d && setPinned(d.pinned ?? [])).catch(() => {})
  }, [])
  useEffect(() => {
    loadPins()
    const onPins = () => loadPins()
    window.addEventListener("dochub:pins-changed", onPins)
    return () => window.removeEventListener("dochub:pins-changed", onPins)
  }, [loadPins])

  useEffect(() => {
    const load = () => setRecent(getRecentClients(8))
    load()
    window.addEventListener(RECENTS_EVENT, load)
    return () => window.removeEventListener(RECENTS_EVENT, load)
  }, [])

  // Client context: load name + per-section counts. Refresh when the page
  // tells us data changed (it dispatches dochub:client-changed after saves).
  useEffect(() => {
    if (!clientId) { setClientNav(null); return }
    let cancelled = false
    const load = () =>
      fetch(`/api/clients/${clientId}/nav`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (!cancelled && d) setClientNav(d) })
        .catch(() => {})
    if (clientNav?.id !== clientId) setClientNav(null)
    load()
    window.addEventListener("dochub:client-changed", load)
    return () => { cancelled = true; window.removeEventListener("dochub:client-changed", load) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  useEffect(() => {
    if (!switcherOpen) return
    const onDown = (e: MouseEvent) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) setSwitcherOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [switcherOpen])
  useEffect(() => { setSwitcherOpen(false) }, [pathname])

  const toggleAdmin = () => setAdminOpen((v) => { try { localStorage.setItem("dochub:nav-admin-open", v ? "0" : "1") } catch {} return !v })
  const toggleLibrary = () => setLibraryOpen((v) => { try { localStorage.setItem("dochub:nav-library-open", v ? "0" : "1") } catch {} return !v })

  const isPinned = !!clientId && pinned.some((p) => p.id === clientId)
  async function togglePin() {
    if (!clientId) return
    const res = await fetch("/api/me/pinned-clients", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, pinned: !isPinned }),
    }).catch(() => null)
    if (res?.ok) { const d = await res.json(); setPinned(d.pinned ?? []); window.dispatchEvent(new Event("dochub:pins-changed")) }
  }

  const tabHref = (tab: string) => `/clients/${clientId}?tab=${encodeURIComponent(tab)}`
  // A section is "empty" only when we have a count and it's 0. Subscriptions
  // has no cheap count; it lives with Licenses.
  const countOf = (tab: string) => clientNav?.counts?.[tab]
  const isEmpty = (l: ClientLink) => {
    if (l.core || l.tab === activeTab) return false
    if (l.tab === "Subscriptions") return (countOf("Licenses") ?? 0) === 0
    const n = countOf(l.tab)
    return n !== undefined && n === 0
  }
  const allClientLinks = CLIENT_GROUPS.flatMap((g) => g.links)
  const emptyCount = clientNav ? allClientLinks.filter(isEmpty).length : 0

  const sheet = variant === "sheet"

  return (
    <aside
      className={sheet ? "dochub-sidebar-sheet" : "dochub-sidebar"}
      aria-label="Main navigation"
      style={{
        width: sheet ? "100%" : "232px",
        height: sheet ? "100%" : "100vh",
        position: sheet ? "relative" : "sticky",
        top: 0,
        borderRight: sheet ? "none" : "0.5px solid var(--color-border-tertiary)",
        background: "var(--color-background-secondary)",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        overflowY: "auto",
      }}
    >
      {/* Brand */}
      {!sheet && (
        <div style={{ padding: "16px 20px 14px", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
          {logoExists ? (
            <img src="/api/settings/logo" alt="Company logo" style={{ maxHeight: "30px", maxWidth: "140px", objectFit: "contain" }} />
          ) : (
            <div style={{ fontFamily: "var(--mono)", fontSize: "11px", fontWeight: 600, color: "var(--accent)", letterSpacing: "0.08em" }}>
              PCC<span style={{ color: "var(--muted)", fontWeight: 400 }}> // </span>DOCHUB
            </div>
          )}
        </div>
      )}

      {!sheet && <AppSwitcher current="dochub" />}

      {/* Search */}
      <div style={{ padding: "8px 8px 4px" }}>
        <button type="button" onClick={() => { onNavigate?.(); onOpenSearch?.() }} className="dh-nav-search">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span style={{ flex: 1, textAlign: "left" }}>Search everything…</span>
          <kbd style={{ fontSize: "10px", opacity: 0.6, fontFamily: "var(--mono)" }}>⌘K</kbd>
        </button>
      </div>

      <nav style={{ flex: 1, padding: "4px 8px 12px" }}>
        {clientId ? (
          <>
            {/* ── Client context ───────────────────────────────────────── */}
            <Link href="/clients" onClick={onNavigate} className="dh-nav-back">← All clients</Link>

            <div ref={switcherRef} style={{ position: "relative", margin: "4px 0 8px" }}>
              <div style={{ display: "flex", alignItems: "stretch", gap: 4 }}>
                <button
                  type="button"
                  onClick={() => setSwitcherOpen((v) => !v)}
                  aria-expanded={switcherOpen}
                  aria-haspopup="listbox"
                  className="dh-client-switch"
                  title="Switch client"
                >
                  <span className="dh-client-switch-name">{clientNav?.name ?? "Loading…"}</span>
                  <span aria-hidden style={{ fontSize: 10, opacity: 0.6 }}>▾</span>
                </button>
                <button
                  type="button"
                  onClick={togglePin}
                  className={`dh-pin-btn${isPinned ? " on" : ""}`}
                  title={isPinned ? "Unpin client" : "Pin client to sidebar"}
                  aria-pressed={isPinned}
                >
                  {isPinned ? "★" : "☆"}
                </button>
              </div>
              {switcherOpen && (
                <div className="dh-switch-menu" role="listbox">
                  {pinned.filter((p) => p.id !== clientId).length > 0 && <div className="dh-switch-heading">Pinned</div>}
                  {pinned.filter((p) => p.id !== clientId).map((p) => (
                    <Link key={"p" + p.id} href={`/clients/${p.id}`} onClick={onNavigate} className="dh-switch-item">★ {p.name}</Link>
                  ))}
                  {recent.filter((r) => r.id !== clientId && !pinned.some((p) => p.id === r.id)).length > 0 && (
                    <div className="dh-switch-heading">Recent</div>
                  )}
                  {recent
                    .filter((r) => r.id !== clientId && !pinned.some((p) => p.id === r.id))
                    .slice(0, 6)
                    .map((r) => (
                      <Link key={"r" + r.id} href={`/clients/${r.id}`} onClick={onNavigate} className="dh-switch-item">{r.name}</Link>
                    ))}
                  <Link href="/clients" onClick={onNavigate} className="dh-switch-item" style={{ color: "var(--accent)" }}>All clients…</Link>
                </div>
              )}
            </div>

            {CLIENT_GROUPS.map((g, gi) => {
              const links = g.links.filter((l) => showEmpty || !isEmpty(l))
              if (!links.length) return null
              return (
                <div key={gi} style={{ marginBottom: 6 }}>
                  {g.heading && <Heading>{g.heading}</Heading>}
                  {links.map((l) => {
                    const active = activeTab === l.tab
                    const count = l.tab === "Dashboard" ? undefined : countOf(l.tab)
                    return (
                      <div key={l.tab}>
                        <NavItem
                          href={tabHref(l.tab)}
                          label={l.label ?? l.tab}
                          active={active}
                          count={count}
                          onNavigate={onNavigate}
                        />
                        {l.tab === "Network" && activeTab === "Network" && (
                          <div style={{ margin: "2px 0 4px" }}>
                            {NETWORK_SUBS.map((s) => (
                              <NavItem
                                key={s.sub}
                                href={`${tabHref("Network")}&sub=${s.sub}`}
                                label={s.label}
                                active={activeSub === s.sub}
                                indent
                                onNavigate={onNavigate}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}

            {emptyCount > 0 && (
              <button type="button" onClick={() => setShowEmpty((v) => !v)} className="dh-nav-more">
                {showEmpty ? "Hide empty sections" : `+ ${emptyCount} empty section${emptyCount === 1 ? "" : "s"}`}
              </button>
            )}

            <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", marginTop: 8, paddingTop: 8 }}>
              {CLIENT_FOOTER_LINKS.map((l) => (
                <NavItem key={l.tab} href={tabHref(l.tab)} label={l.label ?? l.tab} active={activeTab === l.tab} onNavigate={onNavigate} />
              ))}
            </div>
          </>
        ) : (
          <>
            {/* ── Global ───────────────────────────────────────────────── */}
            {GLOBAL_MAIN.map((item) => (
              <div key={item.href}>
                <NavItem
                  href={item.href}
                  label={item.label}
                  active={isActive(pathname, item.href, item.also)}
                  badge={item.badge === "alerts" ? alertCount : item.badge === "inbox" ? inboxCount : undefined}
                  onNavigate={onNavigate}
                />
                {item.href === "/clients" && (pinned.length > 0 || recent.length > 0) && (
                  <div style={{ margin: "2px 0 6px" }}>
                    {pinned.slice(0, 8).map((p) => (
                      <NavItem key={"p" + p.id} href={`/clients/${p.id}`} label={`★ ${p.name}`} active={false} indent onNavigate={onNavigate} title="Pinned client" />
                    ))}
                    {recent
                      .filter((r) => !pinned.some((p) => p.id === r.id))
                      .slice(0, Math.max(0, 5 - Math.min(pinned.length, 3)))
                      .map((r) => (
                        <NavItem key={"r" + r.id} href={`/clients/${r.id}`} label={r.name} active={false} indent onNavigate={onNavigate} title="Recently opened" />
                      ))}
                  </div>
                )}
              </div>
            ))}

            <div style={{ marginTop: 10 }}>
              <Heading onClick={toggleLibrary} open={libraryOpen}>Library</Heading>
              {libraryOpen && GLOBAL_LIBRARY.map((item) => (
                <NavItem key={item.href} href={item.href} label={item.label} active={isActive(pathname, item.href)} onNavigate={onNavigate} />
              ))}
            </div>

            {isAdmin && (
              <div style={{ marginTop: 10 }}>
                <Heading onClick={toggleAdmin} open={adminOpen}>Admin</Heading>
                {adminOpen && GLOBAL_ADMIN.map((item) => (
                  <NavItem key={item.href} href={item.href} label={item.label} active={isActive(pathname, item.href)} onNavigate={onNavigate} />
                ))}
              </div>
            )}
          </>
        )}
      </nav>

      {/* Footer */}
      <div style={{ padding: "10px 12px 12px", borderTop: "0.5px solid var(--color-border-tertiary)" }}>
        <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
          <Link href="/settings?section=my-vault" onClick={onNavigate} className="dh-foot-btn">My vault</Link>
          <Link href="/settings" onClick={onNavigate} className={`dh-foot-btn${pathname.startsWith("/settings") ? " active" : ""}`}>Settings</Link>
          <button
            type="button"
            onClick={() => setThemeId(isLight ? "pcc-dark" : "pcc-light")}
            title={isLight ? "Switch to dark mode" : "Switch to light mode"}
            aria-label={isLight ? "Switch to dark mode" : "Switch to light mode"}
            className="dh-foot-btn"
            style={{ flex: "0 0 auto", width: 34 }}
          >
            {isLight ? "☾" : "☀"}
          </button>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {session?.user?.name}
            </div>
            <div style={{ fontSize: "10px", color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {session?.user?.email}
            </div>
          </div>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            style={{ fontSize: "11px", color: "var(--color-text-muted)", background: "none", border: "none", padding: "6px 0", cursor: "pointer", flexShrink: 0 }}
          >
            Sign out
          </button>
        </div>
      </div>
    </aside>
  )
}
