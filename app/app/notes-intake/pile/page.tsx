/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */
"use client"

import AppShell from "@/components/AppShell"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

// Work the pile — conversational notes-backlog cleanup (Pile Agent).
// Left: the queue. Centre: the source (note text, PDF, photos). Right: the agent
// transcript and its proposal cards. Nothing is written until a card is approved.

type Item = { id: string; noteTitle: string; sourceFolder: string | null; sourceType: string | null; matchedClientName: string | null; rawText: string | null; status: string; origin: string }
type Row = { field: string; before?: string | null; after: string; secret?: boolean; warn?: string }
type Proposal = { id: string; kind: string; status: string; displayJson: { title: string; breadcrumb: any; rows: Row[]; evidence?: string; hasSecret?: boolean }; resultJson?: any; error?: string | null; rejectReason?: string | null }
type Entry = { role: "user" | "assistant"; text: string; tools?: { name: string; summary: string; isError?: boolean }[] }
type Sources = { main: { mime: string } | null; attachments: { name: string; mime: string }[]; missing: boolean }

const TABS = ["PENDING", "SKIPPED"] as const
const mono = { fontFamily: "var(--mono)" }

async function streamTurn(id: string, text: string | null, on: (e: any) => void) {
  const r = await fetch(`/api/agent/pile/${id}/turn`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) })
  if (!r.ok || !r.body) { const d = await r.json().catch(() => ({})); on({ type: "error", message: d.error || `HTTP ${r.status}` }); on({ type: "done" }); return }
  const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = ""
  for (;;) {
    const { value, done } = await reader.read(); if (done) break
    buf += dec.decode(value, { stream: true })
    let i
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i); buf = buf.slice(i + 2)
      for (const line of chunk.split("\n")) if (line.startsWith("data: ")) { try { on(JSON.parse(line.slice(6))) } catch {} }
    }
  }
}

