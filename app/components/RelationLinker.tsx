"use client"

import { useEffect, useState } from "react"

export type RelationLink = {
  id: string
  label: string
  sublabel?: string
  href?: string
  meta?: string
}

export type PickerOption = {
  id: string
  label: string
  sublabel?: string
  alreadyLinkedHere?: boolean
  sharedWithCount?: number
}

type Props = {
  title: string
  itemNoun?: string
  currentLinks: RelationLink[]
  /** GET endpoint that accepts ?q= and returns PickerOption[]. */
  searchEndpoint: string
  onLink: (ids: string[]) => Promise<void>
  onUnlink: (id: string) => Promise<void>
  /** Default behavior is server-side client-scope; UI-only hint here. */
  clientScope?: string
  /** Prompt confirm() before unlinking. Use for credentials, licenses, contracts, documents. */
  confirmUnlink?: boolean
  /** If set, picker shows a "+ Create new" link at the bottom that opens in a new tab. */
  createHref?: string
  maxVisible?: number
  /** Optional shape adapter — picker fetches raw rows, this maps them to PickerOption.
      When omitted, the response must already match PickerOption[]. */
  mapOption?: (raw: any) => PickerOption
}

const cardStyle: React.CSSProperties = {
  background: "var(--color-background-secondary)",
  border: "0.5px solid var(--color-border-tertiary)",
  borderRadius: "10px",
  padding: "16px",
  marginBottom: "12px",
}
const cardTitleStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 600,
  color: "var(--color-text-secondary)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  display: "flex",
  alignItems: "center",
  gap: 6,
}
const countChip: React.CSSProperties = {
  fontSize: 11, padding: "2px 6px", borderRadius: 4,
  background: "var(--color-accent-muted)", color: "var(--color-accent)",
}
const addBtn: React.CSSProperties = {
  fontSize: 12, color: "var(--color-accent)",
  background: "none", border: "none", padding: 0, cursor: "pointer",
}
const itemRow: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "8px 0", gap: 8,
}
const unlinkBtn: React.CSSProperties = {
  fontSize: 11, padding: "0 4px", background: "none", border: "none",
  color: "var(--color-text-muted)", cursor: "pointer", flexShrink: 0,
}
const inp: React.CSSProperties = {
  width: "100%", padding: "8px 12px", fontSize: 14,
  border: "0.5px solid var(--color-border-secondary)", borderRadius: 8,
  background: "var(--color-background-primary)", color: "var(--color-text-primary)",
  boxSizing: "border-box",
}

