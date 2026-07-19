/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import AppShell from "@/components/AppShell"
import { useEffect, useMemo, useState } from "react"

type Client = { id: string; name: string }
type Entity = {
  kind: "credential" | "asset" | "location_network" | "phone_extension" | "other"
  confidence?: number
  summary?: string
  sourceSnippet?: string
  include?: boolean
  fields?: Record<string, string | null>
}
type Suggestion = {
  id: string
  sourcePath: string
  sourceFolder: string | null
  noteTitle: string
  rawText: string
  status: string
  isRelevant: boolean
  relevanceReason: string | null
  matchedClientId: string | null
  matchedClientName: string | null
  clientConfidence: number | null
  clientReasoning: string | null
  clientCandidatesJson: any
  entitiesJson: any
  committedSummaryJson: any
}

const TABS = ["PENDING", "COMMITTED", "REJECTED", "SKIPPED", "ALL"]
const KIND_FIELDS: Record<string, string[]> = {
  credential: ["label", "username", "password", "totp", "url", "notes"],
  asset: ["name", "category", "make", "model", "serial", "ipAddress", "macAddress", "room", "managementUrl", "os", "notes"],
  location_network: ["wanIp", "ispName", "lanIp", "subnet", "gateway", "notes"],
  phone_extension: ["extension", "displayName", "did", "sipUsername", "sipPassword", "notes"],
  other: ["notes"],
}
const KIND_COLOR: Record<string, string> = {
  credential: "#e0a458", asset: "#3d6fff", location_network: "#43b581",
  phone_extension: "#b47cff", other: "#8a8f98",
}

function chip(text: string, bg: string, fg = "#fff") {
  return <span style={{ background: bg, color: fg, fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4, fontFamily: "var(--mono)", letterSpacing: "0.03em" }}>{text}</span>
}
function confColor(c: number | null | undefined) {
  if (c == null) return "#8a8f98"
  if (c >= 0.85) return "#43b581"
  if (c >= 0.6) return "#e0a458"
  return "#e05a5a"
}

const inp: React.CSSProperties = {
  width: "100%", padding: "5px 8px", fontSize: 12, fontFamily: "var(--mono)",
  background: "var(--color-background-primary)", color: "var(--text)",
  border: "0.5px solid var(--color-border-tertiary)", borderRadius: 4,
}
const lbl: React.CSSProperties = { fontSize: 10, color: "var(--muted)", fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2, display: "block" }

