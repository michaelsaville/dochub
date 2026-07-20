"use client"

import { useEffect, useMemo, useRef, useState } from "react"

// A constrained, searchable client picker. You can type to FILTER, but the value
// only changes when you pick a row — free text never commits, so a spelling
// variant can't create a mismatch or a duplicate. When you're not actively
// typing, it shows the selected client's exact name (derived, not synced).
export default function ClientCombobox({ clients, valueId, valueName, onSelect, placeholder, allowClear, small, dropUp, width }: {
  clients: { id: string; name: string }[]
  valueId?: string | null
  valueName?: string | null
  onSelect: (c: { id: string; name: string } | null) => void
  placeholder?: string
  allowClear?: boolean
  small?: boolean
  dropUp?: boolean
  width?: number
}) {
  // `typed` is the active filter text while editing; null means "not editing —
  // show the selected name". Deriving the shown value avoids syncing state to a
  // prop in an effect.
  const [typed, setTyped] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setTyped(null) } }
    document.addEventListener("mousedown", onDoc); return () => document.removeEventListener("mousedown", onDoc)
  }, [])

  const shown = typed ?? (valueName || "")
  const matches = useMemo(() => {
    const s = (typed ?? "").trim().toLowerCase()
    const base = s ? clients.filter((c) => c.name.toLowerCase().includes(s)) : clients
    return base.slice(0, 80)
  }, [typed, clients])

  const inp: React.CSSProperties = { width: "100%", padding: small ? "5px 8px" : "6px 9px", fontSize: small ? 12 : 13, fontFamily: "var(--sans)", background: "var(--color-background-primary)", color: "var(--text)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 5, minHeight: small ? 30 : 34 }

  function pick(c: { id: string; name: string } | null) { onSelect(c); setTyped(null); setOpen(false) }

  return (
    <div ref={ref} style={{ position: "relative", width: width ? width : undefined }}>
      <input value={shown} placeholder={placeholder || "Search clients…"} onFocus={() => setOpen(true)}
        onChange={(e) => { setTyped(e.target.value); setOpen(true); setHi(0) }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHi((h) => Math.min(matches.length - 1, h + 1)) }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)) }
          else if (e.key === "Enter") { e.preventDefault(); if (matches[hi]) pick(matches[hi]) }
          else if (e.key === "Escape") { setOpen(false); setTyped(null) }
        }}
        style={inp} />
      {open && (
        <div style={{ position: "absolute", ...(dropUp ? { bottom: "calc(100% + 2px)" } : { top: "calc(100% + 2px)" }), left: 0, right: 0, minWidth: 180, maxHeight: 240, overflowY: "auto", background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 6, zIndex: 60, boxShadow: "0 8px 24px rgba(0,0,0,0.3)" }}>
          {allowClear && <div onMouseDown={(e) => { e.preventDefault(); pick(null) }} style={{ padding: "7px 10px", fontSize: 12, color: "var(--muted)", cursor: "pointer", fontStyle: "italic", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>— use the note&apos;s client —</div>}
          {matches.length === 0 && <div style={{ padding: "8px 10px", fontSize: 12, color: "var(--muted)" }}>No matching client</div>}
          {matches.map((c, i) => (
            <div key={c.id} onMouseDown={(e) => { e.preventDefault(); pick(c) }} onMouseEnter={() => setHi(i)}
              style={{ padding: "7px 10px", fontSize: 12.5, cursor: "pointer", background: i === hi ? "var(--color-background-hover)" : "transparent", color: c.id === valueId ? "var(--accent)" : "var(--text)", fontWeight: c.id === valueId ? 600 : 400 }}>{c.name}</div>
          ))}
        </div>
      )}
    </div>
  )
}
