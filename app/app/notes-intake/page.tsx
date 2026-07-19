/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import AppShell from "@/components/AppShell"
import { useEffect, useMemo, useRef, useState } from "react"

type Client = { id: string; name: string }
type Entity = {
  kind: "credential" | "asset" | "location_network" | "phone_extension" | "other"
  confidence?: number
  summary?: string
  sourceSnippet?: string
  include?: boolean
  mode?: string // create | update | skip
  targetId?: string
  fields?: Record<string, string | null>
}
type Suggestion = {
  id: string
  origin: string
  sourceType: string | null
  sourceState: string
  sourcePendingOp: string | null
  sourceDeletedAt: string | null
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

const TABS = ["PENDING", "COMMITTED", "REJECTED", "SKIPPED", "PURGED", "ALL"]
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

// ── Source-type icons (13px stroke, matches Sidebar/AppShell) ──
const svg = { width: 13, height: 13, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const }
const ObsidianIcon = () => (<svg {...svg}><path d="M12 3 5 9l7 12 7-12z" /><path d="M5 9h14M12 3v18" /></svg>)
const AppleNotesIcon = () => (<svg {...svg}><rect x="4" y="3" width="16" height="18" rx="2" /><line x1="8" y1="8" x2="16" y2="8" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="8" y1="16" x2="13" y2="16" /></svg>)
const PdfIcon = () => (<svg {...svg}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><line x1="8.5" y1="14" x2="14" y2="14" /></svg>)
const ScreenshotIcon = () => (<svg {...svg}><rect x="2" y="4" width="20" height="13" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>)
const HandwrittenIcon = () => (<svg {...svg}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>)
const UploadIcon = () => (<svg {...svg}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>)
const SOURCE_META: Record<string, { label: string; color: string; Icon: () => any }> = {
  obsidian: { label: "Obsidian", color: "#b47cff", Icon: ObsidianIcon },
  "apple-notes": { label: "Apple Notes", color: "#e0a458", Icon: AppleNotesIcon },
  "pdf-scan": { label: "PDF scan", color: "#e05a5a", Icon: PdfIcon },
  screenshot: { label: "Screenshot", color: "#3d6fff", Icon: ScreenshotIcon },
  handwritten: { label: "Handwritten", color: "#43b581", Icon: HandwrittenIcon },
  other: { label: "Upload", color: "#8a8f98", Icon: UploadIcon },
}
function SourceBadge({ source, showLabel = false }: { source: string | null; showLabel?: boolean }) {
  const m = SOURCE_META[source || "other"] || SOURCE_META.other
  const Icon = m.Icon
  return (
    <span title={m.label} style={{
      display: "inline-flex", alignItems: "center", gap: showLabel ? 5 : 0,
      padding: showLabel ? "2px 7px 2px 6px" : 2, borderRadius: 4, lineHeight: 1, flexShrink: 0,
      color: m.color, background: m.color + "22", border: "0.5px solid " + m.color + "55",
    }}>
      <Icon />
      {showLabel && <span style={{ fontSize: 10.5, fontWeight: 600, fontFamily: "var(--mono)", letterSpacing: "0.03em", textTransform: "uppercase" }}>{m.label}</span>}
    </span>
  )
}

const inp: React.CSSProperties = {
  width: "100%", padding: "5px 8px", fontSize: 12, fontFamily: "var(--mono)",
  background: "var(--color-background-primary)", color: "var(--text)",
  border: "0.5px solid var(--color-border-tertiary)", borderRadius: 4,
}
const lbl: React.CSSProperties = { fontSize: 10, color: "var(--muted)", fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2, display: "block" }
const ghostBtn: React.CSSProperties = { padding: "6px 11px", fontSize: 12, borderRadius: 6, cursor: "pointer", border: "0.5px solid var(--color-border-tertiary)", background: "transparent", color: "var(--muted)", fontFamily: "var(--sans)" }

// ── Upload dropzone ──
type Phase = { kind: "idle" | "drag" } | { kind: "uploading" | "analyzing"; name: string } | { kind: "done"; count: number } | { kind: "error"; msg: string }
function UploadDropzone({ onUploaded }: { onUploaded: () => void }) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" })
  const inputRef = useRef<HTMLInputElement>(null)
  const busy = phase.kind === "uploading" || phase.kind === "analyzing"

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length || busy) return
    const name = files.length === 1 ? files[0].name : `${files.length} files`
    try {
      setPhase({ kind: "uploading", name })
      const fd = new FormData(); Array.from(files).forEach((f) => fd.append("files", f))
      const r = await fetch("/api/notes-intake/upload", { method: "POST", body: fd })
      setPhase({ kind: "analyzing", name })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || "Upload failed")
      const errs = (d.errors || []).length
      setPhase({ kind: "done", count: d.created ?? 0 })
      onUploaded()
      setTimeout(() => setPhase({ kind: "idle" }), errs ? 4000 : 2500)
    } catch (e: any) { setPhase({ kind: "error", msg: e.message || "Upload failed" }) }
  }

  const active = phase.kind === "drag"
  const borderColor = phase.kind === "drag" ? "var(--accent)" : phase.kind === "error" ? "#e05a5a" : phase.kind === "done" ? "#43b581" : "var(--color-border-tertiary)"
  const bg = phase.kind === "drag" ? "rgba(61,111,255,0.08)" : phase.kind === "error" ? "rgba(224,90,90,0.06)" : phase.kind === "done" ? "rgba(67,181,129,0.06)" : "var(--color-background-primary)"

  return (
    <div style={{ margin: "0 0 16px" }}>
      <style>{`@keyframes ni-spin { to { transform: rotate(360deg) } }`}</style>
      <div className="ni-drop"
        onClick={() => !busy && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); if (!busy) setPhase({ kind: "drag" }) }}
        onDragLeave={(e) => { e.preventDefault(); if (phase.kind === "drag") setPhase({ kind: "idle" }) }}
        onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files) }}
        style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: "22px 20px", textAlign: "center", borderRadius: 8, cursor: busy ? "default" : "pointer", border: (active ? "1px solid " : "1px dashed ") + borderColor, background: bg, transition: "border-color .15s, background .15s" }}>
        {(phase.kind === "idle" || phase.kind === "drag") && (<>
          <span style={{ color: active ? "var(--accent)" : "var(--muted)" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
          </span>
          <div style={{ fontSize: 13, color: active ? "var(--accent)" : "var(--text)", fontWeight: 500 }}>{active ? "Drop to upload" : <>Drag notes here, or <span style={{ color: "var(--accent)" }}>browse</span></>}</div>
          <div style={{ fontSize: 10.5, color: "var(--muted)", fontFamily: "var(--mono)", letterSpacing: "0.03em" }}>Screenshots · handwritten notes · scanned configs · PNG · JPG · HEIC · PDF · TXT</div>
        </>)}
        {busy && (<>
          <span style={{ width: 22, height: 22, borderRadius: "50%", display: "inline-block", border: "2.5px solid var(--color-border-tertiary)", borderTopColor: "var(--accent)", animation: "ni-spin 0.7s linear infinite" }} />
          <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 500 }}>{phase.kind === "uploading" ? "Uploading…" : "Analyzing with AI…"}</div>
          <div style={{ fontSize: 10.5, color: "var(--muted)", fontFamily: "var(--mono)" }}>{phase.name}{phase.kind === "analyzing" ? " · extracting entities" : ""}</div>
        </>)}
        {phase.kind === "done" && (<>
          <span style={{ color: "#43b581" }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg></span>
          <div style={{ fontSize: 13, color: "#43b581", fontWeight: 500 }}>Added {phase.count} note{phase.count === 1 ? "" : "s"} — review below</div>
        </>)}
        {phase.kind === "error" && (<>
          <span style={{ color: "#e05a5a" }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg></span>
          <div style={{ fontSize: 13, color: "#e05a5a", fontWeight: 500 }}>{phase.msg}</div>
          <button onClick={(e) => { e.stopPropagation(); setPhase({ kind: "idle" }) }} style={{ ...ghostBtn, color: "var(--text)" }}>Try again</button>
        </>)}
      </div>
      <input ref={inputRef} type="file" multiple hidden accept="image/png,image/jpeg,image/heic,application/pdf,text/plain,.md,.txt" onChange={(e) => handleFiles(e.target.files)} />
    </div>
  )
}