export default function RelationLinker({
  title,
  itemNoun,
  currentLinks,
  searchEndpoint,
  onLink,
  onUnlink,
  clientScope,
  confirmUnlink = false,
  createHref,
  maxVisible = 8,
  mapOption,
}: Props) {
  const noun = itemNoun ?? title.toLowerCase().replace(/s$/, "")
  const [pickerOpen, setPickerOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [busyUnlinkId, setBusyUnlinkId] = useState<string | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [errMsg, setErrMsg] = useState<string | null>(null)

  const visible = showAll ? currentLinks : currentLinks.slice(0, maxVisible)
  const overflow = currentLinks.length - visible.length

  async function handleUnlink(id: string, label: string) {
    if (confirmUnlink && !confirm(`Unlink ${label} from this ${noun}? The ${noun} record is not deleted.`)) return
    setBusyUnlinkId(id); setErrMsg(null)
    try {
      await onUnlink(id)
    } catch (e: any) {
      setErrMsg(e?.message ?? "Failed to unlink")
    } finally { setBusyUnlinkId(null) }
  }

  return (
    <>
      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={cardTitleStyle}>
            {title}
            <span style={countChip}>{currentLinks.length}</span>
          </div>
          <button type="button" onClick={() => setPickerOpen(true)} style={addBtn}>
            + Link
          </button>
        </div>

        {currentLinks.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
            No {title.toLowerCase()} linked.{" "}
            <button type="button" onClick={() => setPickerOpen(true)} style={{ ...addBtn, textDecoration: "underline" }}>
              + Link {noun}
            </button>
          </div>
        ) : (
          <>
            {visible.map((l, i) => (
              <div
                key={l.id}
                style={{ ...itemRow, borderBottom: i < visible.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none" }}
                onMouseEnter={() => setHoverId(l.id)}
                onMouseLeave={() => setHoverId(prev => prev === l.id ? null : prev)}
              >
                <div style={{ minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {l.href ? (
                    <a
                      href={l.href}
                      style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)", textDecoration: "none" }}
                      onMouseOver={e => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--color-accent)" }}
                      onMouseOut={e => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--color-text-primary)" }}
                    >
                      {l.label}
                    </a>
                  ) : (
                    <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>{l.label}</span>
                  )}
                  {l.sublabel && <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 1 }}>{l.sublabel}</div>}
                  {l.meta && <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 1, fontStyle: "italic" }}>{l.meta}</div>}
                </div>
                <button
                  type="button"
                  onClick={() => handleUnlink(l.id, l.label)}
                  disabled={busyUnlinkId === l.id}
                  title={`Unlink ${l.label}`}
                  style={{
                    ...unlinkBtn,
                    visibility: hoverId === l.id || busyUnlinkId === l.id ? "visible" : "hidden",
                  }}
                  onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-danger, #ef4444)" }}
                  onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-muted)" }}
                >
                  {busyUnlinkId === l.id ? "…" : "×"}
                </button>
              </div>
            ))}
            {overflow > 0 && (
              <button type="button" onClick={() => setShowAll(true)} style={{ ...addBtn, marginTop: 8, fontSize: 11 }}>
                Show all ({currentLinks.length})
              </button>
            )}
            {errMsg && <div style={{ marginTop: 8, fontSize: 11, color: "var(--color-text-danger, #ef4444)" }}>{errMsg}</div>}
          </>
        )}
      </div>

      {pickerOpen && (
        <PickerModal
          title={`Link ${noun}`}
          itemNoun={noun}
          searchEndpoint={searchEndpoint}
          alreadyLinkedIds={new Set(currentLinks.map(l => l.id))}
          createHref={createHref}
          clientScope={clientScope}
          mapOption={mapOption}
          onClose={() => setPickerOpen(false)}
          onLink={async (ids) => {
            setErrMsg(null)
            try {
              await onLink(ids)
              setPickerOpen(false)
            } catch (e: any) {
              setErrMsg(e?.message ?? "Failed to link")
            }
          }}
        />
      )}
    </>
  )
}

