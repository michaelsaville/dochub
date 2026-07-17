"use client"

import React, { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import AppShell from "@/components/AppShell"
import {
  type FlexField,
  type FlexLayout,
  type FlexLayoutSummary,
  type FieldType,
  FIELD_TYPES,
  RELATION_TARGETS,
  typeNeedsOptions,
  toKey,
  uniqueKey,
} from "@/components/flex/types"

// =============================================================================
// Settings → Flexible Assets — the layout DESIGNER (admin only).
//
// Create layouts (name/icon/color/description) and build their ordered field
// schema: add / reorder / remove typed fields with required · show-in-list ·
// use-for-title flags, dropdown options, relation targets, hints, and date
// expiry. Machine keys auto-derive from the label and lock once the field is
// persisted (immutable-key rule). Saves via PUT /api/flex-layouts/[id]/fields.
// =============================================================================

type DesignerField = FlexField & { _uid: string; _persisted: boolean }

let uidSeq = 0
function newUid(): string {
  uidSeq += 1
  return `f${Date.now().toString(36)}_${uidSeq}`
}

const EMOJI_CHOICES = ["📄", "🔒", "🌐", "📧", "🛡️", "💳", "🔑", "🖨️", "📶", "🗄️", "☁️", "📞", "🧾", "🏢"]

export default function FlexDesignerPage(): React.ReactElement {
  const { data: session } = useSession()
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "ADMIN"

  const [layouts, setLayouts] = useState<FlexLayoutSummary[]>([])
  const [seeding, setSeeding] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<FlexLayout | null>(null)
  const [fields, setFields] = useState<DesignerField[]>([])
  const [meta, setMeta] = useState({ name: "", icon: "📄", color: "#3d6fff", description: "", showInNav: true })
  const [savingFields, setSavingFields] = useState(false)
  const [savingMeta, setSavingMeta] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  // New-layout form
  const [showNew, setShowNew] = useState(false)
  const [newForm, setNewForm] = useState({ name: "", icon: "📄", color: "#3d6fff", description: "" })
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (isAdmin) loadLayouts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin])

  async function loadLayouts() {
    const d = await fetch("/api/flex-layouts").then(r => (r.ok ? r.json() : [])).catch(() => [])
    setLayouts(Array.isArray(d) ? d : [])
  }

  async function selectLayout(idIn: string) {
    setSelectedId(idIn)
    setShowNew(false)
    setMsg(null)
    const d: FlexLayout | null = await fetch(`/api/flex-layouts/${idIn}`)
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null)
    if (!d) return
    setDetail(d)
    setMeta({
      name: d.name,
      icon: d.icon || "📄",
      color: d.color || "#3d6fff",
      description: d.description ?? "",
      showInNav: (d as { showInNav?: boolean }).showInNav ?? true,
    })
    setFields(
      [...(d.fields ?? [])]
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map(f => ({ ...f, _uid: newUid(), _persisted: true })),
    )
  }

  async function seedStarters() {
    setSeeding(true)
    try {
      const res = await fetch("/api/admin/seed-flex-layouts", { method: "POST" })
      if (res.ok) await loadLayouts()
    } finally { setSeeding(false) }
  }

  async function createLayout() {
    if (!newForm.name.trim()) return
    setCreating(true)
    try {
      const res = await fetch("/api/flex-layouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newForm),
      })
      if (res.ok) {
        const created = await res.json()
        setNewForm({ name: "", icon: "📄", color: "#3d6fff", description: "" })
        await loadLayouts()
        if (created?.id) selectLayout(created.id)
      } else {
        const j = await res.json().catch(() => ({}))
        setMsg(j.error ?? "Failed to create layout")
      }
    } finally {
      setCreating(false)
    }
  }

  async function saveMeta() {
    if (!selectedId) return
    setSavingMeta(true)
    setMsg(null)
    try {
      const res = await fetch(`/api/flex-layouts/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(meta),
      })
      if (res.ok) {
        setMsg("Layout details saved.")
        loadLayouts()
      } else {
        setMsg("Failed to save layout details.")
      }
    } finally {
      setSavingMeta(false)
    }
  }

  async function deleteLayout() {
    if (!selectedId) return
    if (!confirm("Archive this layout? Existing records are hidden but not destroyed.")) return
    const res = await fetch(`/api/flex-layouts/${selectedId}`, { method: "DELETE" })
    if (res.ok) {
      setSelectedId(null)
      setDetail(null)
      setFields([])
      loadLayouts()
    } else {
      const j = await res.json().catch(() => ({}))
      setMsg(j.error ?? "Could not archive (records may still exist).")
    }
  }

  // ── field ops ─────────────────────────────────────────────────────────────
  function takenKeys(exceptUid?: string): Set<string> {
    return new Set(fields.filter(f => f._uid !== exceptUid).map(f => f.key))
  }

  function addField(type: FieldType) {
    const label = type === "header" ? "Section" : "New field"
    const key = uniqueKey(toKey(label), takenKeys())
    setFields(prev => [
      ...prev,
      {
        _uid: newUid(),
        _persisted: false,
        key,
        label,
        type,
        required: false,
        showInList: false,
        useForTitle: false,
        hint: "",
        position: prev.length,
        options: [],
        relationTarget: type === "relation" ? "Person" : null,
        expires: false,
      },
    ])
  }

  function patchField(uid: string, patch: Partial<DesignerField>) {
    setFields(prev => prev.map(f => (f._uid === uid ? { ...f, ...patch } : f)))
  }

  function changeLabel(uid: string, label: string) {
    setFields(prev =>
      prev.map(f => {
        if (f._uid !== uid) return f
        // Keys auto-track the label only until the field is persisted.
        if (f._persisted) return { ...f, label }
        const key = uniqueKey(toKey(label), new Set(prev.filter(x => x._uid !== uid).map(x => x.key)))
        return { ...f, label, key }
      }),
    )
  }

  function removeField(uid: string) {
    setFields(prev => prev.filter(f => f._uid !== uid))
  }

  function move(uid: string, dir: -1 | 1) {
    setFields(prev => {
      const i = prev.findIndex(f => f._uid === uid)
      const j = i + dir
      if (i < 0 || j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  async function saveFields() {
    if (!selectedId) return
    // guard: no empty labels
    if (fields.some(f => !f.label.trim())) {
      setMsg("Every field needs a label.")
      return
    }
    setSavingFields(true)
    setMsg(null)
    try {
      const payload = {
        fields: fields.map((f, i) => ({
          key: f.key,
          label: f.label.trim(),
          type: f.type,
          required: !!f.required,
          showInList: !!f.showInList,
          useForTitle: !!f.useForTitle,
          hint: f.hint || null,
          position: i,
          options: f.options ?? [],
          relationTarget: f.type === "relation" ? f.relationTarget ?? "Person" : null,
          expires: f.type === "date" ? !!f.expires : false,
        })),
      }
      const res = await fetch(`/api/flex-layouts/${selectedId}/fields`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        setMsg("Field schema saved.")
        loadLayouts()
        selectLayout(selectedId)
      } else {
        const j = await res.json().catch(() => ({}))
        setMsg(j.error ?? "Failed to save fields.")
      }
    } finally {
      setSavingFields(false)
    }
  }

  if (!isAdmin) {
    return (
      <AppShell>
        <div className="state-box" style={{ padding: "var(--space-12)" }}>
          <span>🔒 The layout designer is restricted to administrators.</span>
          <a href="/flex" className="btn btn-secondary">
            View Flexible Assets
          </a>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div style={{ padding: "var(--space-8)", maxWidth: 1100, margin: "0 auto" }}>
        <h1 style={{ marginBottom: 4 }}>Flexible Asset Layouts</h1>
        <p style={{ fontSize: "var(--text-base)", color: "var(--muted)", marginBottom: "var(--space-4)" }}>
          Define your own documentation types with custom field schemas.
        </p>

        {/* Disambiguation */}
        <div
          style={{
            marginBottom: "var(--space-6)",
            padding: "12px 14px",
            borderRadius: 10,
            background: "var(--accent-subtle)",
            border: "1px solid var(--border)",
            fontSize: "var(--text-sm)",
            color: "var(--text)",
            lineHeight: 1.5,
          }}
        >
          For hardware & network gear (computers, switches, firewalls, cameras) use{" "}
          <a href="/settings?section=asset-types" style={{ color: "var(--accent)" }}>
            Asset Types
          </a>
          . For everything else — SSL certs, applications, vendors of record, email/DNS, warranties — use Flexible Assets.
        </div>

        <div style={{ display: "flex", gap: "var(--space-6)", alignItems: "flex-start", flexWrap: "wrap" }}>
          {/* ── Left: layout list ── */}
          <div style={{ width: 220, flexShrink: 0, minWidth: 200 }}>
            <button
              className="btn btn-primary"
              style={{ width: "100%", marginBottom: "var(--space-3)" }}
              onClick={() => {
                setShowNew(true)
                setSelectedId(null)
                setDetail(null)
              }}
            >
              + New layout
            </button>
            <button
              className="btn btn-secondary btn-sm"
              style={{ width: "100%", marginBottom: "var(--space-3)" }}
              onClick={seedStarters}
              disabled={seeding}
              title="Install SSL Certificate, LOB Application, Email/DNS, Warranty, and Wireless starter layouts"
            >
              {seeding ? "Seeding…" : "Seed 5 starter layouts"}
            </button>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {layouts.map(l => (
                <button
                  key={l.id}
                  onClick={() => selectLayout(l.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    textAlign: "left",
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid",
                    borderColor: selectedId === l.id ? "var(--accent)" : "var(--border)",
                    background: selectedId === l.id ? "var(--accent-subtle)" : "var(--card)",
                    color: "var(--text)",
                    cursor: "pointer",
                    minHeight: 44,
                  }}
                >
                  <span style={{ fontSize: 18 }}>{l.icon || "📄"}</span>
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {l.name}
                  </span>
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--muted)" }}>{l.fieldCount}</span>
                </button>
              ))}
              {layouts.length === 0 && (
                <div style={{ fontSize: "var(--text-sm)", color: "var(--muted)", padding: "8px 0" }}>No layouts yet.</div>
              )}
            </div>
          </div>

          {/* ── Right: editor ── */}
          <div style={{ flex: 1, minWidth: 280 }}>
            {msg && (
              <div
                style={{
                  marginBottom: "var(--space-4)",
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  fontSize: "var(--text-sm)",
                  color: "var(--text)",
                }}
              >
                {msg}
              </div>
            )}

            {showNew ? (
              <NewLayoutCard
                form={newForm}
                setForm={setNewForm}
                creating={creating}
                onCreate={createLayout}
                onCancel={() => setShowNew(false)}
              />
            ) : !detail ? (
              <div className="state-box">
                <span>Select a layout to edit, or create a new one.</span>
              </div>
            ) : (
              <>
                {/* Meta */}
                <div style={cardStyle}>
                  <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", alignItems: "flex-end" }}>
                    <div style={{ flex: "1 1 180px" }}>
                      <div className="field" style={{ margin: 0 }}>
                        <label>Name</label>
                        <input value={meta.name} onChange={e => setMeta(m => ({ ...m, name: e.target.value }))} />
                      </div>
                    </div>
                    <div style={{ width: 120 }}>
                      <div className="field" style={{ margin: 0 }}>
                        <label>Icon</label>
                        <input value={meta.icon} onChange={e => setMeta(m => ({ ...m, icon: e.target.value }))} maxLength={4} />
                      </div>
                    </div>
                    <div style={{ width: 92 }}>
                      <div className="field" style={{ margin: 0 }}>
                        <label>Color</label>
                        <input
                          type="color"
                          value={meta.color}
                          onChange={e => setMeta(m => ({ ...m, color: e.target.value }))}
                          style={{ padding: 2, height: 40 }}
                        />
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                    {EMOJI_CHOICES.map(e => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => setMeta(m => ({ ...m, icon: e }))}
                        style={{
                          fontSize: 18,
                          width: 34,
                          height: 34,
                          borderRadius: 8,
                          border: `1px solid ${meta.icon === e ? "var(--accent)" : "var(--border)"}`,
                          background: meta.icon === e ? "var(--accent-subtle)" : "var(--card)",
                          cursor: "pointer",
                        }}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                  <div className="field" style={{ marginTop: 12, marginBottom: 8 }}>
                    <label>Description</label>
                    <input
                      value={meta.description}
                      onChange={e => setMeta(m => ({ ...m, description: e.target.value }))}
                      placeholder="What is this layout for?"
                    />
                  </div>
                  <label style={checkRow}>
                    <input type="checkbox" checked={meta.showInNav} onChange={e => setMeta(m => ({ ...m, showInNav: e.target.checked }))} />
                    Show in the Flexible Assets hub
                  </label>
                  <div style={{ display: "flex", gap: "var(--space-2)", marginTop: 12, flexWrap: "wrap" }}>
                    <button className="btn btn-primary" onClick={saveMeta} disabled={savingMeta}>
                      {savingMeta ? "Saving…" : "Save details"}
                    </button>
                    <a href={`/flex/${detail.slug ?? ""}`} className="btn btn-secondary">
                      View records ↗
                    </a>
                    <button className="btn btn-danger" onClick={deleteLayout} style={{ marginLeft: "auto" }}>
                      Archive layout
                    </button>
                  </div>
                </div>

                {/* Fields */}
                <div style={{ ...cardStyle, marginTop: "var(--space-4)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-3)" }}>
                    <div style={{ fontSize: "var(--text-lg)", fontWeight: 600 }}>Fields</div>
                    <span style={{ fontSize: "var(--text-xs)", color: "var(--muted)" }}>{fields.length} total</span>
                  </div>

                  {fields.length === 0 && (
                    <div style={{ fontSize: "var(--text-sm)", color: "var(--muted)", marginBottom: 12 }}>
                      No fields yet. Add one below.
                    </div>
                  )}

                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                    {fields.map((f, i) => (
                      <FieldRow
                        key={f._uid}
                        field={f}
                        index={i}
                        total={fields.length}
                        layouts={layouts}
                        selfLayoutId={selectedId}
                        onLabel={changeLabel}
                        onPatch={patchField}
                        onRemove={removeField}
                        onMove={move}
                      />
                    ))}
                  </div>

                  {/* Add field */}
                  <div style={{ marginTop: "var(--space-4)", borderTop: "1px solid var(--border)", paddingTop: "var(--space-4)" }}>
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Add a field
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {FIELD_TYPES.map(t => (
                        <button
                          key={t.value}
                          type="button"
                          className="btn btn-secondary btn-sm"
                          title={t.help}
                          onClick={() => addField(t.value)}
                        >
                          + {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginTop: "var(--space-5)", display: "flex", gap: "var(--space-2)" }}>
                    <button className="btn btn-primary" onClick={saveFields} disabled={savingFields}>
                      {savingFields ? "Saving…" : "Save field schema"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  )
}

// ── styles ───────────────────────────────────────────────────────────────────
const cardStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: "var(--space-5)",
}
const checkRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: "var(--text-sm)",
  color: "var(--text)",
  cursor: "pointer",
  minHeight: 32,
}

// ── new-layout card ──────────────────────────────────────────────────────────
function NewLayoutCard({
  form,
  setForm,
  creating,
  onCreate,
  onCancel,
}: {
  form: { name: string; icon: string; color: string; description: string }
  setForm: React.Dispatch<React.SetStateAction<{ name: string; icon: string; color: string; description: string }>>
  creating: boolean
  onCreate: () => void
  onCancel: () => void
}): React.ReactElement {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: "var(--text-lg)", fontWeight: 600, marginBottom: "var(--space-4)" }}>New layout</div>
      <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 200px" }}>
          <div className="field" style={{ margin: 0 }}>
            <label>Name *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. SSL Certificate" autoFocus />
          </div>
        </div>
        <div style={{ width: 110 }}>
          <div className="field" style={{ margin: 0 }}>
            <label>Icon</label>
            <input value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))} maxLength={4} />
          </div>
        </div>
        <div style={{ width: 92 }}>
          <div className="field" style={{ margin: 0 }}>
            <label>Color</label>
            <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} style={{ padding: 2, height: 40 }} />
          </div>
        </div>
      </div>
      <div className="field" style={{ marginTop: 12 }}>
        <label>Description</label>
        <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional" />
      </div>
      <div style={{ display: "flex", gap: "var(--space-2)" }}>
        <button className="btn btn-primary" onClick={onCreate} disabled={creating || !form.name.trim()}>
          {creating ? "Creating…" : "Create layout"}
        </button>
        <button className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── single field editor row ──────────────────────────────────────────────────
function FieldRow({
  field,
  index,
  total,
  layouts,
  selfLayoutId,
  onLabel,
  onPatch,
  onRemove,
  onMove,
}: {
  field: DesignerField
  index: number
  total: number
  layouts: FlexLayoutSummary[]
  selfLayoutId: string | null
  onLabel: (uid: string, label: string) => void
  onPatch: (uid: string, patch: Partial<DesignerField>) => void
  onRemove: (uid: string) => void
  onMove: (uid: string, dir: -1 | 1) => void
}): React.ReactElement {
  const isHeader = field.type === "header"
  const flag: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: "var(--text-sm)",
    color: "var(--text)",
    cursor: "pointer",
  }
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderLeft: isHeader ? "3px solid var(--accent)" : "1px solid var(--border)",
        borderRadius: 10,
        padding: "var(--space-3)",
        background: "var(--card)",
      }}
    >
      <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-start" }}>
        {/* reorder */}
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <button type="button" className="btn btn-ghost btn-sm" disabled={index === 0} onClick={() => onMove(field._uid, -1)} title="Move up" style={{ padding: "2px 6px" }}>
            ↑
          </button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={index === total - 1} onClick={() => onMove(field._uid, 1)} title="Move down" style={{ padding: "2px 6px" }}>
            ↓
          </button>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: "1 1 160px" }}>
              <div className="field" style={{ margin: 0 }}>
                <label>{isHeader ? "Section title" : "Label"}</label>
                <input value={field.label} onChange={e => onLabel(field._uid, e.target.value)} />
              </div>
            </div>
            <div style={{ width: 150 }}>
              <div className="field" style={{ margin: 0 }}>
                <label>Type</label>
                <select value={field.type} onChange={e => onPatch(field._uid, { type: e.target.value as FieldType })}>
                  {FIELD_TYPES.map(t => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {!isHeader && (
            <div style={{ fontSize: "var(--text-xs)", color: "var(--muted)", marginTop: 4 }}>
              key:{" "}
              <code style={{ fontFamily: "var(--mono)" }}>{field.key}</code>
              {field._persisted && <span title="Locked once the field exists"> · locked</span>}
            </div>
          )}

          {/* options for select/multiselect */}
          {typeNeedsOptions(field.type) && (
            <div className="field" style={{ marginTop: 10, marginBottom: 0 }}>
              <label>Options (one per line)</label>
              <textarea
                rows={3}
                value={(field.options ?? []).join("\n")}
                onChange={e =>
                  onPatch(field._uid, {
                    options: e.target.value.split("\n").map(s => s.trim()).filter(Boolean),
                  })
                }
                placeholder={"Option A\nOption B"}
                style={{ resize: "vertical" }}
              />
            </div>
          )}

          {/* relation target */}
          {field.type === "relation" && (
            <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginTop: 10 }}>
              <div className="field" style={{ margin: 0, flex: "1 1 160px" }}>
                <label>Links to</label>
                <select
                  value={(field.relationTarget ?? "Person").startsWith("FlexLayout:") ? "FlexAsset" : field.relationTarget ?? "Person"}
                  onChange={e => onPatch(field._uid, { relationTarget: e.target.value })}
                >
                  {RELATION_TARGETS.map(t => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              {(field.relationTarget === "FlexAsset" || (field.relationTarget ?? "").startsWith("FlexLayout:")) && (
                <div className="field" style={{ margin: 0, flex: "1 1 160px" }}>
                  <label>Scope to layout</label>
                  <select
                    value={(field.relationTarget ?? "").startsWith("FlexLayout:") ? field.relationTarget!.slice("FlexLayout:".length) : ""}
                    onChange={e => onPatch(field._uid, { relationTarget: e.target.value ? `FlexLayout:${e.target.value}` : "FlexAsset" })}
                  >
                    <option value="">Any flexible asset</option>
                    {layouts
                      .filter(l => l.id !== selfLayoutId)
                      .map(l => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* hint */}
          {!isHeader && (
            <div className="field" style={{ marginTop: 10, marginBottom: 0 }}>
              <label>Help text</label>
              <input value={field.hint ?? ""} onChange={e => onPatch(field._uid, { hint: e.target.value })} placeholder="Optional hint shown under the field" />
            </div>
          )}
          {isHeader && (
            <div className="field" style={{ marginTop: 10, marginBottom: 0 }}>
              <label>Sub-text</label>
              <input value={field.hint ?? ""} onChange={e => onPatch(field._uid, { hint: e.target.value })} placeholder="Optional" />
            </div>
          )}

          {/* flags */}
          {!isHeader && (
            <div style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap", marginTop: 12 }}>
              <label style={flag}>
                <input type="checkbox" checked={!!field.required} onChange={e => onPatch(field._uid, { required: e.target.checked })} />
                Required
              </label>
              <label style={flag}>
                <input type="checkbox" checked={!!field.showInList} onChange={e => onPatch(field._uid, { showInList: e.target.checked })} />
                Show in list
              </label>
              <label style={flag}>
                <input type="checkbox" checked={!!field.useForTitle} onChange={e => onPatch(field._uid, { useForTitle: e.target.checked })} />
                Use for title
              </label>
              {field.type === "date" && (
                <label style={flag}>
                  <input type="checkbox" checked={!!field.expires} onChange={e => onPatch(field._uid, { expires: e.target.checked })} />
                  Expiry alerts
                </label>
              )}
            </div>
          )}
        </div>

        {/* remove */}
        <button
          type="button"
          onClick={() => onRemove(field._uid)}
          title="Remove field"
          style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 4, flexShrink: 0 }}
        >
          ×
        </button>
      </div>
    </div>
  )
}
