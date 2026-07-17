"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"

type SearchResult = {
  id: string
  label: string
  sublabel?: string
  category: string
  href: string
  categoryColor: string
}

const CATEGORY_META: Record<string, { label: string; color: string }> = {
  client:     { label: "Client",     color: "#3d6fff" },
  asset:      { label: "Asset",      color: "#00d4aa" },
  credential: { label: "Credential", color: "#ec4899" },
  runbook:    { label: "Runbook",    color: "#f59e0b" },
  document:   { label: "Document",   color: "#6366f1" },
  file:       { label: "File",       color: "#14b8a6" },
  person:     { label: "Contact",    color: "#0ea5e9" },
  vendor:     { label: "Vendor",     color: "#a855f7" },
  license:    { label: "License",    color: "#f97316" },
  location:   { label: "Location",   color: "#eab308" },
  netdevice:  { label: "Network",    color: "#10b981" },
  circuit:    { label: "Circuit",    color: "#f43f5e" },
}

function flattenResults(data: {
  clients: { id: string; name: string; type: string }[]
  assets: { id: string; name: string; friendlyName: string | null; category: string | null; make: string | null; model: string | null; location: { client: { id: string; name: string } } | null }[]
  credentials: { id: string; label: string; username: string | null; url: string | null; client: { id: string; name: string } }[]
  runbooks: { id: string; title: string; summary: string | null; clientId: string | null; client: { id: string; name: string } | null }[]
  documents: { id: string; title: string; clientId: string; client: { id: string; name: string } }[]
  files: { id: string; originalName: string; mimeType: string | null; clientId: string | null; documentId: string | null; client: { id: string; name: string } | null }[]
  people: { id: string; name: string; email: string | null; jobTitle: string | null; clientId: string | null; client: { id: string; name: string } | null }[]
  vendors: { id: string; name: string; website: string | null; category: string | null }[]
  licenses: { id: string; name: string; vendor: string | null; clientId: string | null; client: { id: string; name: string } | null }[]
  locations: { id: string; name: string; city: string | null; clientId: string | null; client: { id: string; name: string } | null }[]
  netdevices: { id: string; name: string; ipAddress: string | null; type: string | null; clientId: string | null; client: { id: string; name: string } | null }[]
  circuits: { id: string; label: string; wanIp: string | null; clientId: string | null; client: { id: string; name: string } | null }[]
}): SearchResult[] {
  const results: SearchResult[] = []

  for (const c of data.clients) {
    results.push({
      id: c.id, category: "client", categoryColor: CATEGORY_META.client.color,
      label: c.name,
      sublabel: c.type === "BUSINESS" ? "Business client" : "Residential client",
      href: `/clients/${c.id}`,
    })
  }
  for (const a of data.assets) {
    const clientName = a.location?.client?.name
    results.push({
      id: a.id, category: "asset", categoryColor: CATEGORY_META.asset.color,
      label: a.friendlyName || a.name,
      sublabel: [a.make, a.model, clientName].filter(Boolean).join(" · "),
      href: `/assets/${a.id}`,
    })
  }
  for (const c of data.credentials) {
    results.push({
      id: c.id, category: "credential", categoryColor: CATEGORY_META.credential.color,
      label: c.label,
      sublabel: [c.username, c.client.name].filter(Boolean).join(" · "),
      href: `/clients/${c.client.id}?tab=Credentials`,
    })
  }
  for (const r of data.runbooks) {
    results.push({
      id: r.id, category: "runbook", categoryColor: CATEGORY_META.runbook.color,
      label: r.title,
      sublabel: r.client ? r.client.name : "Global runbook",
      href: r.clientId ? `/clients/${r.clientId}?tab=SOPs` : `/runbooks/${r.id}`,
    })
  }
  for (const d of data.documents) {
    results.push({
      id: d.id, category: "document", categoryColor: CATEGORY_META.document.color,
      label: d.title,
      sublabel: d.client.name,
      href: `/clients/${d.clientId}?tab=Documents`,
    })
  }
  for (const f of data.files) {
    results.push({
      id: f.id, category: "file", categoryColor: CATEGORY_META.file.color,
      label: f.originalName,
      sublabel: [f.client?.name, f.mimeType].filter(Boolean).join(" · "),
      href: f.clientId ? `/clients/${f.clientId}?tab=Documents` : "#",
    })
  }
  for (const p of data.people) {
    results.push({
      id: p.id, category: "person", categoryColor: CATEGORY_META.person.color,
      label: p.name,
      sublabel: [p.jobTitle, p.email, p.client?.name].filter(Boolean).join(" · "),
      href: p.clientId ? `/clients/${p.clientId}?tab=People` : "#",
    })
  }
  for (const v of data.vendors) {
    results.push({
      id: v.id, category: "vendor", categoryColor: CATEGORY_META.vendor.color,
      label: v.name,
      sublabel: [v.category, v.website].filter(Boolean).join(" · "),
      href: `/vendors/${v.id}`,
    })
  }
  for (const l of data.licenses) {
    results.push({
      id: l.id, category: "license", categoryColor: CATEGORY_META.license.color,
      label: l.name,
      sublabel: [l.vendor, l.client?.name].filter(Boolean).join(" · "),
      href: l.clientId ? `/clients/${l.clientId}?tab=Licenses` : "#",
    })
  }
  for (const loc of data.locations) {
    results.push({
      id: loc.id, category: "location", categoryColor: CATEGORY_META.location.color,
      label: loc.name,
      sublabel: [loc.city, loc.client?.name].filter(Boolean).join(" · "),
      href: loc.clientId ? `/clients/${loc.clientId}?tab=Locations` : "#",
    })
  }
  for (const n of data.netdevices) {
    results.push({
      id: n.id, category: "netdevice", categoryColor: CATEGORY_META.netdevice.color,
      label: n.name,
      sublabel: [n.ipAddress, n.client?.name].filter(Boolean).join(" · "),
      href: n.clientId ? `/clients/${n.clientId}?tab=Network` : "#",
    })
  }
  for (const c of data.circuits) {
    results.push({
      id: c.id, category: "circuit", categoryColor: CATEGORY_META.circuit.color,
      label: c.label,
      sublabel: [c.wanIp, c.client?.name].filter(Boolean).join(" · "),
      href: c.clientId ? `/clients/${c.clientId}?tab=Network` : "#",
    })
  }

  return results
}

