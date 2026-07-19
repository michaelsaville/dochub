/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */
"use client"

import AppShell from "@/components/AppShell"
import { useEffect, useMemo, useRef, useState } from "react"

type Entity = {
  kind: "credential" | "asset" | "location_network" | "phone_extension" | "other"
  eid?: string
  confidence?: number
  summary?: string
  sourceSnippet?: string
  include?: boolean
  mode?: string
  targetId?: string
  targetClientId?: string
  targetClientName?: string
  _sealed?: Record<string, boolean>
  fields?: Record<string, string | null>
}
type Suggestion = {
  id: string; origin: string; sourceType: string | null; uploadDetectedMime?: string | null
  sourceState: string; sourcePendingOp: string | null; sourceDeletedAt: string | null
  sourcePath: string; sourceFolder: string | null; noteTitle: string
  rawText: string | null; rawTextSealed?: boolean; status: string; isRelevant: boolean; relevanceReason: string | null
  matchedClientId: string | null; matchedClientName: string | null; clientConfidence: number | null
  clientReasoning: string | null; clientCandidatesJson: any; entitiesJson: any; committedSummaryJson: any
}

const TABS = ["PENDING", "COMMITTED", "SKIPPED", "REJECTED", "PURGED", "FAILED", "ALL"]
const ENTITY_KINDS: Entity["kind"][] = ["credential", "asset", "location_network", "phone_extension", "other"]
const SECRET_KEYS = ["password", "totp", "sipPassword"]
const CORE_FIELDS: Record<string, string[]> = {
  credential: ["label", "username", "password", "totp", "url"],
  asset: ["name", "serial", "ipAddress", "make", "model"],
  location_network: ["wanIp", "ispName", "subnet", "gateway"],
  phone_extension: ["extension", "displayName", "sipUsername", "sipPassword", "did"],
  other: ["notes"],
}
const KIND_FIELDS: Record<string, string[]> = {
  credential: ["label", "username", "password", "totp", "url", "notes"],
  asset: ["name", "category", "make", "model", "serial", "ipAddress", "macAddress", "room", "managementUrl", "os", "notes"],
  location_network: ["wanIp", "ispName", "lanIp", "subnet", "gateway", "notes"],
  phone_extension: ["extension", "displayName", "did", "sipUsername", "sipPassword", "notes"],
  other: ["notes"],
}
const KIND_COLOR: Record<string, string> = { credential: "#e0a458", asset: "#3d6fff", location_network: "#43b581", phone_extension: "#b47cff", other: "#8a8f98" }
const OK = "var(--color-text-success)", BAD = "var(--color-text-danger)", WARN = "var(--color-text-warning)"

function confColor(c: number | null | undefined) { if (c == null) return "var(--muted)"; if (c >= 0.85) return OK; if (c >= 0.6) return WARN; return BAD }
function statusColor(s: string) { return s === "COMMITTED" ? OK : s === "REJECTED" || s === "PURGED" ? BAD : s === "FAILED" ? WARN : "var(--accent)" }
function chip(text: string, color: string) { return <span style={{ background: color, color: "var(--bg)", fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4, fontFamily: "var(--mono)", letterSpacing: "0.03em" }}>{text}</span> }

const svg = { width: 13, height: 13, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const }
const ObsidianIcon = () => (<svg {...svg}><path d="M12 3 5 9l7 12 7-12z" /><path d="M5 9h14M12 3v18" /></svg>)
const AppleNotesIcon = () => (<svg {...svg}><rect x="4" y="3" width="16" height="18" rx="2" /><line x1="8" y1="8" x2="16" y2="8" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="8" y1="16" x2="13" y2="16" /></svg>)
const PdfIcon = () => (<svg {...svg}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><line x1="8.5" y1="14" x2="14" y2="14" /></svg>)
const ScreenshotIcon = () => (<svg {...svg}><rect x="2" y="4" width="20" height="13" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>)
const HandwrittenIcon = () => (<svg {...svg}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>)
const UploadIcon = () => (<svg {...svg}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>)
const CsvIcon = () => (<svg {...svg}><rect x="3" y="4" width="18" height="16" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="9" y1="4" x2="9" y2="20" /></svg>)
const SOURCE_META: Record<string, { label: string; color: string; Icon: () => any }> = {
  obsidian: { label: "Obsidian", color: "#b47cff", Icon: ObsidianIcon },
  "apple-notes": { label: "Apple Notes", color: "#e0a458", Icon: AppleNotesIcon },
  "pdf-scan": { label: "PDF scan", color: BAD, Icon: PdfIcon },
  screenshot: { label: "Screenshot", color: "#3d6fff", Icon: ScreenshotIcon },
  handwritten: { label: "Handwritten", color: OK, Icon: HandwrittenIcon },
  csv: { label: "CSV", color: "#2fb3a3", Icon: CsvIcon },
  other: { label: "Upload", color: "#8a8f98", Icon: UploadIcon },
}
function SourceBadge({ source, showLabel = false }: { source: string | null; showLabel?: boolean }) {
  const m = SOURCE_META[source || "other"] || SOURCE_META.other; const Icon = m.Icon
  return (<span title={m.label} style={{ display: "inline-flex", alignItems: "center", gap: showLabel ? 5 : 0, padding: showLabel ? "2px 7px 2px 6px" : 2, borderRadius: 4, lineHeight: 1, flexShrink: 0, color: m.color, background: m.color + "22", border: "0.5px solid " + m.color + "55" }}>
    <Icon />{showLabel && <span style={{ fontSize: 10.5, fontWeight: 600, fontFamily: "var(--mono)", letterSpacing: "0.03em", textTransform: "uppercase" }}>{m.label}</span>}</span>)
}