// ── Detail panel ──
function DetailPanel({ suggestion, clients, onDone, toast }: { suggestion: Suggestion; clients: Client[]; onDone: (msg: string, keepSelected: boolean) => void; toast: (m: string) => void }) {
  const [draft, setDraft] = useState<Suggestion>(() => JSON.parse(JSON.stringify(suggestion)))
  const [busy, setBusy] = useState(false)
  const [matches, setMatches] = useState<Record<number, any>>({})

  // Duplicate detection: find existing DocHub records for the matched client so
  // the reviewer can Update instead of duplicating. Re-runs when the client changes.
  useEffect(() => {
    let alive = true
    ;(async () => {
      const r = await fetch(`/api/notes-intake/${draft.id}/matches`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: draft.matchedClientId, entities: draft.entitiesJson }) })
      const d = await r.json().catch(() => ({ matches: [] }))
      if (!alive) return
      const map: Record<number, any> = {}
      for (const m of (d.matches || [])) map[m.entityIndex] = m
      setMatches(map)
      setDraft((cur) => ({ ...cur, entitiesJson: (cur.entitiesJson || []).map((e: any, idx: number) => {
        const m = map[idx]
        if (!m) return e.mode === "skip" ? e : { ...e, mode: "create", targetId: undefined }
        if (e.mode === "skip") return e
        return { ...e, mode: m.strong ? "update" : "create", targetId: m.targetId }
      }) }))
    })()
    return () => { alive = false }
    // Intentionally only re-run on client/note change, not on every field edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.matchedClientId, draft.id])

  const clientById = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c.name])), [clients])
  const clientByName = useMemo(() => Object.fromEntries(clients.map((c) => [c.name.toLowerCase(), c.id])), [clients])

  function patchDraft(p: Partial<Suggestion>) { setDraft((d) => ({ ...d, ...p })) }
  function setEntity(idx: number, p: Partial<Entity>) { setDraft((d) => { const e = [...(d.entitiesJson || [])]; e[idx] = { ...e[idx], ...p }; return { ...d, entitiesJson: e } }) }
  function setEntityField(idx: number, key: string, val: string) { setDraft((d) => { const e = [...(d.entitiesJson || [])]; e[idx] = { ...e[idx], fields: { ...(e[idx].fields || {}), [key]: val } }; return { ...d, entitiesJson: e } }) }

  async function save() {
    setBusy(true)
    const corrected = draft.matchedClientId !== suggestion.matchedClientId
    const r = await fetch(`/api/notes-intake/${draft.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ matchedClientId: draft.matchedClientId, matchedClientName: draft.matchedClientName, clientCorrected: corrected, entities: draft.entitiesJson, sourceType: draft.sourceType }) })
    setBusy(false)
    if (r.ok) onDone("Saved" + (corrected ? " · learned folder → client" : ""), true); else toast("Save failed")
  }
  async function setStatus(status: string) {
    setBusy(true)
    const r = await fetch(`/api/notes-intake/${draft.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) })
    setBusy(false)
    if (r.ok) onDone(status === "REJECTED" ? "Rejected" : "Skipped", false)
  }
  async function commit() {
    if (!draft.matchedClientId) { toast("Pick a client first"); return }
    const active = (draft.entitiesJson || []).filter((e: Entity) => e.include !== false && e.mode !== "skip")
    const upd = active.filter((e: Entity) => e.mode === "update").length
    if (!confirm(`Push ${active.length} item(s) into ${draft.matchedClientName}?\n${upd ? `${upd} will UPDATE an existing record (non-destructive), the rest create new. ` : ""}Credentials are encrypted. The source note is kept unless you trash it.`)) return
    setBusy(true)
    const r = await fetch(`/api/notes-intake/${draft.id}/commit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: draft.matchedClientId, entities: draft.entitiesJson }) })
    const d = await r.json(); setBusy(false)
    if (r.ok) { const s = d.summary; onDone(`Pushed: ${s.credentials.length} new cred, ${s.assets.length} new asset, ${s.phoneExtensions.length} ext${s.updated?.length ? ` · ${s.updated.length} updated` : ""}${s.locationUpdated ? ", location" : ""}${s.skipped?.length ? ` · ${s.skipped.length} skipped` : ""}`, false) } else toast(d.error || "Commit failed")
  }
  function trashConfirmCopy(): string {
    if (draft.origin === "upload") return "Move this uploaded file to trash? Recoverable."
    if (draft.sourceType === "obsidian") return "Remove this note from your Obsidian vault?\nIt's committed to git (recoverable), and because the vault syncs to your iPad it will disappear there too."
    return "Remove the exported markdown copy on the server?\nThis does NOT touch the original in the Apple Notes app on your phone. Recoverable from trash."
  }
  async function trashSource() {
    if (!confirm(trashConfirmCopy())) return
    setBusy(true)
    const r = await fetch(`/api/notes-intake/${draft.id}/delete-source`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "trash" }) })
    const d = await r.json(); setBusy(false)
    if (r.ok) onDone(d.mode === "queued" ? "Source removal queued (runs shortly)" : "Source moved to trash", false); else toast(d.error || "Failed")
  }
  async function restoreSource() {
    setBusy(true)
    const r = await fetch(`/api/notes-intake/${draft.id}/delete-source`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "restore" }) })
    const d = await r.json(); setBusy(false)
    if (r.ok) onDone("Source restore " + (d.mode === "queued" ? "queued" : "done"), false); else toast(d.error || "Failed")
  }
  async function purge() {
    if (!confirm(`Purge "${draft.noteTitle}"?\nMarks it do-not-import AND removes the source file (recoverable from trash).\n\n${trashConfirmCopy()}`)) return
    setBusy(true)
    await fetch(`/api/notes-intake/${draft.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "PURGED" }) })
    const r = await fetch(`/api/notes-intake/${draft.id}/delete-source`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "trash" }) })
    setBusy(false)
    if (r.ok) onDone("Purged · source removal " + ((await r.json()).mode === "queued" ? "queued" : "done"), false); else toast("Purge failed")
  }

  // Source lifecycle line
  const srcLine = (() => {
    if (draft.sourceState === "TRASHED") return { text: `Source trashed${draft.sourceDeletedAt ? " " + new Date(draft.sourceDeletedAt).toLocaleDateString() : ""}`, action: <button onClick={restoreSource} disabled={busy} style={{ ...ghostBtn, padding: "3px 9px", color: "var(--accent)" }}>Restore</button> }
    if (draft.sourcePendingOp === "TRASH") return { text: "Source removal queued…", action: null }
    if (draft.sourcePendingOp === "RESTORE") return { text: "Source restore queued…", action: null }
    if (draft.sourceState === "GONE") return { text: "Source no longer on disk", action: null }
    return { text: "Source on disk", action: <button onClick={trashSource} disabled={busy} style={{ ...ghostBtn, padding: "3px 9px", color: "#e05a5a" }}>Trash source</button> }
  })()

  return (
    <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: 10, padding: 18, background: "var(--color-background-secondary)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 4 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text)" }}>{draft.noteTitle}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
            <SourceBadge source={draft.sourceType} showLabel />
            <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{draft.sourcePath}</span>
          </div>
        </div>
        {chip(draft.status, draft.status === "COMMITTED" ? "#43b581" : draft.status === "REJECTED" ? "#e05a5a" : draft.status === "PURGED" ? "#8a5a5a" : "#3d6fff")}
      </div>

      {/* source lifecycle */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "8px 0 12px", fontSize: 11, color: "var(--muted)", fontFamily: "var(--mono)" }}>
        <span>{srcLine.text}</span>{srcLine.action}
      </div>

      {draft.relevanceReason && <div style={{ fontSize: 11.5, color: "var(--muted)", margin: "0 0 12px", fontStyle: "italic" }}>{draft.relevanceReason}</div>}

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
            {draft.clientCandidatesJson.map((cid: string) => clientById[cid] ? (<button key={cid} onClick={() => patchDraft({ matchedClientId: cid, matchedClientName: clientById[cid] })} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, cursor: "pointer", border: "0.5px solid var(--color-border-tertiary)", background: "transparent", color: "var(--accent)" }}>{clientById[cid]}</button>) : null)}
          </div>
        )}
      </div>

      <div style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>{(draft.entitiesJson || []).length} extracted item(s)</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {(draft.entitiesJson || []).map((e: Entity, idx: number) => {
          const keys = Array.from(new Set([...(KIND_FIELDS[e.kind] || []), ...Object.keys(e.fields || {})]))
          const included = e.include !== false
          return (
            <div key={idx} style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: 8, padding: 10, opacity: included ? 1 : 0.5, background: "var(--color-background-primary)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <input type="checkbox" checked={included} onChange={(ev) => setEntity(idx, { include: ev.target.checked })} />
                {chip(e.kind.replace("_", " "), KIND_COLOR[e.kind] || "#888")}
                <input value={e.summary || ""} onChange={(ev) => setEntity(idx, { summary: ev.target.value })} style={{ ...inp, fontFamily: "var(--sans)", fontSize: 12.5, fontWeight: 500, border: "none", background: "transparent", padding: "2px 0" }} />
                <span style={{ fontSize: 10, color: confColor(e.confidence), fontFamily: "var(--mono)", flexShrink: 0 }}>{e.confidence != null ? Math.round(e.confidence * 100) + "%" : ""}</span>
              </div>
              {matches[idx] && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", margin: "0 0 8px", padding: "6px 8px", borderRadius: 6, background: matches[idx].strong ? "rgba(224,90,90,0.10)" : "rgba(224,164,88,0.10)", border: "0.5px solid " + (matches[idx].strong ? "#e05a5a55" : "#e0a45855") }}>
                  <span style={{ fontSize: 11, color: "var(--text)" }}>⚠ May already exist: <b>{matches[idx].targetLabel}</b> <span style={{ color: "var(--muted)" }}>· {matches[idx].reason}</span></span>
                  <div style={{ display: "flex", gap: 4 }}>
                    {([["update", "Update"], ["create", "New"], ["skip", "Skip"]] as const).map(([mode, labtxt]) => {
                      const on = (e.mode || "create") === mode
                      return <button key={mode} onClick={() => setEntity(idx, mode === "update" ? { mode, targetId: matches[idx].targetId } : { mode, targetId: undefined })} style={{ fontSize: 10.5, padding: "3px 9px", borderRadius: 4, cursor: "pointer", fontFamily: "var(--mono)", border: "0.5px solid var(--color-border-tertiary)", background: on ? "var(--accent)" : "transparent", color: on ? "#fff" : "var(--muted)" }}>{labtxt}</button>
                    })}
                  </div>
                </div>
              )}
              <div className="ni-fields" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, opacity: e.mode === "skip" ? 0.45 : 1 }}>
                {keys.map((k) => (<div key={k}><label style={lbl}>{k}</label><input value={(e.fields?.[k] as string) || ""} onChange={(ev) => setEntityField(idx, k, ev.target.value)} style={inp} /></div>))}
              </div>
              {e.sourceSnippet && (<details style={{ marginTop: 8 }}><summary style={{ fontSize: 10.5, color: "var(--muted)", cursor: "pointer", fontFamily: "var(--mono)" }}>source snippet</summary><pre style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "pre-wrap", marginTop: 4, fontFamily: "var(--mono)" }}>{e.sourceSnippet}</pre></details>)}
            </div>
          )
        })}
      </div>

      {draft.committedSummaryJson && (<pre style={{ fontSize: 11, color: "#43b581", marginTop: 12, fontFamily: "var(--mono)", whiteSpace: "pre-wrap" }}>{JSON.stringify(draft.committedSummaryJson, null, 2)}</pre>)}

      <details style={{ marginTop: 12 }}><summary style={{ fontSize: 11, color: "var(--muted)", cursor: "pointer", fontFamily: "var(--mono)" }}>original note</summary><pre style={{ fontSize: 11.5, color: "var(--text)", whiteSpace: "pre-wrap", marginTop: 6, fontFamily: "var(--mono)", background: "var(--color-background-primary)", padding: 10, borderRadius: 6 }}>{draft.rawText}</pre></details>

      {draft.status !== "COMMITTED" && draft.status !== "PURGED" && (
        <div style={{ display: "flex", gap: 8, marginTop: 16, borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: 14, flexWrap: "wrap" }}>
          <button onClick={commit} disabled={busy} style={{ padding: "8px 16px", fontSize: 12.5, fontWeight: 600, borderRadius: 6, border: "none", cursor: "pointer", background: "var(--accent)", color: "#fff" }}>Confirm &amp; Push →</button>
          <button onClick={save} disabled={busy} style={{ ...ghostBtn, color: "var(--text)", padding: "8px 14px", fontSize: 12.5 }}>Save edits</button>
          <div style={{ flex: 1 }} />
          <button onClick={() => setStatus("SKIPPED")} disabled={busy} style={{ ...ghostBtn, padding: "8px 12px" }}>Skip</button>
          <button onClick={() => setStatus("REJECTED")} disabled={busy} style={{ ...ghostBtn, padding: "8px 12px", color: "#e05a5a" }}>Reject</button>
          <button onClick={purge} disabled={busy} style={{ padding: "8px 12px", fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: "pointer", border: "0.5px solid #e05a5a", background: "rgba(224,90,90,0.08)", color: "#e05a5a", fontFamily: "var(--sans)" }}>Purge</button>
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
  const [srcFilter, setSrcFilter] = useState<string | null>(null)
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)
  const [uploadOpen, setUploadOpen] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const r = await fetch(`/api/notes-intake?status=${tab}`)
      const d = await r.json()
      if (!alive) return
      setItems(d.suggestions || []); setClients(d.clients || []); setCounts(d.counts || {}); setLoading(false)
    })()
    return () => { alive = false }
  }, [tab, reloadKey])

  const sel = useMemo(() => items.find((i) => i.id === selId) || null, [items, selId])
  const srcTypes = useMemo(() => [...new Set(items.map((i) => i.sourceType || "other"))], [items])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = items
    if (srcFilter) list = list.filter((i) => (i.sourceType || "other") === srcFilter)
    if (q) list = list.filter((i) => (i.noteTitle + " " + (i.sourceFolder || "") + " " + (i.matchedClientName || "")).toLowerCase().includes(q))
    return list
  }, [items, search, srcFilter])

  const groups = useMemo(() => {
    const m = new Map<string, Suggestion[]>()
    for (const i of filtered) { const k = i.matchedClientName || "— unmatched —"; if (!m.has(k)) m.set(k, []); m.get(k)!.push(i) }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [filtered])

  function onDone(msg: string, keepSelected: boolean) { setToastMsg(msg); if (!keepSelected) setSelId(null); setLoading(true); setReloadKey((k) => k + 1) }

  return (
    <AppShell>
      <style>{`@media (max-width: 720px) {
        .ni-grid { grid-template-columns: 1fr !important; }
        .ni-list { max-height: none !important; }
        .ni-fields { grid-template-columns: 1fr !important; }
        .ni-tabs { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .ni-drop { padding: 28px 16px !important; }
      }`}</style>
      <div style={{ padding: "20px 24px", maxWidth: 1400, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 4, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--text)" }}>Notes Intake</h1>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>AI-matched notes → DocHub. Review, correct, push.</span>
          </div>
          <button onClick={() => setUploadOpen((o) => !o)} style={{ display: "inline-flex", alignItems: "center", gap: 6, alignSelf: "center", padding: "6px 12px", fontSize: 12, fontWeight: 500, fontFamily: "var(--sans)", borderRadius: 6, cursor: "pointer", color: uploadOpen ? "var(--accent)" : "var(--text)", background: uploadOpen ? "rgba(61,111,255,0.10)" : "transparent", border: "0.5px solid " + (uploadOpen ? "var(--accent)" : "var(--color-border-tertiary)") }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Upload notes
          </button>
        </div>

        <div className="ni-tabs" style={{ display: "flex", gap: 6, margin: "14px 0" }}>
          {TABS.map((t) => (<button key={t} onClick={() => { setTab(t); setSelId(null); setLoading(true) }} style={{ padding: "5px 12px", fontSize: 12, borderRadius: 6, cursor: "pointer", fontFamily: "var(--mono)", letterSpacing: "0.03em", border: "0.5px solid var(--color-border-tertiary)", background: tab === t ? "rgba(61,111,255,0.14)" : "transparent", color: tab === t ? "var(--text)" : "var(--muted)", whiteSpace: "nowrap" }}>{t}{counts[t] != null ? ` ${counts[t]}` : ""}</button>))}
        </div>

        {uploadOpen && <UploadDropzone onUploaded={() => { setUploadOpen(true); setLoading(true); setReloadKey((k) => k + 1) }} />}

        <div className="ni-grid" style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 18, alignItems: "start" }}>
          <div>
            <input placeholder="Filter notes / clients…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...inp, marginBottom: 8, fontFamily: "var(--sans)" }} />
            {srcTypes.length > 1 && (
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 10 }}>
                {srcTypes.map((st) => { const m = SOURCE_META[st] || SOURCE_META.other; const on = srcFilter === st; return (
                  <button key={st} onClick={() => setSrcFilter(on ? null : st)} title={m.label} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 7px", borderRadius: 4, cursor: "pointer", fontSize: 10, fontFamily: "var(--mono)", color: m.color, background: on ? m.color + "33" : "transparent", border: "0.5px solid " + m.color + (on ? "aa" : "44") }}>
                    <m.Icon />{m.label}
                  </button>) })}
              </div>
            )}
            <div className="ni-list" style={{ maxHeight: "70vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
              {loading && <div style={{ color: "var(--muted)", fontSize: 13 }}>Loading…</div>}
              {!loading && groups.length === 0 && <div style={{ color: "var(--muted)", fontSize: 13 }}>No notes in “{tab}”.</div>}
              {groups.map(([cname, list]) => (
                <div key={cname}>
                  <div style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>{cname} · {list.length}</div>
                  {list.map((i) => {
                    const ents = (i.entitiesJson || []).length
                    const trashed = i.sourceState === "TRASHED" || i.sourceState === "GONE"
                    return (
                      <div key={i.id} onClick={() => setSelId(i.id)} style={{ padding: "8px 10px", borderRadius: 6, cursor: "pointer", marginBottom: 4, border: "0.5px solid " + (selId === i.id ? "var(--accent)" : "var(--color-border-tertiary)"), background: selId === i.id ? "rgba(61,111,255,0.08)" : "var(--color-background-secondary)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                          <span style={{ opacity: trashed ? 0.4 : 1 }}><SourceBadge source={i.sourceType} /></span>
                          <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: "var(--text)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: trashed ? "line-through" : "none" }}>{i.noteTitle}</span>
                          <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: confColor(i.clientConfidence), flexShrink: 0 }}>{i.clientConfidence != null ? Math.round(i.clientConfidence * 100) + "%" : ""}</span>
                        </div>
                        <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 2 }}>{i.sourceFolder} · {ents} item{ents === 1 ? "" : "s"}{i.sourcePendingOp ? " · queued" : ""}</div>
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

      {toastMsg && (<div onClick={() => setToastMsg(null)} style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", background: "var(--text)", color: "var(--color-background-primary)", padding: "10px 18px", borderRadius: 8, fontSize: 13, cursor: "pointer", zIndex: 100, fontFamily: "var(--sans)" }}>{toastMsg}</div>)}
    </AppShell>
  )
}