// ── Detail panel (keyed by suggestion id, so its draft resets on selection) ──
function DetailPanel({ suggestion, clients, onDone, toast }: {
  suggestion: Suggestion
  clients: Client[]
  onDone: (msg: string, keepSelected: boolean) => void
  toast: (m: string) => void
}) {
  const [draft, setDraft] = useState<Suggestion>(() => JSON.parse(JSON.stringify(suggestion)))
  const [busy, setBusy] = useState(false)

  const clientById = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c.name])), [clients])
  const clientByName = useMemo(() => Object.fromEntries(clients.map((c) => [c.name.toLowerCase(), c.id])), [clients])

  function patchDraft(p: Partial<Suggestion>) { setDraft((d) => ({ ...d, ...p })) }
  function setEntity(idx: number, p: Partial<Entity>) {
    setDraft((d) => { const e = [...(d.entitiesJson || [])]; e[idx] = { ...e[idx], ...p }; return { ...d, entitiesJson: e } })
  }
  function setEntityField(idx: number, key: string, val: string) {
    setDraft((d) => { const e = [...(d.entitiesJson || [])]; e[idx] = { ...e[idx], fields: { ...(e[idx].fields || {}), [key]: val } }; return { ...d, entitiesJson: e } })
  }

  async function save() {
    setBusy(true)
    const corrected = draft.matchedClientId !== suggestion.matchedClientId
    const r = await fetch(`/api/notes-intake/${draft.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchedClientId: draft.matchedClientId, matchedClientName: draft.matchedClientName, clientCorrected: corrected, entities: draft.entitiesJson }),
    })
    setBusy(false)
    if (r.ok) onDone("Saved" + (corrected ? " · learned folder → client" : ""), true)
    else toast("Save failed")
  }
  async function setStatus(status: string) {
    setBusy(true)
    const r = await fetch(`/api/notes-intake/${draft.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) })
    setBusy(false)
    if (r.ok) onDone(status === "REJECTED" ? "Rejected" : "Skipped", false)
  }
  async function commit() {
    if (!draft.matchedClientId) { toast("Pick a client first"); return }
    const n = (draft.entitiesJson || []).filter((e: Entity) => e.include !== false).length
    if (!confirm(`Push ${n} item(s) into ${draft.matchedClientName}?\nThis writes real records to DocHub (credentials encrypted).`)) return
    setBusy(true)
    const r = await fetch(`/api/notes-intake/${draft.id}/commit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: draft.matchedClientId, entities: draft.entitiesJson }) })
    const d = await r.json()
    setBusy(false)
    if (r.ok) {
      const s = d.summary
      onDone(`Pushed: ${s.credentials.length} cred, ${s.assets.length} asset, ${s.phoneExtensions.length} ext${s.locationUpdated ? ", location" : ""}${s.skipped.length ? ` · ${s.skipped.length} skipped` : ""}`, false)
    } else toast(d.error || "Commit failed")
  }

  return (
    <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: 10, padding: 18, background: "var(--color-background-secondary)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 4 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text)" }}>{draft.noteTitle}</div>
          <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--mono)" }}>{draft.sourcePath}</div>
        </div>
        {chip(draft.status, draft.status === "COMMITTED" ? "#43b581" : draft.status === "REJECTED" ? "#e05a5a" : "#3d6fff")}
      </div>

      {draft.relevanceReason && <div style={{ fontSize: 11.5, color: "var(--muted)", margin: "6px 0 12px", fontStyle: "italic" }}>{draft.relevanceReason}</div>}

      {/* client match */}
      <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 8, padding: 12, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={lbl}>Client match</span>
          <span style={{ fontSize: 11, color: confColor(draft.clientConfidence), fontFamily: "var(--mono)" }}>{draft.clientConfidence != null ? Math.round(draft.clientConfidence * 100) + "% AI confidence" : ""}</span>
        </div>
        <input list="clientlist" defaultValue={draft.matchedClientName || ""} placeholder="Type to search clients…"
          onChange={(e) => { const id = clientByName[e.target.value.trim().toLowerCase()]; if (id) patchDraft({ matchedClientId: id, matchedClientName: clientById[id] }) }}
          style={{ ...inp, fontFamily: "var(--sans)", fontSize: 13 }} />
        <datalist id="clientlist">{clients.map((c) => <option key={c.id} value={c.name} />)}</datalist>
        {draft.clientReasoning && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>{draft.clientReasoning}</div>}
        {Array.isArray(draft.clientCandidatesJson) && draft.clientCandidatesJson.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            <span style={{ fontSize: 10, color: "var(--muted)" }}>alt:</span>
            {draft.clientCandidatesJson.map((cid: string) => clientById[cid] ? (
              <button key={cid} onClick={() => patchDraft({ matchedClientId: cid, matchedClientName: clientById[cid] })}
                style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, cursor: "pointer", border: "0.5px solid var(--color-border-tertiary)", background: "transparent", color: "var(--accent)" }}>{clientById[cid]}</button>
            ) : null)}
          </div>
        )}
      </div>

      <div style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {(draft.entitiesJson || []).length} extracted item(s)
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {(draft.entitiesJson || []).map((e: Entity, idx: number) => {
          const keys = Array.from(new Set([...(KIND_FIELDS[e.kind] || []), ...Object.keys(e.fields || {})]))
          const included = e.include !== false
          return (
            <div key={idx} style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: 8, padding: 10, opacity: included ? 1 : 0.5, background: "var(--color-background-primary)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <input type="checkbox" checked={included} onChange={(ev) => setEntity(idx, { include: ev.target.checked })} />
                {chip(e.kind.replace("_", " "), KIND_COLOR[e.kind] || "#888")}
                <input value={e.summary || ""} onChange={(ev) => setEntity(idx, { summary: ev.target.value })}
                  style={{ ...inp, fontFamily: "var(--sans)", fontSize: 12.5, fontWeight: 500, border: "none", background: "transparent", padding: "2px 0" }} />
                <span style={{ fontSize: 10, color: confColor(e.confidence), fontFamily: "var(--mono)", flexShrink: 0 }}>{e.confidence != null ? Math.round(e.confidence * 100) + "%" : ""}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {keys.map((k) => (
                  <div key={k}>
                    <label style={lbl}>{k}</label>
                    <input value={(e.fields?.[k] as string) || ""} onChange={(ev) => setEntityField(idx, k, ev.target.value)} style={inp} />
                  </div>
                ))}
              </div>
              {e.sourceSnippet && (
                <details style={{ marginTop: 8 }}>
                  <summary style={{ fontSize: 10.5, color: "var(--muted)", cursor: "pointer", fontFamily: "var(--mono)" }}>source snippet</summary>
                  <pre style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "pre-wrap", marginTop: 4, fontFamily: "var(--mono)" }}>{e.sourceSnippet}</pre>
                </details>
              )}
            </div>
          )
        })}
      </div>

      {draft.committedSummaryJson && (
        <pre style={{ fontSize: 11, color: "#43b581", marginTop: 12, fontFamily: "var(--mono)", whiteSpace: "pre-wrap" }}>{JSON.stringify(draft.committedSummaryJson, null, 2)}</pre>
      )}

      <details style={{ marginTop: 12 }}>
        <summary style={{ fontSize: 11, color: "var(--muted)", cursor: "pointer", fontFamily: "var(--mono)" }}>original note</summary>
        <pre style={{ fontSize: 11.5, color: "var(--text)", whiteSpace: "pre-wrap", marginTop: 6, fontFamily: "var(--mono)", background: "var(--color-background-primary)", padding: 10, borderRadius: 6 }}>{draft.rawText}</pre>
      </details>

      {draft.status !== "COMMITTED" && (
        <div style={{ display: "flex", gap: 8, marginTop: 16, borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: 14 }}>
          <button onClick={commit} disabled={busy} style={{ padding: "8px 16px", fontSize: 12.5, fontWeight: 600, borderRadius: 6, border: "none", cursor: "pointer", background: "var(--accent)", color: "#fff" }}>Confirm &amp; Push →</button>
          <button onClick={save} disabled={busy} style={{ padding: "8px 14px", fontSize: 12.5, borderRadius: 6, cursor: "pointer", border: "0.5px solid var(--color-border-tertiary)", background: "transparent", color: "var(--text)" }}>Save edits</button>
          <div style={{ flex: 1 }} />
          <button onClick={() => setStatus("SKIPPED")} disabled={busy} style={{ padding: "8px 12px", fontSize: 12, borderRadius: 6, cursor: "pointer", border: "0.5px solid var(--color-border-tertiary)", background: "transparent", color: "var(--muted)" }}>Skip</button>
          <button onClick={() => setStatus("REJECTED")} disabled={busy} style={{ padding: "8px 12px", fontSize: 12, borderRadius: 6, cursor: "pointer", border: "0.5px solid var(--color-border-tertiary)", background: "transparent", color: "#e05a5a" }}>Reject</button>
        </div>
      )}
    </div>
  )
}

export default function NotesIntakePage() {
  const [tab, setTab] = useState("PENDING")
  const [items, setItems] = useState<Suggestion[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [selId, setSelId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const r = await fetch(`/api/notes-intake?status=${tab}`)
      const d = await r.json()
      if (!alive) return
      setItems(d.suggestions || [])
      setClients(d.clients || [])
      setCounts(d.counts || {})
      setLoading(false)
    })()
    return () => { alive = false }
  }, [tab, reloadKey])

  const sel = useMemo(() => items.find((i) => i.id === selId) || null, [items, selId])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter((i) => (i.noteTitle + " " + (i.sourceFolder || "") + " " + (i.matchedClientName || "")).toLowerCase().includes(q))
  }, [items, search])

  const groups = useMemo(() => {
    const m = new Map<string, Suggestion[]>()
    for (const i of filtered) { const k = i.matchedClientName || "— unmatched —"; if (!m.has(k)) m.set(k, []); m.get(k)!.push(i) }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [filtered])

  function onDone(msg: string, keepSelected: boolean) {
    setToastMsg(msg)
    if (!keepSelected) setSelId(null)
    setLoading(true)
    setReloadKey((k) => k + 1)
  }

  return (
    <AppShell>
      <div style={{ padding: "20px 24px", maxWidth: 1400, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--text)" }}>Notes Intake</h1>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>AI-matched Apple Notes → DocHub. Review, correct, push.</span>
        </div>

        <div style={{ display: "flex", gap: 6, margin: "14px 0" }}>
          {TABS.map((t) => (
            <button key={t} onClick={() => { setTab(t); setSelId(null); setLoading(true) }}
              style={{ padding: "5px 12px", fontSize: 12, borderRadius: 6, cursor: "pointer", fontFamily: "var(--mono)", letterSpacing: "0.03em", border: "0.5px solid var(--color-border-tertiary)", background: tab === t ? "rgba(61,111,255,0.14)" : "transparent", color: tab === t ? "var(--text)" : "var(--muted)" }}>
              {t}{counts[t] != null ? ` ${counts[t]}` : ""}
            </button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 18, alignItems: "start" }}>
          <div>
            <input placeholder="Filter notes / clients…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...inp, marginBottom: 10, fontFamily: "var(--sans)" }} />
            <div style={{ maxHeight: "72vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
              {loading && <div style={{ color: "var(--muted)", fontSize: 13 }}>Loading…</div>}
              {!loading && groups.length === 0 && <div style={{ color: "var(--muted)", fontSize: 13 }}>No notes in “{tab}”.</div>}
              {groups.map(([cname, list]) => (
                <div key={cname}>
                  <div style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>{cname} · {list.length}</div>
                  {list.map((i) => {
                    const ents = (i.entitiesJson || []).length
                    return (
                      <div key={i.id} onClick={() => setSelId(i.id)}
                        style={{ padding: "8px 10px", borderRadius: 6, cursor: "pointer", marginBottom: 4, border: "0.5px solid " + (selId === i.id ? "var(--accent)" : "var(--color-border-tertiary)"), background: selId === i.id ? "rgba(61,111,255,0.08)" : "var(--color-background-secondary)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                          <span style={{ fontSize: 12.5, color: "var(--text)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.noteTitle}</span>
                          <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: confColor(i.clientConfidence), flexShrink: 0 }}>{i.clientConfidence != null ? Math.round(i.clientConfidence * 100) + "%" : ""}</span>
                        </div>
                        <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 2 }}>{i.sourceFolder} · {ents} item{ents === 1 ? "" : "s"}</div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>

          <div>
            {!sel && <div style={{ color: "var(--muted)", fontSize: 13, paddingTop: 40, textAlign: "center" }}>Select a note to review.</div>}
            {sel && <DetailPanel key={sel.id} suggestion={sel} clients={clients} onDone={onDone} toast={(m) => setToastMsg(m)} />}
          </div>
        </div>
      </div>

      {toastMsg && (
        <div onClick={() => setToastMsg(null)} style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", background: "var(--text)", color: "var(--color-background-primary)", padding: "10px 18px", borderRadius: 8, fontSize: 13, cursor: "pointer", zIndex: 100, fontFamily: "var(--sans)" }}>{toastMsg}</div>
      )}
    </AppShell>
  )
}
