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

function AssetRow({ a, suggested, onKeep, busy }: { a: DupAsset; suggested?: boolean; onKeep?: () => void; busy?: boolean }) {
  const makeModel = [a.make, a.model].filter(Boolean).join(" ") || "—"
  return (
    <li style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "2px 0", flexWrap: "wrap" }}>
      <span style={{ fontWeight: 500 }}>{a.friendlyName || a.name}</span>
      <span style={{ color: "var(--color-text-muted)" }}>{makeModel}</span>
      <span style={{ fontSize: 10, fontFamily: "var(--mono)", padding: "1px 6px", borderRadius: 4, border: "0.5px solid var(--color-border-secondary)", color: "var(--color-text-secondary)" }}>
        {sourceOf(a)}
      </span>
      <span style={{ color: "var(--color-text-muted)", fontSize: 11 }}>added {new Date(a.createdAt).toLocaleDateString()}</span>
      {suggested && <span style={{ fontSize: 10, color: "var(--accent2, #00d4aa)" }}>suggested keeper</span>}
      <Link href={`/assets/${a.id}`} style={{ marginLeft: "auto", color: "var(--accent)", textDecoration: "none", padding: "8px 4px" }}>
        Open →
      </Link>
      {onKeep && (
        <button type="button" onClick={onKeep} disabled={busy}
          title="Keep this record and fold the others into it (links, credentials, history move across; the others are retired, not deleted)"
          style={{ fontSize: 11, padding: "5px 9px", borderRadius: 6, cursor: "pointer", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}>
          {busy ? "Merging…" : "Keep this, merge others"}
        </button>
      )}
    </li>
  )
}

/**
 * Compact, collapsible warning listing ACTIVE assets in this client that share
 * a serial or MAC. Renders nothing while loading, on error, or when clean.
 * Admins get "Keep this, merge others" per row (POST /api/assets/merge, with a
 * dry-run summary in the confirm). Merged rows are retired, never deleted.
 */
export default function AssetDuplicatesBanner({ clientId, isAdmin = false }: { clientId: string; isAdmin?: boolean }) {
  const [groups, setGroups] = useState<DupGroup[]>([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  async function merge(g: DupGroup, keep: DupAsset) {
    const mergeIds = g.assets.filter((x) => x.id !== keep.id).map((x) => x.id)
    setBusy(keep.id); setMsg(null)
    try {
      const dry = await fetch("/api/assets/merge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keepId: keep.id, mergeIds, dryRun: true }) })
      const d = await dry.json()
      if (!dry.ok) { setMsg(d.error ?? "Merge check failed"); return }
      const moved = (d.moves ?? []).map((m: { table: string; rows: number }) => `${m.rows} ${m.table}`).join(", ") || "no linked records"
      const ok = window.confirm(
        `Keep "${keep.friendlyName || keep.name}" and merge ${mergeIds.length} duplicate(s) into it?\n\n` +
        `Moves: ${moved}\nFills empty fields: ${(d.fill ?? []).join(", ") || "none"}${d.moveSyncroId ? "\nSyncro link moves to the kept record" : ""}\n\n` +
        `The duplicates are retired (not deleted).`,
      )
      if (!ok) return
      const res = await fetch("/api/assets/merge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keepId: keep.id, mergeIds }) })
      const r = await res.json()
      if (!res.ok) { setMsg(r.error ?? "Merge failed"); return }
      setGroups((gs) => gs.filter((x) => x !== g))
      setMsg(`Merged into ${keep.friendlyName || keep.name}.`)
      window.dispatchEvent(new Event("dochub:client-changed"))
    } catch {
      setMsg("Merge failed — nothing was changed.")
    } finally {
      setBusy(null)
    }
  }

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
      {msg && <div style={{ fontSize: 12, padding: "2px 0 6px", color: "var(--color-text-primary)" }}>{msg}</div>}
      {open && (
        <div style={{ paddingBottom: 8, maxHeight: 360, overflowY: "auto" }}>
          {groups.map((g) => (
            <div key={`${g.matchOn}:${g.key}`} style={{ marginTop: 6, paddingTop: 6, borderTop: "0.5px solid var(--color-border-tertiary)" }}>
              <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                {g.matchOn === "serial" ? "Serial" : "MAC"} <span style={{ fontFamily: "var(--mono)" }}>{g.key}</span> · {g.assets.length} assets
              </div>
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {g.assets.map((a) => (
                  <AssetRow
                    key={a.id}
                    a={a}
                    suggested={!!a.syncroAssetId && g.assets.filter((x) => x.syncroAssetId).length === 1}
                    onKeep={isAdmin ? () => merge(g, a) : undefined}
                    busy={busy === a.id}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