const inp: React.CSSProperties = { width: "100%", padding: "6px 8px", fontSize: 12, fontFamily: "var(--mono)", background: "var(--color-background-primary)", color: "var(--text)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 4, minHeight: 30 }
const lbl: React.CSSProperties = { fontSize: 10, color: "var(--muted)", fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2, display: "block" }
const ghostBtn: React.CSSProperties = { padding: "8px 12px", fontSize: 12, borderRadius: 6, cursor: "pointer", border: "0.5px solid var(--color-border-tertiary)", background: "transparent", color: "var(--muted)", fontFamily: "var(--sans)", minHeight: 36 }
const primaryBtn: React.CSSProperties = { padding: "8px 16px", fontSize: 12.5, fontWeight: 600, borderRadius: 6, border: "none", cursor: "pointer", background: "var(--text)", color: "var(--bg)", minHeight: 36 }

// ── Upload dropzone (routes CSV → import-csv, else → upload/vision) ──
type Phase = { kind: "idle" | "drag" } | { kind: "uploading" | "analyzing"; name: string } | { kind: "done"; count: number } | { kind: "error"; msg: string }
function UploadDropzone({ onUploaded }: { onUploaded: () => void }) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" })
  const inputRef = useRef<HTMLInputElement>(null)
  const busy = phase.kind === "uploading" || phase.kind === "analyzing"
  async function handleFiles(files: FileList | null) {
    if (!files || !files.length || busy) return
    const arr = Array.from(files)
    const csvs = arr.filter((f) => /\.csv$/i.test(f.name) || f.type === "text/csv")
    const others = arr.filter((f) => !csvs.includes(f))
    const name = arr.length === 1 ? arr[0].name : `${arr.length} files`
    try {
      setPhase({ kind: "uploading", name }); let created = 0
      for (const f of csvs) { const fd = new FormData(); fd.append("file", f); const r = await fetch("/api/notes-intake/import-csv", { method: "POST", body: fd }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "CSV import failed"); created += d.created ?? 0 }
      if (others.length) { setPhase({ kind: "analyzing", name }); const fd = new FormData(); others.forEach((f) => fd.append("files", f)); const r = await fetch("/api/notes-intake/upload", { method: "POST", body: fd }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "Upload failed"); created += d.created ?? 0 }
      setPhase({ kind: "done", count: created }); onUploaded(); setTimeout(() => setPhase({ kind: "idle" }), 2600)
    } catch (e: any) { setPhase({ kind: "error", msg: e.message || "Failed" }) }
  }
  const active = phase.kind === "drag"
  const borderColor = phase.kind === "drag" ? "var(--accent)" : phase.kind === "error" ? BAD : phase.kind === "done" ? OK : "var(--color-border-tertiary)"
  const bg = phase.kind === "drag" ? "var(--color-background-hover)" : phase.kind === "error" ? "var(--color-background-danger)" : phase.kind === "done" ? "var(--color-background-success)" : "var(--color-background-primary)"
  return (
    <div style={{ margin: "0 0 16px" }}>
      <style>{`@keyframes ni-spin { to { transform: rotate(360deg) } }`}</style>
      <div className="ni-drop" onClick={() => !busy && inputRef.current?.click()} onDragOver={(e) => { e.preventDefault(); if (!busy) setPhase({ kind: "drag" }) }} onDragLeave={(e) => { e.preventDefault(); if (phase.kind === "drag") setPhase({ kind: "idle" }) }} onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files) }}
        style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: "22px 20px", textAlign: "center", borderRadius: 8, cursor: busy ? "default" : "pointer", border: (active ? "1px solid " : "1px dashed ") + borderColor, background: bg, transition: "border-color .15s, background .15s" }}>
        {(phase.kind === "idle" || phase.kind === "drag") && (<>
          <span style={{ color: active ? "var(--accent)" : "var(--muted)" }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg></span>
          <div style={{ fontSize: 13, color: active ? "var(--accent)" : "var(--text)", fontWeight: 500 }}>{active ? "Drop to upload" : <>Drag notes here, or <span style={{ color: "var(--accent)" }}>browse / take a photo</span></>}</div>
          <div style={{ fontSize: 10.5, color: "var(--muted)", fontFamily: "var(--mono)", letterSpacing: "0.03em" }}>photos · scans · PDFs · password/TOTP CSV · PNG · JPG · HEIC · PDF · CSV</div>
        </>)}
        {busy && (<><span style={{ width: 22, height: 22, borderRadius: "50%", display: "inline-block", border: "2.5px solid var(--color-border-tertiary)", borderTopColor: "var(--accent)", animation: "ni-spin 0.7s linear infinite" }} /><div style={{ fontSize: 13, color: "var(--text)", fontWeight: 500 }}>{phase.kind === "uploading" ? "Uploading…" : "Analyzing…"}</div><div style={{ fontSize: 10.5, color: "var(--muted)", fontFamily: "var(--mono)" }}>{phase.name}</div></>)}
        {phase.kind === "done" && (<><span style={{ color: OK }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg></span><div style={{ fontSize: 13, color: OK, fontWeight: 500 }}>Added {phase.count} — review below</div></>)}
        {phase.kind === "error" && (<><span style={{ color: BAD }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg></span><div style={{ fontSize: 13, color: BAD, fontWeight: 500 }}>{phase.msg}</div><button onClick={(e) => { e.stopPropagation(); setPhase({ kind: "idle" }) }} style={{ ...ghostBtn, color: "var(--text)" }}>Try again</button></>)}
      </div>
      <input ref={inputRef} type="file" multiple hidden accept="image/*,application/pdf,text/plain,text/csv,.md,.txt,.heic,.csv" onChange={(e) => handleFiles(e.target.files)} />
    </div>
  )
}

function OtpauthPaste({ onUploaded }: { onUploaded: () => void }) {
  const [open, setOpen] = useState(false); const [text, setText] = useState(""); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null)
  async function submit() {
    if (!text.trim() || busy) return; setBusy(true); setMsg(null)
    const r = await fetch("/api/notes-intake/import-otpauth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) })
    const d = await r.json().catch(() => ({})); setBusy(false)
    if (r.ok) { setMsg(`Imported ${d.created} — ${d.matched} matched, ${d.unmatched} to assign`); setText(""); onUploaded() } else setMsg(d.error || "Import failed")
  }
  return (<div style={{ margin: "0 0 16px" }}>
    <button onClick={() => setOpen((o) => !o)} style={{ ...ghostBtn, fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>{open ? "▾" : "▸"} paste otpauth:// TOTP lines (Authy / 2FA export)</button>
    {open && (<div style={{ marginTop: 8 }}>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder={"otpauth://totp/Piedmont:admin?secret=JBSWY3DPEHPK3PXP&issuer=Piedmont"} style={{ ...inp, minHeight: 96, resize: "vertical", whiteSpace: "pre" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}><button onClick={submit} disabled={busy || !text.trim()} style={{ ...primaryBtn, opacity: !text.trim() ? 0.5 : 1 }}>{busy ? "Importing…" : "Import TOTP"}</button>{msg && <span style={{ fontSize: 11.5, color: "var(--muted)" }}>{msg}</span>}</div>
    </div>)}
  </div>)
}

function StateBox({ icon, title, body, spinner }: { icon?: string; title: string; body?: string; spinner?: boolean }) {
  return (<div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "40px 20px", textAlign: "center", color: "var(--muted)" }}>
    {spinner ? <span style={{ width: 22, height: 22, borderRadius: "50%", border: "2.5px solid var(--color-border-tertiary)", borderTopColor: "var(--accent)", animation: "ni-spin 0.7s linear infinite" }} /> : icon ? <span style={{ fontSize: 22 }}>{icon}</span> : null}
    <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 500 }}>{title}</div>{body && <div style={{ fontSize: 12 }}>{body}</div>}
  </div>)
}

