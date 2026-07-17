"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Sheet from "@/components/Sheet"

// =============================================================================
// TemplatePicker — the "start from a template" gallery. Mounts inside <Sheet>,
// so it is a bottom-sheet on phones and a centered modal on desktop.
//
// Flow: browse a category-grouped card grid -> pick one -> choose the target
// (client for DOCUMENT; optional client / Global for RUNBOOK) -> instantiate.
// On success it either hands the result back via onInstantiated (so a host like
// the documents panel can refresh in place) or navigates to the created record.
// =============================================================================

export type InstantiateResult = {
  id: string
  kind: "DOCUMENT" | "RUNBOOK"
  clientId: string | null
  redirect: string
}

type TemplateCategory = { id: string; name: string; color: string }
type Template = {
  id: string
  kind: "DOCUMENT" | "RUNBOOK"
  name: string
  description: string | null
  category: TemplateCategory | null
  usageCount: number
}

type Props = {
  kind: "DOCUMENT" | "RUNBOOK"
  /** Locks the target client (e.g. opened from a client's documents panel). */
  clientId?: string
  /** Jump straight to the confirm step for this template (e.g. from the gallery). */
  preselected?: Template
  onClose: () => void
  /** If provided, called with the result instead of navigating away. */
  onInstantiated?: (result: InstantiateResult) => void
}

