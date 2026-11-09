"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"

type TileTone = "ok" | "warn" | "bad" | "neutral"
type StatusTile = { key: string; label: string; value: string; sub?: string; tone: TileTone; href?: string }

const TONE: Record<TileTone, { bar: string; value: string; bg: string }> = {
  ok:      { bar: "var(--color-text-success)", value: "var(--color-text-primary)", bg: "var(--color-background-secondary)" },
  warn:    { bar: "var(--color-text-warning)", value: "var(--color-text-warning)", bg: "var(--color-background-secondary)" },
  bad:     { bar: "var(--color-text-danger)",  value: "var(--color-text-danger)",  bg: "var(--color-background-danger)" },
  neutral: { bar: "var(--color-border-secondary)", value: "var(--color-text-primary)", bg: "var(--color-background-secondary)" },
}

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
  gap: 8,
}

const tileBox = (tone: TileTone): React.CSSProperties => ({
  display: "block",
  position: "relative",
  minHeight: 76,
  padding: "10px 12px 10px 14px",
  borderRadius: 8,
  border: "0.5px solid var(--color-border-tertiary)",
  background: TONE[tone].bg,
  color: "inherit",
  textDecoration: "none",
  overflow: "hidden",
})

function TileBody({ t }: { t: StatusTile }) {
  return (
    <>
      <span aria-hidden style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: TONE[t.tone].bar }} />
      <div style={{ fontSize: 11, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: 0.4 }}>{t.label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.25, color: TONE[t.tone].value, fontFamily: "var(--mono)" }}>{t.value}</div>
      {t.sub && (
        <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={t.sub}>
          {t.sub}
        </div>
      )}
    </>
  )
}

function Tile({ t }: { t: StatusTile }) {
  const aria = `${t.label}: ${t.value}${t.sub ? `, ${t.sub}` : ""}`
  return t.href ? (
    <Link href={t.href} style={tileBox(t.tone)} aria-label={aria} className="status-tile">
      <TileBody t={t} />
    </Link>
  ) : (
    <div style={tileBox(t.tone)} aria-label={aria}>
      <TileBody t={t} />
    </div>
  )
}

/**
 * Hudu "Magic Dash"-style health tiles for a client. Self-fetching from
 * GET /api/clients/[id]/status-tiles. Tiles without a data source for this
 * client are omitted server-side. `isAdmin` is accepted for API symmetry; the
 * server decides admin-only detail from the session.
 */
export default function StatusTiles({ clientId }: { clientId: string; isAdmin?: boolean }) {
  const [tiles, setTiles] = useState<StatusTile[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(() => {
    setErr(null)
    setTiles(null)
    fetch(`/api/clients/${clientId}/status-tiles`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
        setTiles(j.tiles ?? [])
      })
      .catch((e: Error) => setErr(e.message || "Failed to load"))
  }, [clientId])

  useEffect(() => { load() }, [load])

  if (err) {
    return (
      <div style={{ fontSize: 12, color: "var(--color-text-danger)", padding: "8px 0", display: "flex", gap: 8, alignItems: "center" }}>
        Couldn&apos;t load status ({err}).
        <button onClick={load} style={{ fontSize: 12, padding: "6px 10px", minHeight: 32, borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "transparent", color: "var(--color-text-primary)", cursor: "pointer" }}>
          Retry
        </button>
      </div>
    )
  }

  if (!tiles) {
    return (
      <div style={grid} aria-busy="true" aria-label="Loading status">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ ...tileBox("neutral"), opacity: 0.5 }}>
            <div style={{ height: 10, width: "50%", background: "var(--color-background-tertiary)", borderRadius: 3 }} />
            <div style={{ height: 20, width: "35%", background: "var(--color-background-tertiary)", borderRadius: 3, marginTop: 8 }} />
          </div>
        ))}
      </div>
    )
  }

  if (tiles.length === 0) {
    return <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>No status data for this client yet.</div>
  }

  return (
    <div style={grid}>
      {tiles.map((t) => <Tile key={t.key} t={t} />)}
    </div>
  )
}
