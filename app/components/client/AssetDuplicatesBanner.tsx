"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

type DupAsset = {
  id: string
  name: string
  friendlyName: string | null
  make: string | null
  model: string | null
  serial: string | null
  macAddress: string | null
  ipAddress: string | null
  dataSource: string
  syncroAssetId: string | null
  createdAt: string
}
type DupGroup = { matchOn: "serial" | "mac"; key: string; assets: DupAsset[] }

/** Syncro-created rows historically carry dataSource MANUAL + a syncroAssetId. */
const sourceOf = (a: DupAsset) => (a.dataSource === "MANUAL" && a.syncroAssetId ? "SYNCRO" : a.dataSource)

function AssetRow({ a }: { a: DupAsset }) {
  const makeModel = [a.make, a.model].filter(Boolean).join(" ") || "—"
  return (
    <li style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "2px 0", flexWrap: "wrap" }}>
      <span style={{ fontWeight: 500 }}>{a.friendlyName || a.name}</span>
      <span style={{ color: "var(--color-text-muted)" }}>{makeModel}</span>
      <span style={{ fontSize: 10, fontFamily: "var(--mono)", padding: "1px 6px", borderRadius: 4, border: "0.5px solid var(--color-border-secondary)", color: "var(--color-text-secondary)" }}>
        {sourceOf(a)}
      </span>
      <span style={{ color: "var(--color-text-muted)", fontSize: 11 }}>added {new Date(a.createdAt).toLocaleDateString()}</span>
      <Link href={`/assets/${a.id}`} style={{ marginLeft: "auto", color: "var(--accent)", textDecoration: "none", padding: "8px 4px" }}>
        Open →
      </Link>
    </li>
  )
}

/**
 * Compact, collapsible warning listing ACTIVE assets in this client that share
 * a serial or MAC. Renders nothing while loading, on error, or when clean.
 * Read-only — no merge action.
 */
export default function AssetDuplicatesBanner({ clientId }: { clientId: string }) {
  const [groups, setGroups] = useState<DupGroup[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let alive = true
    fetch(`/api/clients/${clientId}/asset-duplicates`)
      .then((r) => (r.ok ? r.json() : { groups: [] }))
      .then((j) => { if (alive) setGroups(j.groups ?? []) })
      .catch(() => {})
    return () => { alive = false }
  }, [clientId])

  if (groups.length === 0) return null

  const n = groups.length
  return (
    <div
      role="status"
      style={{
        border: "0.5px solid var(--color-border-warning)",
        background: "var(--color-background-warning)",
        borderRadius: 8,
        padding: "4px 12px",
        fontSize: 12.5,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          display: "flex", alignItems: "center", gap: 8, width: "100%", minHeight: 36,
          background: "none", border: "none", padding: 0, cursor: "pointer",
          color: "var(--color-text-warning)", fontSize: 12.5, textAlign: "left",
        }}
      >
        <span aria-hidden>⚠</span>
        <span style={{ flex: 1 }}>
          {n} set{n === 1 ? "" : "s"} of possible duplicate assets — same serial or MAC
        </span>
        <span aria-hidden style={{ fontSize: 10 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ paddingBottom: 8, maxHeight: 360, overflowY: "auto" }}>
          {groups.map((g) => (
            <div key={`${g.matchOn}:${g.key}`} style={{ marginTop: 6, paddingTop: 6, borderTop: "0.5px solid var(--color-border-tertiary)" }}>
              <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                {g.matchOn === "serial" ? "Serial" : "MAC"} <span style={{ fontFamily: "var(--mono)" }}>{g.key}</span> · {g.assets.length} assets
              </div>
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {g.assets.map((a) => <AssetRow key={a.id} a={a} />)}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