// ── Detail panel ──
function DetailPanel({ suggestion, clients, clientById, clientByName, onDone, toast, isMobile, onBack }: {
  suggestion: Suggestion; clients: { id: string; name: string }[]; clientById: Record<string, string>; clientByName: Record<string, string>
  onDone: (msg: string, opts?: { type?: string; undo?: () => void; advance?: boolean }) => void; toast: (m: string, type?: string) => void; isMobile: boolean; onBack: () => void
}) {
  const [draft, setDraft] = useState<Suggestion>(() => JSON.parse(JSON.stringify(suggestion)))
  const [busy, setBusy] = useState(false)
  const [matches, setMatches] = useState<Record<number, any>>({})
  const [revealed, setRevealed] = useState(false)
  const [expand, setExpand] = useState<Record<number, boolean>>({})
  const [routeOpen, setRouteOpen] = useState<Record<number, boolean>>({})
  const hasSealed = useMemo(() => (suggestion.entitiesJson || []).some((e: Entity) => e._sealed && Object.values(e._sealed).some(Boolean)) || !!suggestion.rawTextSealed, [suggestion])

  // duplicate detection — on client change and (debounced) when match keys edited
  const sig = useMemo(() => JSON.stringify((draft.entitiesJson || []).map((e: Entity) => [e.kind, e.fields?.serial, e.fields?.name, e.fields?.extension, e.fields?.label, e.fields?.username])), [draft.entitiesJson])
  useEffect(() => {
    let alive = true; const t = setTimeout(async () => {
      const r = await fetch(`/api/notes-intake/${draft.id}/matches`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: draft.matchedClientId, entities: draft.entitiesJson }) })
      const d = await r.json().catch(() => ({ matches: [] })); if (!alive) return
      const map: Record<number, any> = {}; for (const m of (d.matches || [])) map[m.entityIndex] = m; setMatches(map)
      setDraft((cur) => ({ ...cur, entitiesJson: (cur.entitiesJson || []).map((e: any, idx: number) => { const m = map[idx]; if (!m) return e.mode === "skip" ? e : { ...e, mode: e.mode === "update" && !e.targetId ? "create" : (e.mode || "create") }; if (e.mode === "skip") return e; if (e.mode && e.targetId) return e; return { ...e, mode: m.strong ? "update" : "create", targetId: m.targetId } }) }))
    }, 500)
    return () => { alive = false; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.matchedClientId, draft.id, sig])

  function patchDraft(p: Partial<Suggestion>) { setDraft((d) => ({ ...d, ...p })) }
  function setEntity(idx: number, p: Partial<Entity>) { setDraft((d) => { const e = [...(d.entitiesJson || [])]; e[idx] = { ...e[idx], ...p }; return { ...d, entitiesJson: e } }) }
  function setEntityField(idx: number, key: string, val: string) { setDraft((d) => { const e = [...(d.entitiesJson || [])]; e[idx] = { ...e[idx], fields: { ...(e[idx].fields || {}), [key]: val } }; return { ...d, entitiesJson: e } }) }
  function addEntity(kind: Entity["kind"]) { setDraft((d) => ({ ...d, entitiesJson: [...(d.entitiesJson || []), { kind, summary: "", include: true, mode: "create", fields: {} }] })) }
  function removeEntity(idx: number) { setDraft((d) => ({ ...d, entitiesJson: (d.entitiesJson || []).filter((_: any, i: number) => i !== idx) })) }

  async function reveal() {
    if (revealed || busy) return; setBusy(true)
    const r = await fetch(`/api/notes-intake/${draft.id}/reveal`, { method: "POST" }); const d = await r.json().catch(() => ({})); setBusy(false)
    if (!r.ok) { toast(d.error || "Reveal failed", "error"); return }
    const byId: Record<string, any> = {}; for (const e of (d.entities || [])) if (e.eid) byId[e.eid] = e
    setDraft((cur) => ({ ...cur, rawText: d.rawText ?? cur.rawText, rawTextSealed: false, entitiesJson: (cur.entitiesJson || []).map((e: any) => { const src = e.eid ? byId[e.eid] : null; if (!src) return e; const fields = { ...e.fields }; for (const k of SECRET_KEYS) if (src.fields?.[k]) fields[k] = src.fields[k]; return { ...e, fields, _sealed: {} } }) }))
    setRevealed(true)
  }

  async function ensureSecrets(): Promise<Entity[]> {
    // Commit is safe even if not revealed (server reconciles), so just send the draft entities.
    return draft.entitiesJson || []
  }
  async function commit() {
    if (!draft.matchedClientId) { toast("Pick a client first", "error"); return }
    const ents = await ensureSecrets()
    const active = ents.filter((e: Entity) => e.include !== false && e.mode !== "skip")
    const upd = active.filter((e: Entity) => e.mode === "update").length
    if (!confirm(`Push ${active.length} item(s) into ${draft.matchedClientName}?\n${upd ? `${upd} will UPDATE an existing record (non-destructive). ` : ""}Credentials are encrypted. Source kept unless you trash it.`)) return
    setBusy(true)
    const r = await fetch(`/api/notes-intake/${draft.id}/commit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: draft.matchedClientId, entities: ents }) })
    const d = await r.json(); setBusy(false)
    if (r.ok) { const s = d.summary; onDone(`Pushed: ${s.credentials.length} new cred, ${s.assets.length} new asset, ${s.phoneExtensions.length} ext${s.updated?.length ? ` · ${s.updated.length} updated` : ""}${s.skipped?.length ? ` · ${s.skipped.length} skipped` : ""}`, { type: "success", advance: true }) } else toast(d.error || "Commit failed", "error")
  }
  async function save() {
    setBusy(true); const corrected = draft.matchedClientId !== suggestion.matchedClientId
    const r = await fetch(`/api/notes-intake/${draft.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ matchedClientId: draft.matchedClientId, matchedClientName: draft.matchedClientName, clientCorrected: corrected, entities: draft.entitiesJson, sourceType: draft.sourceType }) })
    setBusy(false); if (r.ok) onDone("Saved" + (corrected ? " · learned folder → client" : ""), { type: "success" }); else toast("Save failed", "error")
  }
  async function setStatus(status: string) { setBusy(true); const r = await fetch(`/api/notes-intake/${draft.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }); setBusy(false); if (r.ok) onDone(status === "REJECTED" ? "Rejected" : "Skipped", { type: "info", advance: true, undo: async () => { await fetch(`/api/notes-intake/${draft.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "PENDING" }) }) } }) }
  function trashCopy() { if (draft.origin === "upload") return "Move this uploaded file to trash? Recoverable."; if (draft.sourceType === "obsidian") return "Remove from your Obsidian vault?\nCommitted to git (recoverable) and, because the vault syncs to your iPad, it will disappear there too."; if (draft.origin === "csv") return "This came from a CSV/paste — no source file to remove."; return "Remove the exported markdown on the server?\nThis does NOT touch the Apple Notes app original on your phone. Recoverable from trash." }
  async function trashSource() { if (!confirm(trashCopy())) return; setBusy(true); const r = await fetch(`/api/notes-intake/${draft.id}/delete-source`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "trash" }) }); const d = await r.json(); setBusy(false); if (r.ok) onDone(d.mode === "queued" ? "Source removal queued" : "Source moved to trash", { type: "info" }); else toast(d.error || "Failed", "error") }
  async function restoreSource() { setBusy(true); const r = await fetch(`/api/notes-intake/${draft.id}/delete-source`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "restore" }) }); setBusy(false); if (r.ok) onDone("Source restore requested", { type: "info" }); else toast("Failed", "error") }
  async function purge() {
    if (!confirm(`Purge "${draft.noteTitle}"?\nMarks it do-not-import AND removes the source (recoverable from trash).`)) return
    setBusy(true); await fetch(`/api/notes-intake/${draft.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "PURGED" }) })
    const r = await fetch(`/api/notes-intake/${draft.id}/delete-source`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "trash" }) }); setBusy(false)
    if (r.ok) onDone("Purged", { type: "info", advance: true, undo: async () => { await fetch(`/api/notes-intake/${draft.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "PENDING" }) }); await fetch(`/api/notes-intake/${draft.id}/delete-source`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "restore" }) }) } }); else toast("Purge failed", "error")
  }

  // keyboard actions when a note is open (ignore while typing)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement; if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return
      if (e.key === "p" || e.key === "Enter") { e.preventDefault(); if (draft.status !== "COMMITTED" && draft.status !== "PURGED") commit() }
      else if (e.key === "s") { e.preventDefault(); setStatus("SKIPPED") }
      else if (e.key === "r") { e.preventDefault(); setStatus("REJECTED") }
      else if (e.key === "x") { e.preventDefault(); purge() }
    }
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])

  const srcLine = (() => {
    if (draft.sourceState === "TRASHED") return { text: `Source trashed${draft.sourceDeletedAt ? " " + new Date(draft.sourceDeletedAt).toLocaleDateString() : ""}`, action: <button onClick={restoreSource} disabled={busy} style={{ ...ghostBtn, padding: "3px 9px", minHeight: 0, color: "var(--accent)" }}>Restore</button> }
    if (draft.sourcePendingOp === "TRASH") return { text: "Source removal queued…", action: null }
    if (draft.sourcePendingOp === "RESTORE") return { text: "Source restore queued…", action: null }
    if (draft.sourceState === "GONE") return { text: "No source file", action: null }
    return { text: "Source on disk", action: <button onClick={trashSource} disabled={busy} style={{ ...ghostBtn, padding: "3px 9px", minHeight: 0, color: BAD }}>Trash source</button> }
  })()

  return (
    <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: 10, background: "var(--color-background-secondary)", display: "flex", flexDirection: "column", maxHeight: isMobile ? "none" : "82vh" }}>
      <div style={{ padding: 18, overflowY: "auto", flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 8, marginBottom: 4 }}>
          <div style={{ minWidth: 0 }}>
            {isMobile && <button onClick={onBack} style={{ ...ghostBtn, padding: "4px 10px", marginBottom: 8 }}>← Notes</button>}
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text)" }}>{draft.noteTitle}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}><SourceBadge source={draft.sourceType} showLabel /><span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{draft.sourcePath}</span></div>
          </div>
          {chip(draft.status, statusColor(draft.status))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "8px 0 12px", fontSize: 11, color: "var(--muted)", fontFamily: "var(--mono)", flexWrap: "wrap" }}>
          <span>{srcLine.text}</span>{srcLine.action}
          {hasSealed && !revealed && <button onClick={reveal} disabled={busy} style={{ ...ghostBtn, padding: "3px 9px", minHeight: 0, color: "var(--accent)" }}>🔒 Reveal secrets</button>}
          {revealed && <span style={{ color: WARN }}>secrets revealed (audited)</span>}
        </div>

        {draft.origin === "upload" && (<details open style={{ margin: "0 0 12px" }}><summary style={{ fontSize: 11, color: "var(--muted)", cursor: "pointer", fontFamily: "var(--mono)" }}>source file</summary><div style={{ marginTop: 6 }}>{String(draft.uploadDetectedMime || "").includes("pdf") ? <object data={`/api/notes-intake/${draft.id}/file`} type="application/pdf" style={{ width: "100%", height: 420, borderRadius: 6, border: "0.5px solid var(--color-border-tertiary)" }}><a href={`/api/notes-intake/${draft.id}/file`} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>Open file</a></object> : <img src={`/api/notes-intake/${draft.id}/file`} alt="source" style={{ maxWidth: "100%", maxHeight: 480, borderRadius: 6, border: "0.5px solid var(--color-border-tertiary)", display: "block" }} />}</div></details>)}

        {draft.relevanceReason && <div style={{ fontSize: 11.5, color: "var(--muted)", margin: "0 0 12px", fontStyle: "italic" }}>{draft.relevanceReason}</div>}

        <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 8, padding: 12, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}><span style={lbl}>Client match</span><span style={{ fontSize: 11, color: confColor(draft.clientConfidence), fontFamily: "var(--mono)" }}>{draft.clientConfidence != null ? Math.round(draft.clientConfidence * 100) + "% AI" : ""}</span></div>
          <input list="clientlist" value={draft.matchedClientName || ""} placeholder="Type to search clients…" onChange={(e) => { const v = e.target.value; const id = clientByName[v.trim().toLowerCase()]; patchDraft({ matchedClientName: v, matchedClientId: id || draft.matchedClientId }) }} style={{ ...inp, fontFamily: "var(--sans)", fontSize: 13 }} />
          <datalist id="clientlist">{clients.map((c) => <option key={c.id} value={c.name} />)}</datalist>
          {draft.clientReasoning && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>{draft.clientReasoning}</div>}
          {Array.isArray(draft.clientCandidatesJson) && draft.clientCandidatesJson.length > 0 && (<div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}><span style={{ fontSize: 10, color: "var(--muted)" }}>alt:</span>{draft.clientCandidatesJson.map((cid: string) => clientById[cid] ? (<button key={cid} onClick={() => patchDraft({ matchedClientId: cid, matchedClientName: clientById[cid] })} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, cursor: "pointer", border: "0.5px solid var(--color-border-tertiary)", background: "transparent", color: "var(--accent)", minHeight: 26 }}>{clientById[cid]}</button>) : null)}</div>)}
        </div>

        <div style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>{(draft.entitiesJson || []).length} item(s)</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {(draft.entitiesJson || []).map((e: Entity, idx: number) => {
            const expanded = expand[idx]
            const populated = Object.keys(e.fields || {}).filter((k) => e.fields?.[k] || (e._sealed && e._sealed[k]))
            const base = expanded ? (KIND_FIELDS[e.kind] || []) : Array.from(new Set([...(CORE_FIELDS[e.kind] || []), ...populated]))
            const keys = base
            const included = e.include !== false
            const m = matches[idx]
            return (
              <div key={idx} style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: 8, padding: 10, opacity: included && e.mode !== "skip" ? 1 : 0.5, background: "var(--color-background-primary)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <input type="checkbox" checked={included} onChange={(ev) => setEntity(idx, { include: ev.target.checked })} style={{ width: 16, height: 16 }} />
                  <span style={{ background: (KIND_COLOR[e.kind] || "#888"), color: "var(--bg)", fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4, fontFamily: "var(--mono)" }}>{e.kind.replace("_", " ")}</span>
                  <input value={e.summary || ""} placeholder="describe…" onChange={(ev) => setEntity(idx, { summary: ev.target.value })} style={{ ...inp, fontFamily: "var(--sans)", fontSize: 12.5, fontWeight: 500, border: "none", background: "transparent", padding: "2px 0", minHeight: 0 }} />
                  <span style={{ fontSize: 10, color: confColor(e.confidence), fontFamily: "var(--mono)", flexShrink: 0 }}>{e.confidence != null ? Math.round(e.confidence * 100) + "%" : ""}</span>
                  <button onClick={() => removeEntity(idx)} title="Remove" style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "0 4px" }}>×</button>
                </div>
                {m && (<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", margin: "0 0 8px", padding: "6px 8px", borderRadius: 6, background: m.strong ? "var(--color-background-danger)" : "var(--color-background-warning)", border: "0.5px solid " + (m.strong ? "var(--color-border-danger)" : "var(--color-border-warning)") }}>
                  <span style={{ fontSize: 11, color: "var(--text)" }}>⚠ May already exist: <b>{m.targetLabel}</b> <span style={{ color: "var(--muted)" }}>· {m.reason}{e.mode === "update" ? " · Update fills blanks only" : ""}</span></span>
                  <div style={{ display: "flex", gap: 4 }}>{([["update", "Update"], ["create", "New"], ["skip", "Skip"]] as const).map(([mode, t]) => { const on = (e.mode || "create") === mode; return <button key={mode} onClick={() => setEntity(idx, mode === "update" ? { mode, targetId: m.targetId } : { mode, targetId: undefined })} style={{ fontSize: 10.5, padding: "4px 9px", borderRadius: 4, cursor: "pointer", fontFamily: "var(--mono)", border: "0.5px solid var(--color-border-tertiary)", background: on ? "var(--accent)" : "transparent", color: on ? "#fff" : "var(--muted)", minHeight: 26 }}>{t}</button> })}</div>
                </div>)}
                <div className="ni-fields" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {keys.map((k) => { const isSecret = SECRET_KEYS.includes(k); const sealed = isSecret && e._sealed?.[k] && !revealed; return (<div key={k}><label style={lbl}>{k}{isSecret ? " 🔑" : ""}</label><input value={sealed ? "" : ((e.fields?.[k] as string) || "")} placeholder={sealed ? "•••••• reveal" : ""} disabled={sealed} onChange={(ev) => setEntityField(idx, k, ev.target.value)} style={inp} /></div>) })}
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
                  {(KIND_FIELDS[e.kind] || []).length > keys.length || expanded ? <button onClick={() => setExpand((s) => ({ ...s, [idx]: !s[idx] }))} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 10.5, fontFamily: "var(--mono)", padding: 0 }}>{expanded ? "− fewer fields" : "+ all fields"}</button> : null}
                  <button onClick={() => setRouteOpen((s) => ({ ...s, [idx]: !s[idx] }))} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 10.5, fontFamily: "var(--mono)", padding: 0 }}>⇢ route to {e.targetClientName || "different client"}</button>
                </div>
                {routeOpen[idx] && (<div style={{ marginTop: 6 }}><label style={lbl}>this item → client (blank = note&apos;s client)</label><input list="clientlist" value={e.targetClientName || ""} placeholder={draft.matchedClientName || "note client"} onChange={(ev) => { const v = ev.target.value; const id = clientByName[v.trim().toLowerCase()]; setEntity(idx, { targetClientName: v || undefined, targetClientId: id || undefined }) }} style={{ ...inp, fontFamily: "var(--sans)" }} /></div>)}
                {e.sourceSnippet && (<details style={{ marginTop: 8 }}><summary style={{ fontSize: 10.5, color: "var(--muted)", cursor: "pointer", fontFamily: "var(--mono)" }}>source snippet</summary><pre style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "pre-wrap", marginTop: 4, fontFamily: "var(--mono)" }}>{e.sourceSnippet}</pre></details>)}
              </div>
            )
          })}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, flexWrap: "wrap" }}><span style={{ fontSize: 10.5, color: "var(--muted)", fontFamily: "var(--mono)" }}>+ add item:</span>{ENTITY_KINDS.map((k) => (<button key={k} onClick={() => addEntity(k)} style={{ fontSize: 10.5, padding: "4px 9px", borderRadius: 4, cursor: "pointer", fontFamily: "var(--mono)", border: "0.5px solid " + (KIND_COLOR[k] || "#888") + "66", background: "transparent", color: KIND_COLOR[k] || "#888", minHeight: 26 }}>{k.replace("_", " ")}</button>))}</div>
        {(draft.entitiesJson || []).length === 0 && <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 8, fontStyle: "italic" }}>Nothing extracted{draft.isRelevant ? "" : " — AI marked this not relevant"}. Pick a client, add items by hand, then Push — or Purge.</div>}

        {draft.committedSummaryJson && (<pre style={{ fontSize: 11, color: OK, marginTop: 12, fontFamily: "var(--mono)", whiteSpace: "pre-wrap" }}>{JSON.stringify(draft.committedSummaryJson, null, 2)}</pre>)}
        <details style={{ marginTop: 12 }}><summary style={{ fontSize: 11, color: "var(--muted)", cursor: "pointer", fontFamily: "var(--mono)" }}>original note</summary>{draft.rawTextSealed && !revealed ? <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 6 }}>🔒 <button onClick={reveal} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 11.5 }}>Reveal</button> to view (audited)</div> : <pre style={{ fontSize: 11.5, color: "var(--text)", whiteSpace: "pre-wrap", marginTop: 6, fontFamily: "var(--mono)", background: "var(--color-background-primary)", padding: 10, borderRadius: 6 }}>{draft.rawText}</pre>}</details>
      </div>

      {draft.status !== "COMMITTED" && draft.status !== "PURGED" && (
        <div style={{ display: "flex", gap: 8, padding: 14, borderTop: "0.5px solid var(--color-border-tertiary)", flexWrap: "wrap", position: "sticky", bottom: 0, background: "var(--color-background-secondary)", borderRadius: "0 0 10px 10px" }}>
          <button onClick={commit} disabled={busy} style={primaryBtn} title="p / Enter">Confirm &amp; Push →</button>
          <button onClick={save} disabled={busy} style={{ ...ghostBtn, color: "var(--text)" }}>Save</button>
          <div style={{ flex: 1 }} />
          <button onClick={() => setStatus("SKIPPED")} disabled={busy} style={ghostBtn} title="s">Skip</button>
          <button onClick={() => setStatus("REJECTED")} disabled={busy} style={{ ...ghostBtn, color: BAD }} title="r">Reject</button>
          <button onClick={purge} disabled={busy} style={{ padding: "8px 12px", fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: "pointer", border: "0.5px solid var(--color-border-danger)", background: "var(--color-background-danger)", color: BAD, fontFamily: "var(--sans)", minHeight: 36 }} title="x">Purge</button>
        </div>
      )}
    </div>
  )
}