export default function SearchModal({
  onClose,
  scopeClientId,
  scopeClientName,
}: {
  onClose: () => void
  scopeClientId?: string | null
  scopeClientName?: string | null
}) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.length < 2) { setResults([]); setLoading(false); return }

    setLoading(true)
    const url = scopeClientId
      ? `/api/search?q=${encodeURIComponent(query)}&clientId=${encodeURIComponent(scopeClientId)}`
      : `/api/search?q=${encodeURIComponent(query)}`
    debounceRef.current = setTimeout(() => {
      fetch(url)
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (d) { setResults(flattenResults(d)); setActiveIdx(0) }
        })
        .finally(() => setLoading(false))
    }, 200)
  }, [query, scopeClientId])

  const navigate = useCallback((href: string) => {
    router.push(href)
    onClose()
  }, [router, onClose])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { onClose(); return }
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setActiveIdx(i => Math.min(i + 1, results.length - 1))
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setActiveIdx(i => Math.max(i - 1, 0))
      } else if (e.key === "Enter" && results[activeIdx]) {
        navigate(results[activeIdx].href)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [results, activeIdx, navigate, onClose])

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${activeIdx}"]`) as HTMLElement | null
    el?.scrollIntoView({ block: "nearest" })
  }, [activeIdx])

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 999,
          background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)",
        }}
      />

      {/* Modal */}
      <div style={{
        position: "fixed", top: "15vh", left: "50%", transform: "translateX(-50%)",
        zIndex: 1000, width: "100%", maxWidth: "580px",
        background: "var(--surface)", borderRadius: "14px",
        border: "0.5px solid var(--color-border-primary)",
        boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
        overflow: "hidden",
      }}>
        {/* Search input */}
        <div style={{
          display: "flex", alignItems: "center", gap: "10px",
          padding: "14px 16px",
          borderBottom: results.length > 0 || (query.length >= 2 && !loading)
            ? "0.5px solid var(--border)"
            : "none",
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          {scopeClientName && (
            <span style={{
              fontSize: "11px", fontWeight: 500,
              background: "rgba(59,130,246,0.14)", color: "#3b82f6",
              padding: "3px 8px", borderRadius: "6px", flexShrink: 0,
              whiteSpace: "nowrap",
            }}>
              in {scopeClientName}
            </span>
          )}
          <input
            ref={inputRef}
            type="text"
            placeholder={scopeClientName
              ? `Search within ${scopeClientName}...`
              : "Search clients, contacts, assets, credentials, licenses, network..."}
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{
              flex: 1, background: "none", border: "none", outline: "none",
              fontSize: "15px", color: "var(--text)", fontFamily: "var(--sans)",
            }}
          />
          {loading && (
            <div style={{ fontSize: "11px", color: "var(--muted)", flexShrink: 0 }}>Searching...</div>
          )}
          <kbd style={{
            fontSize: "11px", color: "var(--muted)", background: "var(--card)",
            border: "0.5px solid var(--border)", borderRadius: "5px",
            padding: "2px 6px", flexShrink: 0, fontFamily: "var(--mono)",
          }}>ESC</kbd>
        </div>

        {/* Quick filters — only when no query typed and not scoped */}
        {query.length === 0 && !scopeClientId && (
          <div style={{
            display: "flex", gap: 6, padding: "10px 16px", flexWrap: "wrap",
            borderBottom: "0.5px solid var(--border)",
          }}>
            <span style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4, alignSelf: "center", marginRight: 4 }}>
              Jump to
            </span>
            {[
              { label: "Expiring soon",  href: "/expirations",                    icon: "⏳" },
              { label: "Flagged docs",   href: "/docs/review",                    icon: "🚩" },
              { label: "Sync errors",    href: "/settings?section=sync-status",   icon: "⚠" },
              { label: "Active alarms",  href: "/alarms",                         icon: "🔔" },
              { label: "My vault",       href: "/settings?section=my-vault",      icon: "🔐" },
            ].map(f => (
              <button
                key={f.label}
                onClick={() => navigate(f.href)}
                style={{
                  fontSize: 11, padding: "4px 10px", borderRadius: 12,
                  background: "var(--card)", color: "var(--text)",
                  border: "0.5px solid var(--border)", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 5,
                }}
              >
                <span>{f.icon}</span>
                {f.label}
              </button>
            ))}
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div ref={listRef} style={{ maxHeight: "420px", overflowY: "auto" }}>
            {results.map((r, i) => {
              const meta = CATEGORY_META[r.category]
              return (
                <div
                  key={r.id + r.category}
                  data-idx={i}
                  onClick={() => navigate(r.href)}
                  style={{
                    display: "flex", alignItems: "center", gap: "12px",
                    padding: "10px 16px", cursor: "pointer",
                    background: i === activeIdx ? "var(--card)" : "transparent",
                    borderBottom: i < results.length - 1 ? "0.5px solid rgba(35,40,64,0.6)" : "none",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={() => setActiveIdx(i)}
                >
                  <span style={{
                    fontSize: "10px", fontWeight: 600, letterSpacing: "0.06em",
                    padding: "2px 7px", borderRadius: "4px", flexShrink: 0,
                    background: `${r.categoryColor}18`,
                    color: r.categoryColor,
                    minWidth: "68px", textAlign: "center",
                    fontFamily: "var(--mono)",
                  }}>
                    {meta.label.toUpperCase()}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {r.label}
                    </div>
                    {r.sublabel && (
                      <div style={{ fontSize: "11px", color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {r.sublabel}
                      </div>
                    )}
                  </div>
                  {i === activeIdx && (
                    <kbd style={{
                      fontSize: "11px", color: "var(--muted)", background: "var(--surface)",
                      border: "0.5px solid var(--border)", borderRadius: "5px",
                      padding: "2px 6px", flexShrink: 0, fontFamily: "var(--mono)",
                    }}>↵</kbd>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Empty state */}
        {query.length >= 2 && !loading && results.length === 0 && (
          <div style={{ padding: "32px", textAlign: "center", color: "var(--muted)", fontSize: "13px" }}>
            No results for <strong style={{ color: "var(--text)" }}>{query}</strong>
          </div>
        )}

        {/* Footer hint */}
        <div style={{
          padding: "8px 16px",
          borderTop: "0.5px solid var(--border)",
          display: "flex", gap: "16px", alignItems: "center",
        }}>
          {[["↑↓", "navigate"], ["↵", "open"], ["ESC", "close"]].map(([key, action]) => (
            <span key={key} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", color: "var(--muted)" }}>
              <kbd style={{
                background: "var(--card)", border: "0.5px solid var(--border)",
                borderRadius: "4px", padding: "1px 5px", fontFamily: "var(--mono)", fontSize: "10px",
              }}>{key}</kbd>
              {action}
            </span>
          ))}
        </div>
      </div>
    </>
  )
}