function PickerModal({
  title, itemNoun, searchEndpoint, alreadyLinkedIds, createHref, clientScope,
  mapOption, onClose, onLink,
}: {
  title: string
  itemNoun: string
  searchEndpoint: string
  alreadyLinkedIds: Set<string>
  createHref?: string
  clientScope?: string
  mapOption?: (raw: any) => PickerOption
  onClose: () => void
  onLink: (ids: string[]) => Promise<void>
}) {
  const [q, setQ] = useState("")
  const [opts, setOpts] = useState<PickerOption[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [linking, setLinking] = useState(false)

  useEffect(() => {
    let cancelled = false
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const url = `${searchEndpoint}${searchEndpoint.includes("?") ? "&" : "?"}q=${encodeURIComponent(q)}`
        const r = await fetch(url)
        if (cancelled) return
        if (r.ok) {
          const data = await r.json()
          const arr = Array.isArray(data) ? data : []
          const mapped = mapOption ? arr.map(mapOption) : arr
          // Client-side filter by q for endpoints that don't honor it server-side.
          const filtered = q.trim().length === 0 ? mapped : mapped.filter(
            (o: PickerOption) =>
              (o.label || "").toLowerCase().includes(q.toLowerCase()) ||
              (o.sublabel || "").toLowerCase().includes(q.toLowerCase()),
          )
          setOpts(filtered)
        }
      } finally { if (!cancelled) setLoading(false) }
    }, q.length === 0 ? 0 : 200)
    return () => { cancelled = true; clearTimeout(t) }
  }, [q, searchEndpoint])

  function toggle(id: string) {
    setSelected(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  async function commit() {
    if (selected.size === 0) return
    setLinking(true)
    try {
      await onLink([...selected])
    } finally { setLinking(false) }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
        zIndex: 50, display: "flex", alignItems: "flex-start",
        justifyContent: "center", paddingTop: "10vh",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-background-secondary)",
          border: "0.5px solid var(--color-border-secondary)",
          borderRadius: 12, padding: 16, width: 600, maxWidth: "90vw",
          maxHeight: "70vh", display: "flex", flexDirection: "column",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{title}</h3>
          <button type="button" onClick={onClose} style={{ ...addBtn, color: "var(--color-text-muted)" }}>✕</button>
        </div>
        <input
          autoFocus
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Search ${itemNoun}…`}
          style={inp}
        />
        <div style={{ overflowY: "auto", flex: 1, marginTop: 10 }}>
          {loading && <div style={{ fontSize: 13, color: "var(--color-text-muted)", padding: 8 }}>Searching…</div>}
          {!loading && opts.length === 0 && (
            <div style={{ fontSize: 13, color: "var(--color-text-muted)", padding: 8 }}>
              No matches{q ? ` for "${q}"` : ""}.
            </div>
          )}
          {opts.map(o => {
            const already = o.alreadyLinkedHere || alreadyLinkedIds.has(o.id)
            const isSel = selected.has(o.id)
            return (
              <div
                key={o.id}
                onClick={() => { if (!already) toggle(o.id) }}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 10px", borderRadius: 6, cursor: already ? "default" : "pointer",
                  background: isSel ? "var(--color-accent-muted)" : "transparent",
                  opacity: already ? 0.4 : 1,
                }}
              >
                <input
                  type="checkbox"
                  checked={isSel}
                  disabled={already}
                  onChange={() => { if (!already) toggle(o.id) }}
                  style={{ pointerEvents: "none" }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: "var(--color-text-primary)" }}>{o.label}</div>
                  {o.sublabel && (
                    <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{o.sublabel}</div>
                  )}
                  {o.sharedWithCount != null && o.sharedWithCount > 0 && (
                    <div style={{ fontSize: 11, color: "var(--color-text-muted)", fontStyle: "italic" }}>
                      · already on {o.sharedWithCount} other {o.sharedWithCount === 1 ? "asset" : "assets"} at this client
                    </div>
                  )}
                </div>
                {already && (
                  <span style={{ fontSize: 11, padding: "1px 6px", borderRadius: 3, background: "var(--color-background-hover)", color: "var(--color-text-muted)" }}>
                    Linked
                  </span>
                )}
              </div>
            )
          })}
        </div>
        {createHref && (
          <a href={createHref} target="_blank" rel="noopener noreferrer" style={{ marginTop: 10, paddingTop: 8, borderTop: "0.5px solid var(--color-border-tertiary)", fontSize: 13, color: "var(--color-accent)", textDecoration: "none" }}>
            + Create new {itemNoun} ↗
          </a>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12, paddingTop: 10, borderTop: "0.5px solid var(--color-border-tertiary)" }}>
          <button type="button" onClick={onClose} style={{ fontSize: 13, padding: "6px 12px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "transparent", color: "var(--color-text-secondary)", cursor: "pointer" }}>
            Cancel
          </button>
          <button
            type="button"
            onClick={commit}
            disabled={selected.size === 0 || linking}
            style={{ fontSize: 13, padding: "6px 12px", borderRadius: 6, border: "none", background: "var(--color-accent)", color: "#fff", cursor: "pointer", opacity: selected.size === 0 ? 0.4 : 1 }}
          >
            {linking ? "Linking…" : selected.size === 0 ? "Link" : `Link ${selected.size}`}
          </button>
        </div>
      </div>
    </div>
  )
}