function Card({ p, focused, onDecide }: { p: Proposal; focused: boolean; onDecide: (p: Proposal, d: "approve" | "reject", extra?: any) => Promise<void> }) {
  const d = p.displayJson
  const [editing, setEditing] = useState(false)
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const open = p.status === "PROPOSED" || p.status === "FAILED"
  const edge = p.status === "APPLIED" ? "var(--accent2)" : p.status === "REJECTED" || p.status === "SUPERSEDED" ? "var(--border)" : p.status === "FAILED" ? "var(--danger)" : d.title.startsWith("CREATE") || d.title.startsWith("ADD") ? "var(--accent)" : "var(--warn)"
  const crumb = [d.breadcrumb?.client?.name, d.breadcrumb?.location?.name, d.breadcrumb?.asset].filter(Boolean)
  const go = async (dec: "approve" | "reject", extra?: any) => { setBusy(true); try { await onDecide(p, dec, extra) } finally { setBusy(false); setEditing(false); setRejecting(false) } }

  if (!open) {
    return (
      <div role="group" aria-label={`${d.title} ${crumb.join(" › ")}`} style={{ border: "1px solid var(--border)", borderLeft: `3px solid ${edge}`, borderRadius: 8, padding: "6px 10px", fontSize: 12, color: "var(--muted)", display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ ...mono, fontSize: 10.5 }}>{p.status === "APPLIED" ? "✓ SAVED" : p.status === "REJECTED" ? "✕ REJECTED" : "— SUPERSEDED"}</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.title.toLowerCase()} · {crumb.join(" › ")}{p.rejectReason ? ` · "${p.rejectReason}"` : ""}</span>
      </div>
    )
  }
  return (
    <div role="group" aria-label={`${d.title} ${crumb.join(" › ")}`} style={{ background: "var(--card)", border: `1px solid ${focused ? "var(--accent)" : "var(--border)"}`, borderLeft: `3px solid ${edge}`, borderRadius: 8, padding: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
        <span style={{ ...mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.04em" }}>{d.title}{d.hasSecret ? " 🔑" : ""}</span>
        <span style={{ ...mono, fontSize: 10, color: "var(--muted)" }}>{p.id.slice(-6)}</span>
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", margin: "2px 0 8px" }}>{crumb.join(" › ")}</div>
      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
        <tbody>
          {d.rows.map((r) => (
            <tr key={r.field} style={{ verticalAlign: "top" }}>
              <td style={{ color: "var(--muted)", padding: "2px 8px 2px 0", whiteSpace: "nowrap", width: 1 }}>{r.field}</td>
              <td style={{ padding: "2px 0" }}>
                {r.before ? <div style={{ ...mono, color: "var(--muted)", textDecoration: "line-through" }}>{r.before}</div> : null}
                {editing && !r.secret && !["opens", "location", "notes (append)"].includes(r.field)
                  ? <input aria-label={`edit ${r.field}`} defaultValue={r.after} onChange={(e) => setEdits((x) => ({ ...x, [r.field]: e.target.value }))} style={{ ...mono, width: "100%", background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 4, padding: "3px 6px", fontSize: 12 }} />
                  : <div style={{ ...mono, color: "var(--text)", wordBreak: "break-all" }}>{r.secret ? <span aria-label="encrypted, hidden">•••••••• <span style={{ color: "var(--muted)" }}>stored encrypted</span></span> : r.after}</div>}
                {r.warn ? <div style={{ color: "var(--warn)", fontSize: 11 }}>⚠ {r.warn}</div> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {d.evidence ? <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>from: {d.evidence}</div> : null}
      {p.status === "FAILED" && p.error ? <div style={{ fontSize: 11.5, color: "var(--danger)", marginTop: 6 }}>Save failed: {p.error}</div> : null}
      {rejecting ? (
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <input autoFocus placeholder="Why? (optional, tells the agent)" value={reason} onChange={(e) => setReason(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") go("reject", { reason }); if (e.key === "Escape") setRejecting(false) }} style={{ flex: 1, background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 4, padding: "4px 8px", fontSize: 12 }} />
          <button className="btn btn-danger" disabled={busy} onClick={() => go("reject", { reason })}>Reject</button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <button className="btn btn-success" disabled={busy} onClick={() => go("approve", editing ? { edits } : undefined)}>{busy ? "Saving…" : editing ? "Save & approve" : "Approve"} <kbd style={{ opacity: 0.6 }}>a</kbd></button>
          <button className="btn btn-secondary" disabled={busy} onClick={() => setEditing((v) => !v)}>{editing ? "Cancel edit" : "Edit"}</button>
          <button className="btn btn-secondary" disabled={busy} onClick={() => setRejecting(true)}>Reject <kbd style={{ opacity: 0.6 }}>x</kbd></button>
        </div>
      )}
    </div>
  )
}

function SourcePane({ item }: { item: Item }) {
  const [src, setSrc] = useState<Sources | null>(null)
  const [big, setBig] = useState<string | null>(null)
  useEffect(() => {
    let off = false
    fetch(`/api/notes-intake/${item.id}/file?list=1`).then((r) => r.json()).then((d) => { if (!off) setSrc(d) }).catch(() => { if (!off) setSrc({ main: null, attachments: [], missing: true }) })
    return () => { off = true }
  }, [item.id])
  const base = `/api/notes-intake/${item.id}/file`
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{item.noteTitle}</div>
        <div style={{ ...mono, fontSize: 11, color: "var(--muted)" }}>{item.sourceFolder || "—"} · {item.sourceType || item.origin} · AI guess: {item.matchedClientName || "no client"}</div>
      </div>
      {big ? (
        <div>
          <button className="btn btn-secondary" onClick={() => setBig(null)} style={{ marginBottom: 6 }}>← back to all</button>
          <a href={big} target="_blank" rel="noreferrer"><img src={big} alt="source" style={{ maxWidth: "100%", maxHeight: "70vh", display: "block", borderRadius: 6, border: "1px solid var(--border)" }} /></a>
        </div>
      ) : (
        <>
          {src?.main ? (src.main.mime === "application/pdf"
            ? <object data={base} type="application/pdf" style={{ width: "100%", height: "55vh", border: "1px solid var(--border)", borderRadius: 6 }}><a href={base} target="_blank" rel="noreferrer">Open PDF</a></object>
            : <img src={base} alt="source" onClick={() => setBig(base)} style={{ maxWidth: "100%", maxHeight: "55vh", cursor: "zoom-in", borderRadius: 6, border: "1px solid var(--border)" }} />) : null}
          {src && src.attachments.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 6 }}>
              {src.attachments.map((a, n) => a.mime.startsWith("image/")
                ? <button key={n} onClick={() => setBig(`${base}?att=${n}`)} title={`#${src.main ? n + 1 : n} ${a.name}`} style={{ padding: 0, border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden", background: "var(--card)", cursor: "zoom-in", position: "relative" }}>
                    <img src={`${base}?att=${n}`} alt={a.name} loading="lazy" style={{ width: "100%", height: 100, objectFit: "cover", display: "block" }} />
                    <span style={{ ...mono, position: "absolute", left: 4, top: 4, fontSize: 10, background: "rgba(0,0,0,0.6)", color: "#fff", padding: "0 4px", borderRadius: 3 }}>#{src.main ? n + 1 : n}</span>
                  </button>
                : <a key={n} href={`${base}?att=${n}`} target="_blank" rel="noreferrer" style={{ fontSize: 11, border: "1px solid var(--border)", borderRadius: 6, padding: 6 }}>📄 {a.name}</a>)}
            </div>
          )}
          {src?.missing ? <div style={{ fontSize: 12, color: "var(--warn)" }}>Source file is no longer on disk — working from the saved text only.</div> : null}
        </>
      )}
      {item.rawText ? <pre style={{ ...mono, fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6, padding: 10, maxHeight: big ? "20vh" : "40vh", overflowY: "auto", margin: 0 }}>{item.rawText}</pre> : null}
    </div>
  )
}

export default function PilePage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("PENDING")
  const [items, setItems] = useState<Item[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState("")
  const [selId, setSelId] = useState<string | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [live, setLive] = useState<{ text: string; tools: { name: string; summary: string; isError?: boolean }[]; thinking: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [filed, setFiled] = useState(0)
  const [toast, setToast] = useState<string | null>(null)
  const composer = useRef<HTMLTextAreaElement>(null)
  const transcriptEnd = useRef<HTMLDivElement>(null)
  const started = useRef<Set<string>>(new Set())

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3500) }
  const select = useCallback((id: string | null) => {
    if (id === selId) return
    setEntries([]); setProposals([]); setErr(null); setLive(null); setSelId(id)
  }, [selId])

  useEffect(() => {
    fetch(`/api/notes-intake?status=${tab}`).then((r) => r.json()).then((d) => { setItems(d.suggestions || []); setCounts(d.counts || {}) }).finally(() => setLoading(false))
  }, [tab])

  const visible = useMemo(() => {
    const q = filter.toLowerCase().trim()
    return items.filter((i) => !q || `${i.noteTitle} ${i.sourceFolder} ${i.matchedClientName}`.toLowerCase().includes(q))
      .sort((a, b) => (a.sourceFolder || a.matchedClientName || "~").localeCompare(b.sourceFolder || b.matchedClientName || "~") || a.noteTitle.localeCompare(b.noteTitle))
  }, [items, filter])
  const groups = useMemo(() => {
    const m = new Map<string, Item[]>()
    for (const i of visible) { const k = i.sourceFolder || i.matchedClientName || "Unsorted"; m.set(k, [...(m.get(k) || []), i]) }
    return [...m.entries()]
  }, [visible])
  const sel = items.find((i) => i.id === selId) || null

  const runTurn = useCallback(async (id: string, text: string | null) => {
    setBusy(true); setErr(null)
    if (text) setEntries((e) => [...e, { role: "user", text }])
    const acc = { text: "", tools: [] as { name: string; summary: string; isError?: boolean }[], thinking: false }
    setLive({ ...acc })
    await streamTurn(id, text, (ev) => {
      if (ev.type === "text") { acc.text += ev.delta; acc.thinking = false }
      else if (ev.type === "thinking") acc.thinking = true
      else if (ev.type === "tool") acc.tools = [...acc.tools, { name: ev.name, summary: ev.summary, isError: ev.isError }]
      else if (ev.type === "proposal") setProposals((ps) => [...ps, ev.proposal])
      else if (ev.type === "error") setErr(ev.message)
      setLive({ ...acc })
    })
    if (acc.text || acc.tools.length) setEntries((e) => [...e, { role: "assistant", text: acc.text, tools: acc.tools }])
    setLive(null)
    setBusy(false)
  }, [])

  // open an item: load its conversation, or let the agent speak first
  useEffect(() => {
    if (!selId) return
    let off = false
    fetch(`/api/agent/pile/${selId}`).then(async (r) => {
      const d = await r.json()
      if (off) return
      if (!r.ok) { setErr(d.error || "Failed to load"); return }
      const disp: Entry[] = ((d.conversation?.displayJson as any[]) || []).filter((e: Entry, i: number) => !(i === 0 && e.role === "user" && e.text === "Start on this pile item."))
      setEntries(disp); setProposals(d.proposals || [])
      if (!d.conversation && !started.current.has(selId)) { started.current.add(selId); runTurn(selId, null) }
    })
    return () => { off = true }
  }, [selId, runTurn])

  useEffect(() => { transcriptEnd.current?.scrollIntoView({ block: "end" }) }, [entries, live, proposals])

  const openCards = proposals.filter((p) => p.status === "PROPOSED" || p.status === "FAILED")
  const appliedCount = proposals.filter((p) => p.status === "APPLIED").length

  const decide = useCallback(async (p: Proposal, decision: "approve" | "reject", extra?: any) => {
    const r = await fetch(`/api/agent/proposals/${p.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, ...(extra || {}) }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setProposals((ps) => ps.map((x) => x.id === p.id ? { ...x, status: "FAILED", error: d.error } : x)); flash(d.error || "Failed"); return }
    setProposals((ps) => ps.map((x) => x.id === p.id ? { ...x, status: decision === "approve" ? "APPLIED" : "REJECTED", resultJson: d.result, rejectReason: extra?.reason || null } : x))
  }, [])

  const approveAll = useCallback(async () => {
    for (const p of openCards) if (!p.displayJson.hasSecret) await decide(p, "approve")
  }, [openCards, decide])

  const finish = useCallback(async (status: "COMMITTED" | "SKIPPED" | "REJECTED") => {
    if (!sel) return
    const r = await fetch(`/api/agent/pile/${sel.id}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) })
    if (!r.ok) { const d = await r.json().catch(() => ({})); flash(d.error || "Failed"); return }
    if (status === "COMMITTED") setFiled((n) => n + 1)
    flash(status === "COMMITTED" ? `Filed “${sel.noteTitle}”` : status === "SKIPPED" ? "Skipped" : "Marked junk")
    const idx = visible.findIndex((i) => i.id === sel.id)
    const next = visible[idx + 1] || visible[idx - 1] || null
    setItems((xs) => xs.filter((x) => x.id !== sel.id))
    setCounts((c) => ({ ...c, [tab]: Math.max(0, (c[tab] || 1) - 1), [status]: (c[status] || 0) + 1 }))
    select(next?.id || null)
  }, [sel, visible, tab, select])

  const send = useCallback(() => {
    if (!sel || busy || !draft.trim()) return
    const t = draft.trim(); setDraft(""); runTurn(sel.id, t)
  }, [sel, busy, draft, runTurn])

  // keyboard: j/k items, a approve first open card, A approve all (no secrets) then Done,
  // x reject first open card, d done, s skip, # junk, / chat
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) { if (e.key === "Escape") t.blur(); return }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const i = visible.findIndex((x) => x.id === selId)
      if (e.key === "j") { e.preventDefault(); select(visible[Math.min(visible.length - 1, i + 1)]?.id || visible[0]?.id || null) }
      else if (e.key === "k") { e.preventDefault(); select(visible[Math.max(0, i - 1)]?.id || null) }
      else if (e.key === "/") { e.preventDefault(); composer.current?.focus() }
      else if (!sel) return
      else if (e.key === "a" && openCards[0]) { e.preventDefault(); decide(openCards[0], "approve") }
      else if (e.key === "A") { e.preventDefault(); approveAll() }
      else if (e.key === "x" && openCards[0]) { e.preventDefault(); decide(openCards[0], "reject") }
      else if (e.key === "d") { e.preventDefault(); finish("COMMITTED") }
      else if (e.key === "s") { e.preventDefault(); finish("SKIPPED") }
      else if (e.key === "#") { e.preventDefault(); finish("REJECTED") }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [visible, selId, sel, openCards, decide, approveAll, finish, select])

  const total = (counts.PENDING || 0) + (counts.COMMITTED || 0) + (counts.SKIPPED || 0) + (counts.REJECTED || 0)
  const done = (counts.COMMITTED || 0) + (counts.REJECTED || 0)

  return (
    <AppShell>
      <div style={{ padding: "4px 0" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>Work the pile</h1>
          <span style={{ ...mono, fontSize: 11.5, color: "var(--muted)" }}>tonight {filed} filed · {counts.PENDING || 0} pending · {counts.SKIPPED || 0} skipped</span>
          <div aria-hidden style={{ flex: "0 0 160px", height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden", alignSelf: "center" }}><div style={{ width: `${total ? Math.round((done / total) * 100) : 0}%`, height: "100%", background: "var(--accent2)" }} /></div>
          <span style={{ fontSize: 11.5, color: "var(--muted)" }}>j/k item · a approve · A approve all (no 🔑) · x reject · d done · s skip · # junk · / chat</span>
          <Link href="/notes-intake" style={{ fontSize: 12, marginLeft: "auto" }}>Classic queue →</Link>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "260px minmax(0, 1fr) minmax(360px, 440px)", gap: 14, alignItems: "start" }}>
          {/* queue */}
          <div>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              {TABS.map((t) => <button key={t} className={`btn ${tab === t ? "btn-primary" : "btn-secondary"}`} onClick={() => { if (t !== tab) { setLoading(true); setTab(t); select(null) } }}>{t.toLowerCase()} {counts[t] ?? ""}</button>)}
            </div>
            <input placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: "100%", background: "var(--card)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px", fontSize: 12.5, marginBottom: 8 }} />
            <div style={{ maxHeight: "74vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
              {loading ? <div style={{ color: "var(--muted)", fontSize: 12 }}>Loading…</div> : null}
              {!loading && !groups.length ? <div style={{ color: "var(--muted)", fontSize: 12 }}>Nothing here. 🎉</div> : null}
              {groups.map(([g, list]) => (
                <div key={g}>
                  <div style={{ ...mono, fontSize: 10.5, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 3 }}>{g} · {list.length}</div>
                  {list.map((i) => (
                    <button key={i.id} onClick={() => select(i.id)} style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 8px", marginBottom: 3, borderRadius: 6, cursor: "pointer", fontSize: 12.5, background: selId === i.id ? "var(--accent-subtle)" : "transparent", color: "var(--text)", border: `1px solid ${selId === i.id ? "var(--accent)" : "var(--border)"}` }}>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.noteTitle}</div>
                      <div style={{ ...mono, fontSize: 10, color: "var(--muted)" }}>{i.sourceType || i.origin}{i.matchedClientName ? ` · ${i.matchedClientName}` : ""}</div>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* source */}
          <div style={{ minWidth: 0 }}>
            {sel ? <SourcePane key={sel.id} item={sel} /> : <div style={{ color: "var(--muted)", fontSize: 13, padding: 20, border: "1px dashed var(--border)", borderRadius: 8 }}>Pick an item on the left (or press <kbd>j</kbd>). The agent reads it first and proposes what to file; you approve each card.</div>}
          </div>

          {/* agent */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, position: "sticky", top: 8, maxHeight: "86vh" }}>
            {sel ? (
              <>
                <div aria-live="polite" style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, paddingRight: 2 }}>
                  {entries.map((e, n) => (
                    <div key={n} style={{ alignSelf: e.role === "user" ? "flex-end" : "stretch", maxWidth: e.role === "user" ? "85%" : "100%", background: e.role === "user" ? "var(--accent-subtle)" : "transparent", border: e.role === "user" ? "1px solid var(--accent)" : "none", borderRadius: 8, padding: e.role === "user" ? "6px 10px" : 0, fontSize: 13 }}>
                      {e.tools?.length ? <div style={{ ...mono, fontSize: 10.5, color: "var(--muted)", marginBottom: 4 }}>▸ {e.tools.map((t) => t.summary).join(" · ")}</div> : null}
                      <div style={{ whiteSpace: "pre-wrap" }}>{e.text}</div>
                    </div>
                  ))}
                  {live ? (
                    <div style={{ fontSize: 13 }}>
                      {live.tools.map((t, n) => <div key={n} style={{ ...mono, fontSize: 10.5, color: t.isError ? "var(--warn)" : "var(--muted)" }}>{t.isError ? "⚠" : "·"} {t.summary}</div>)}
                      <div style={{ whiteSpace: "pre-wrap" }}>{live.text}<span style={{ opacity: 0.6 }}>▍</span></div>
                      {!live.text && <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{live.thinking ? "thinking…" : "working…"}</div>}
                    </div>
                  ) : null}
                  {proposals.map((p) => <Card key={p.id} p={p} focused={openCards[0]?.id === p.id} onDecide={decide} />)}
                  {err ? <div role="alert" style={{ fontSize: 12, color: "var(--danger)", border: "1px solid var(--danger)", borderRadius: 6, padding: "6px 8px" }}>{err} {!busy && <button className="btn btn-secondary" onClick={() => runTurn(sel.id, "Continue.")}>Retry</button>}</div> : null}
                  <div ref={transcriptEnd} />
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button className="btn btn-success" disabled={!openCards.some((p) => !p.displayJson.hasSecret)} onClick={approveAll}>Approve all {openCards.filter((p) => !p.displayJson.hasSecret).length || ""} (no 🔑)</button>
                  <button className="btn btn-primary" onClick={() => finish("COMMITTED")} title={openCards.length ? `${openCards.length} card(s) still open — they'll be discarded` : ""}>Done{appliedCount ? ` (${appliedCount} saved)` : ""} → next</button>
                  <button className="btn btn-secondary" onClick={() => finish("SKIPPED")}>Skip</button>
                  <button className="btn btn-secondary" onClick={() => finish("REJECTED")}>Junk</button>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <textarea ref={composer} rows={2} value={draft} placeholder={busy ? "Agent is working…" : "Tell the agent what this is — e.g. “S/N is the bottom line, it's the front desk Grandstream at Main St” (Enter to send)"} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() } }} style={{ flex: 1, resize: "vertical", background: "var(--card)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px", fontSize: 13, fontFamily: "inherit" }} />
                  <button className="btn btn-primary" disabled={busy || !draft.trim()} onClick={send}>Send</button>
                </div>
                <div style={{ fontSize: 10.5, color: "var(--muted)" }}>Don&apos;t type passwords here — the agent proposes them from the source and they go straight to the encrypted vault.</div>
              </>
            ) : null}
          </div>
        </div>
        {toast ? <div role="status" style={{ position: "fixed", bottom: 18, left: "50%", transform: "translateX(-50%)", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 14px", fontSize: 13, zIndex: 50 }}>{toast}</div> : null}
      </div>
    </AppShell>
  )
}
