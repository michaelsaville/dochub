"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"

type ChangeItem = {
  id: string
  at: string
  kind: string
  text: string
  by: string | null
  href?: string
}

const KIND_GLYPH: Record<string, string> = {
  asset: "▣", credential: "⚿", license: "§", network: "⇄", document: "¶", sop: "☰",
  person: "◉", website: "◎", alarm: "!", activity: "•", audit: "·",
}

const card: React.CSSProperties = {
  border: "0.5px solid var(--color-border-tertiary)",
  borderRadius: 8,
  background: "var(--color-background-secondary)",
  padding: "12px 14px",
}

function dayLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const yest = new Date(Date.now() - 86_400_000)
  if (d.toDateString() === today.toDateString()) return "Today"
  if (d.toDateString() === yest.toDateString()) return "Yesterday"
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
}

function ChangeLine({ c }: { c: ChangeItem }) {
  const time = new Date(c.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  const text = c.href
    ? <Link href={c.href} style={{ color: "var(--color-text-primary)", textDecoration: "none" }}>{c.text}</Link>
    : <span>{c.text}</span>
  return (
    <li style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 12.5, padding: "3px 0", minWidth: 0 }}>
      <span aria-hidden style={{ width: 14, flexShrink: 0, textAlign: "center", color: c.kind === "alarm" ? "var(--color-text-warning)" : "var(--color-text-muted)" }}>
        {KIND_GLYPH[c.kind] ?? "·"}
      </span>
      <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
        {text}
        {c.by && <span style={{ color: "var(--color-text-muted)" }}> — {c.by}</span>}
      </span>
      <span style={{ flexShrink: 0, fontSize: 11, color: "var(--color-text-muted)", fontFamily: "var(--mono)" }}>{time}</span>
    </li>
  )
}

/**
 * "What changed recently" for a client — last `days` (default 14) days,
 * grouped by day, one line per change. Self-fetching from
 * GET /api/clients/[id]/changes. Shows at most `limit` lines (default 12).
 */
export default function ChangesCard({ clientId, limit = 12, days = 14 }: { clientId: string; limit?: number; days?: number }) {
  const [items, setItems] = useState<ChangeItem[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(() => {
    setErr(null)
    setItems(null)
    fetch(`/api/clients/${clientId}/changes?days=${days}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
        setItems(j.items ?? [])
      })
      .catch((e: Error) => setErr(e.message || "Failed to load"))
  }, [clientId, days])

  useEffect(() => { load() }, [load])

  const groups = useMemo(() => {
    const shown = (items ?? []).slice(0, limit)
    const out: { day: string; rows: ChangeItem[] }[] = []
    for (const c of shown) {
      const day = dayLabel(c.at)
      const last = out[out.length - 1]
      if (last && last.day === day) last.rows.push(c)
      else out.push({ day, rows: [c] })
    }
    return out
  }, [items, limit])

  const hidden = items ? Math.max(items.length - limit, 0) : 0

  return (
    <section style={card} aria-label="Recent changes">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>What changed <span style={{ fontWeight: 400, color: "var(--color-text-muted)" }}>· last {days} days</span></h3>
        <Link
          href={`/clients/${clientId}?tab=${encodeURIComponent("Audit Trail")}`}
          style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none", padding: "8px 0 8px 8px" }}
        >
          View all →
        </Link>
      </div>

      {err && (
        <div style={{ fontSize: 12, color: "var(--color-text-danger)", display: "flex", gap: 8, alignItems: "center" }}>
          Couldn&apos;t load changes ({err}).
          <button onClick={load} style={{ fontSize: 12, padding: "6px 10px", minHeight: 32, borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "transparent", color: "var(--color-text-primary)", cursor: "pointer" }}>
            Retry
          </button>
        </div>
      )}

      {!err && !items && (
        <div aria-busy="true" style={{ display: "grid", gap: 6, padding: "4px 0" }}>
          {[70, 55, 80].map((w) => (
            <div key={w} style={{ height: 10, width: `${w}%`, background: "var(--color-background-tertiary)", borderRadius: 3, opacity: 0.6 }} />
          ))}
        </div>
      )}

      {!err && items && items.length === 0 && (
        <div style={{ fontSize: 12, color: "var(--color-text-muted)", padding: "4px 0" }}>No recorded changes in the last {days} days.</div>
      )}

      {!err && groups.map((g) => (
        <div key={g.day} style={{ marginTop: 6 }}>
          <div style={{ fontSize: 11, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 }}>{g.day}</div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {g.rows.map((c) => <ChangeLine key={c.id} c={c} />)}
          </ul>
        </div>
      ))}

      {hidden > 0 && (
        <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 6 }}>+{hidden} more in the Audit Trail</div>
      )}
    </section>
  )
}