export default function NotesIntakePage() {
  const [tab, setTab] = useState("PENDING")
  const [items, setItems] = useState<Suggestion[]>([])
  const [clients, setClients] = useState<{ id: string; name: string }[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [selId, setSelId] = useState<string | null>(null)
  const [search, setSearch] = useState(""); const [srcFilter, setSrcFilter] = useState<string | null>(null); const [confFilter, setConfFilter] = useState<string | null>(null)
  const [toastMsg, setToastMsg] = useState<{ msg: string; type: string; undo?: () => void } | null>(null)
  const [loading, setLoading] = useState(true); const [loadErr, setLoadErr] = useState<string | null>(null); const [reloadKey, setReloadKey] = useState(0)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [selectMode, setSelectMode] = useState(false); const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isMobile, setIsMobile] = useState(false)
  const flatRef = useRef<string[]>([])
  const toastTimer = useRef<any>(null)

  function showToast(msg: string, type = "info", undo?: () => void) { setToastMsg({ msg, type, undo }); if (toastTimer.current) clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToastMsg(null), undo ? 6000 : 3800) }

  useEffect(() => { const mq = window.matchMedia("(max-width: 720px)"); setIsMobile(mq.matches); const h = (e: any) => setIsMobile(e.matches); mq.addEventListener("change", h); return () => mq.removeEventListener("change", h) }, [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try { const r = await fetch(`/api/notes-intake?status=${tab}`); if (!r.ok) throw new Error("load failed"); const d = await r.json(); if (!alive) return; setItems(d.suggestions || []); setClients(d.clients || []); setCounts(d.counts || {}); setLoading(false); setLoadErr(null) }
      catch (e: any) { if (alive) { setLoadErr(e.message || "Failed to load"); setLoading(false) } }
    })()
    return () => { alive = false }
  }, [tab, reloadKey])

  const sel = useMemo(() => items.find((i) => i.id === selId) || null, [items, selId])
  const clientById = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c.name])), [clients])
  const clientByName = useMemo(() => Object.fromEntries(clients.map((c) => [c.name.toLowerCase(), c.id])), [clients])
  const srcTypes = useMemo(() => [...new Set(items.map((i) => i.sourceType || "other"))], [items])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase(); let list = items
    if (srcFilter) list = list.filter((i) => (i.sourceType || "other") === srcFilter)
    if (confFilter) list = list.filter((i) => { const c = i.clientConfidence; if (confFilter === "unmatched") return !i.matchedClientId; if (confFilter === "high") return c != null && c >= 0.85; if (confFilter === "med") return c != null && c >= 0.6 && c < 0.85; if (confFilter === "low") return c == null || c < 0.6; return true })
    if (q) list = list.filter((i) => (i.noteTitle + " " + (i.sourceFolder || "") + " " + (i.matchedClientName || "")).toLowerCase().includes(q))
    return list
  }, [items, search, srcFilter, confFilter])

  const groups = useMemo(() => { const m = new Map<string, Suggestion[]>(); for (const i of filtered) { const k = i.matchedClientName || "— unmatched —"; if (!m.has(k)) m.set(k, []); m.get(k)!.push(i) } return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])) }, [filtered])
  useEffect(() => { flatRef.current = groups.flatMap(([, l]) => l.map((i) => i.id)) }, [groups])

  function onDone(msg: string, opts?: { type?: string; undo?: () => void; advance?: boolean }) {
    showToast(msg, opts?.type || "info", opts?.undo)
    if (opts?.advance) { const flat = flatRef.current; const i = flat.indexOf(selId || ""); const next = flat[i + 1] || flat[i - 1] || null; setSelId(next) } else if (!opts?.advance && opts?.type !== "success") { /* keep */ }
    setLoading(true); setReloadKey((k) => k + 1)
  }

  // list keyboard navigation (j/k)
  useEffect(() => {
    function onKey(e: KeyboardEvent) { const t = e.target as HTMLElement; if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return; const flat = flatRef.current; if (!flat.length) return; const i = flat.indexOf(selId || ""); if (e.key === "j") { e.preventDefault(); setSelId(flat[Math.min(flat.length - 1, i + 1)] || flat[0]) } else if (e.key === "k") { e.preventDefault(); setSelId(flat[Math.max(0, i - 1)] || flat[0]) } else if (e.key === "Escape") setSelId(null) }
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey)
  }, [selId])

  function toggleSel(id: string) { setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n }) }
  async function bulk(action: string, clientId?: string, clientName?: string) {
    const ids = action === "purgeAllSkipped" ? filtered.map((i) => i.id) : [...selected]
    if (!ids.length) return
    if (action === "purge" || action === "purgeAllSkipped") { if (!confirm(`Purge ${ids.length} note(s)? Marks do-not-import and trashes their sources (recoverable).`)) return }
    const r = await fetch("/api/notes-intake/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: action === "purgeAllSkipped" ? "purge" : action, ids, clientId, clientName }) })
    const d = await r.json().catch(() => ({}))
    if (r.ok) { showToast(`${action.startsWith("purge") ? "Purged" : action === "assign" ? "Assigned" : action === "skip" ? "Skipped" : "Rejected"} ${d.updated}`, "success"); setSelected(new Set()); setLoading(true); setReloadKey((k) => k + 1) } else showToast(d.error || "Bulk failed", "error")
  }

  const showList = !isMobile || !sel
  const showDetail = !isMobile || !!sel

  return (
    <AppShell>
      <style>{`@keyframes ni-spin { to { transform: rotate(360deg) } } @media (max-width: 720px) { .ni-grid { grid-template-columns: 1fr !important; } .ni-list { max-height: none !important; } .ni-fields { grid-template-columns: 1fr !important; } .ni-tabs { overflow-x: auto; -webkit-overflow-scrolling: touch; } .ni-drop { padding: 26px 16px !important; } }`}</style>
      <div style={{ padding: "20px 24px", maxWidth: 1400, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 4, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}><h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--text)" }}>Notes Intake</h1><span style={{ fontSize: 12, color: "var(--muted)" }}>AI-matched notes → DocHub. j/k move · p push · s skip · r reject · x purge</span></div>
          <div style={{ display: "flex", gap: 8, alignSelf: "center" }}>
            <button onClick={() => setSelectMode((s) => { setSelected(new Set()); return !s })} style={{ ...ghostBtn, color: selectMode ? "var(--accent)" : "var(--muted)" }}>{selectMode ? "Done" : "Select"}</button>
            <button onClick={() => setUploadOpen((o) => !o)} style={{ ...ghostBtn, color: uploadOpen ? "var(--accent)" : "var(--text)", display: "inline-flex", alignItems: "center", gap: 6 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>Upload notes</button>
          </div>
        </div>

        <div className="ni-tabs" style={{ display: "flex", gap: 6, margin: "14px 0" }}>{TABS.map((t) => (<button key={t} onClick={() => { setTab(t); setSelId(null); setSelected(new Set()); setLoading(true) }} style={{ padding: "6px 12px", fontSize: 12, borderRadius: 6, cursor: "pointer", fontFamily: "var(--mono)", letterSpacing: "0.03em", border: "0.5px solid var(--color-border-tertiary)", background: tab === t ? "var(--color-background-hover)" : "transparent", color: tab === t ? "var(--text)" : "var(--muted)", whiteSpace: "nowrap", minHeight: 34 }}>{t}{counts[t] != null ? ` ${counts[t]}` : ""}</button>))}</div>

        {uploadOpen && <UploadDropzone onUploaded={() => { setUploadOpen(true); setLoading(true); setReloadKey((k) => k + 1) }} />}
        {uploadOpen && <OtpauthPaste onUploaded={() => { setLoading(true); setReloadKey((k) => k + 1) }} />}

        <div className="ni-grid" style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 18, alignItems: "start" }}>
          {showList && (<div>
            <input placeholder="Filter notes / clients…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...inp, marginBottom: 8, fontFamily: "var(--sans)" }} />
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
              {["high", "med", "low", "unmatched"].map((c) => (<button key={c} onClick={() => setConfFilter(confFilter === c ? null : c)} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, cursor: "pointer", fontFamily: "var(--mono)", border: "0.5px solid var(--color-border-tertiary)", background: confFilter === c ? "var(--color-background-hover)" : "transparent", color: confFilter === c ? "var(--text)" : "var(--muted)", minHeight: 24 }}>{c}</button>))}
              {srcTypes.length > 1 && srcTypes.map((st) => { const m = SOURCE_META[st] || SOURCE_META.other; const on = srcFilter === st; return (<button key={st} onClick={() => setSrcFilter(on ? null : st)} title={m.label} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 4, cursor: "pointer", fontSize: 10, fontFamily: "var(--mono)", color: m.color, background: on ? m.color + "33" : "transparent", border: "0.5px solid " + m.color + (on ? "aa" : "44"), minHeight: 24 }}><m.Icon />{m.label}</button>) })}
            </div>
            {tab === "SKIPPED" && filtered.length > 0 && <button onClick={() => bulk("purgeAllSkipped")} style={{ ...ghostBtn, width: "100%", marginBottom: 8, color: BAD, borderColor: "var(--color-border-danger)" }}>Purge all {filtered.length} skipped</button>}
            <div className="ni-list" style={{ maxHeight: "68vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
              {loading && <StateBox spinner title="Loading…" />}
              {!loading && loadErr && <StateBox icon="⚠️" title="Couldn’t load the queue" body={loadErr} />}
              {!loading && !loadErr && groups.length === 0 && <StateBox icon="✓" title={`Nothing in “${tab}”`} body="Try another tab or upload notes." />}
              {!loading && groups.map(([cname, list]) => (<div key={cname}>
                <div style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>{cname} · {list.length}</div>
                {list.map((i) => { const ents = (i.entitiesJson || []).length; const trashed = i.sourceState === "TRASHED" || i.sourceState === "GONE"; return (
                  <div key={i.id} onClick={() => selectMode ? toggleSel(i.id) : setSelId(i.id)} style={{ padding: "9px 10px", borderRadius: 6, cursor: "pointer", marginBottom: 4, border: "0.5px solid " + (selId === i.id ? "var(--accent)" : selected.has(i.id) ? "var(--accent)" : "var(--color-border-tertiary)"), background: selId === i.id || selected.has(i.id) ? "var(--color-background-hover)" : "var(--color-background-secondary)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      {selectMode && <input type="checkbox" checked={selected.has(i.id)} onChange={() => toggleSel(i.id)} onClick={(e) => e.stopPropagation()} style={{ width: 16, height: 16 }} />}
                      <span style={{ opacity: trashed ? 0.4 : 1 }}><SourceBadge source={i.sourceType} /></span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: "var(--text)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: trashed ? "line-through" : "none" }}>{i.noteTitle}</span>
                      <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: confColor(i.clientConfidence), flexShrink: 0 }}>{i.clientConfidence != null ? Math.round(i.clientConfidence * 100) + "%" : ""}</span>
                    </div>
                    <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 2 }}>{i.sourceFolder} · {ents} item{ents === 1 ? "" : "s"}{i.sourcePendingOp ? " · queued" : ""}</div>
                  </div>) })}
              </div>))}
            </div>
          </div>)}
          {showDetail && (<div>
            {!sel && <StateBox icon="📝" title="Select a note to review" body="Use j / k to move, or tap a note." />}
            {sel && <DetailPanel key={sel.id} suggestion={sel} clients={clients} clientById={clientById} clientByName={clientByName} onDone={onDone} toast={(m, t) => showToast(m, t)} isMobile={isMobile} onBack={() => setSelId(null)} />}
          </div>)}
        </div>
      </div>

      {selectMode && selected.size > 0 && (
        <div style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 8, background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.3)", padding: "8px 12px", zIndex: 90, flexWrap: "wrap", maxWidth: "94vw" }}>
          <span style={{ fontSize: 12, color: "var(--text)", fontWeight: 600 }}>{selected.size} selected</span>
          <input list="clientlist" placeholder="assign client…" onKeyDown={(e) => { if (e.key === "Enter") { const id = clientByName[(e.target as HTMLInputElement).value.trim().toLowerCase()]; if (id) bulk("assign", id, clientById[id]) } }} style={{ ...inp, width: 150, fontFamily: "var(--sans)" }} />
          <button onClick={() => bulk("skip")} style={ghostBtn}>Skip</button>
          <button onClick={() => bulk("reject")} style={{ ...ghostBtn, color: BAD }}>Reject</button>
          <button onClick={() => bulk("purge")} style={{ ...ghostBtn, color: BAD, borderColor: "var(--color-border-danger)" }}>Purge</button>
          <button onClick={() => setSelected(new Set())} style={{ ...ghostBtn, color: "var(--muted)" }}>Clear</button>
        </div>
      )}

      {toastMsg && (<div style={{ position: "fixed", bottom: 20, right: 20, display: "flex", alignItems: "center", gap: 12, background: "var(--color-background-secondary)", color: "var(--text)", border: "0.5px solid " + (toastMsg.type === "error" ? "var(--color-border-danger)" : toastMsg.type === "success" ? "var(--color-border-success)" : "var(--color-border-tertiary)"), borderLeft: "3px solid " + (toastMsg.type === "error" ? BAD : toastMsg.type === "success" ? OK : "var(--accent)"), padding: "10px 14px", borderRadius: 8, fontSize: 13, zIndex: 100, fontFamily: "var(--sans)", boxShadow: "0 8px 24px rgba(0,0,0,0.3)", maxWidth: "90vw" }}>
        <span>{toastMsg.msg}</span>
        {toastMsg.undo && <button onClick={async () => { const u = toastMsg.undo!; setToastMsg(null); await u(); setLoading(true); setReloadKey((k) => k + 1) }} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Undo</button>}
        <button onClick={() => setToastMsg(null)} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 15 }}>×</button>
      </div>)}
    </AppShell>
  )
}