export default function TemplatePicker({ kind, clientId, preselected, onClose, onInstantiated }: Props) {
  const router = useRouter()
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(!preselected)
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<Template | null>(preselected ?? null)

  // Target selection
  const needsClientChoice = !clientId // gallery-style entry; panel entry locks it
  const [clients, setClients] = useState<{ id: string; name: string }[]>([])
  const [targetClientId, setTargetClientId] = useState<string>(clientId ?? "")
  const [creating, setCreating] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Load the browse list (skip when we jumped straight to a preselected template).
  useEffect(() => {
    if (preselected) return
    let cancelled = false
    setLoading(true)
    fetch(`/api/templates?kind=${kind}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => { if (!cancelled) setTemplates(Array.isArray(data) ? data : []) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [kind, preselected])

  // Load clients only when the user must choose one.
  useEffect(() => {
    if (!needsClientChoice) return
    fetch("/api/clients")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setClients(Array.isArray(data) ? data.map((c: any) => ({ id: c.id, name: c.name })) : []))
      .catch(() => {})
  }, [needsClientChoice])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return templates
    return templates.filter(
      (t) => t.name.toLowerCase().includes(q) || (t.description ?? "").toLowerCase().includes(q)
    )
  }, [templates, search])

  const grouped = useMemo(() => {
    const map = new Map<string, { cat: TemplateCategory | null; items: Template[] }>()
    for (const t of filtered) {
      const key = t.category?.id ?? "__uncat__"
      if (!map.has(key)) map.set(key, { cat: t.category, items: [] })
      map.get(key)!.items.push(t)
    }
    return Array.from(map.values())
  }, [filtered])

  async function instantiate() {
    if (!selected) return
    if (kind === "DOCUMENT" && !targetClientId) { setErr("Choose a client for this document."); return }
    setCreating(true)
    setErr(null)
    try {
      const res = await fetch(`/api/templates/${selected.id}/instantiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: targetClientId || null }),
      })
      const data = await res.json()
      if (!res.ok) { setErr(data?.error || "Could not create from template."); return }
      if (onInstantiated) onInstantiated(data as InstantiateResult)
      else router.push(data.redirect)
      onClose()
    } catch {
      setErr("Could not create from template.")
    } finally {
      setCreating(false)
    }
  }

  const title = selected
    ? "Create from template"
    : kind === "DOCUMENT" ? "Start a document from a template" : "Start an SOP from a template"

  // ── Footer action bar ──────────────────────────────────────────────────────
  const footer = selected ? (
    <>
      {!preselected && (
        <button type="button" className="btn btn-secondary" onClick={() => { setSelected(null); setErr(null) }} style={{ marginRight: "auto" }}>
          ← Back
        </button>
      )}
      <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
      <button type="button" className="btn btn-primary" onClick={instantiate} disabled={creating}>
        {creating ? "Creating…" : "Create from template"}
      </button>
    </>
  ) : (
    <button type="button" className="btn btn-ghost" onClick={onClose}>Close</button>
  )

  return (
    <Sheet open onClose={onClose} title={title} footer={footer}>
      {selected ? (
        // ── Confirm / target step ─────────────────────────────────────────────
        <div>
          <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "var(--space-4)", background: "var(--card)", marginBottom: "var(--space-4)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: "var(--text-lg)", fontWeight: 600, color: "var(--text)" }}>{selected.name}</span>
              {selected.category && (
                <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: selected.category.color + "22", color: selected.category.color, fontWeight: 500, border: `1px solid ${selected.category.color}44` }}>
                  {selected.category.name}
                </span>
              )}
            </div>
            {selected.description && (
              <div style={{ fontSize: "var(--text-sm)", color: "var(--muted)", marginTop: 6 }}>{selected.description}</div>
            )}
          </div>

          {needsClientChoice ? (
            <div className="field">
              <label>{kind === "DOCUMENT" ? "Client (required)" : "Client (optional — leave as Global)"}</label>
              <select value={targetClientId} onChange={(e) => setTargetClientId(e.target.value)}>
                <option value="">{kind === "DOCUMENT" ? "— Select a client —" : "Global (MSP SOP)"}</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          ) : (
            <div style={{ fontSize: "var(--text-sm)", color: "var(--muted)", marginBottom: "var(--space-3)" }}>
              A new {kind === "DOCUMENT" ? "document" : "SOP"} will be created and opened for editing.
            </div>
          )}

          <div style={{ fontSize: "var(--text-xs)", color: "var(--muted)", lineHeight: 1.6 }}>
            Placeholders resolved on create: <code>{"{{client.name}}"}</code>, <code>{"{{date}}"}</code>, <code>{"{{tech.name}}"}</code>.
            The copy is fully independent — editing it never changes the template.
          </div>

          {err && <div style={{ marginTop: "var(--space-3)", color: "var(--danger)", fontSize: "var(--text-sm)" }}>{err}</div>}
        </div>
      ) : (
        // ── Browse step ───────────────────────────────────────────────────────
        <div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates…"
            className="filter-input"
            style={{ width: "100%", marginBottom: "var(--space-4)" }}
          />
          {loading ? (
            <div className="state-box"><span>Loading templates…</span></div>
          ) : filtered.length === 0 ? (
            <div className="state-box"><span>No templates yet. Seed the starter library from Settings → Templates.</span></div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
              {grouped.map((g, gi) => (
                <div key={g.cat?.id ?? `uncat-${gi}`}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "var(--space-3)" }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: g.cat?.color ?? "var(--muted)" }} />
                    <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--text)" }}>{g.cat?.name ?? "Uncategorized"}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "var(--space-3)" }}>
                    {g.items.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => { setSelected(t); setErr(null) }}
                        style={{
                          textAlign: "left",
                          border: "1px solid var(--border)",
                          borderRadius: 10,
                          padding: "var(--space-3) var(--space-4)",
                          background: "var(--surface)",
                          cursor: "pointer",
                          minHeight: 44,
                          display: "flex",
                          flexDirection: "column",
                          gap: 4,
                        }}
                      >
                        <span style={{ fontSize: "var(--text-base)", fontWeight: 600, color: "var(--text)" }}>{t.name}</span>
                        {t.description && (
                          <span style={{ fontSize: "var(--text-xs)", color: "var(--muted)", lineHeight: 1.5 }}>{t.description}</span>
                        )}
                        {t.usageCount > 0 && (
                          <span style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>used {t.usageCount}×</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Sheet>
  )
}
