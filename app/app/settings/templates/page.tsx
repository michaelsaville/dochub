"use client"

import AppShell from "@/components/AppShell"
import Sheet from "@/components/Sheet"
import DataCards, { type DataColumn } from "@/components/DataCards"
import { useSession } from "next-auth/react"
import { useEffect, useState } from "react"
import { marked } from "marked"

const PRESET_COLORS = ["#3d6fff", "#6366f1", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"]

type Category = { id: string; name: string; color: string; order: number }
type Step = { title: string; notes: string }
type Template = {
  id: string
  kind: "DOCUMENT" | "RUNBOOK"
  name: string
  description: string | null
  categoryId: string | null
  category: Category | null
  titleTemplate: string | null
  summary: string | null
  content: string | null
  stepsJson: unknown
  tagNames: string[]
  defaultCategoryName: string | null
  isSeed: boolean
  isArchived: boolean
  isPublished: boolean
  usageCount: number
}

type Form = {
  id?: string
  kind: "DOCUMENT" | "RUNBOOK"
  name: string
  description: string
  categoryId: string
  titleTemplate: string
  defaultCategoryName: string
  summary: string
  content: string
  steps: Step[]
  tags: string[]
  isPublished: boolean
}

const emptyForm = (kind: "DOCUMENT" | "RUNBOOK"): Form => ({
  kind, name: "", description: "", categoryId: "", titleTemplate: "", defaultCategoryName: "",
  summary: "", content: "", steps: [], tags: [], isPublished: true,
})

function coerceSteps(json: unknown): Step[] {
  if (!Array.isArray(json)) return []
  return json.map((s: any) => ({ title: s?.title ?? "", notes: s?.notes ?? "" })).filter((s) => s.title)
}

export default function TemplateManagerPage() {
  const { data: session, status } = useSession()
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "ADMIN"

  const [templates, setTemplates] = useState<Template[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [reseeding, setReseeding] = useState(false)

  const [editorOpen, setEditorOpen] = useState(false)
  const [form, setForm] = useState<Form>(emptyForm("RUNBOOK"))
  const [saving, setSaving] = useState(false)
  const [contentTab, setContentTab] = useState<"write" | "preview">("write")
  const [tagInput, setTagInput] = useState("")

  // Category manager
  const [newCatName, setNewCatName] = useState("")
  const [newCatColor, setNewCatColor] = useState(PRESET_COLORS[0])

  async function load() {
    setLoading(true)
    const [tpls, cats] = await Promise.all([
      fetch("/api/templates?includeArchived=true").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/template-categories").then((r) => (r.ok ? r.json() : [])),
    ])
    setTemplates(Array.isArray(tpls) ? tpls : [])
    setCategories(Array.isArray(cats) ? cats : [])
    setLoading(false)
  }

  useEffect(() => { if (isAdmin) load() }, [isAdmin])

  function openCreate(kind: "DOCUMENT" | "RUNBOOK") {
    setForm(emptyForm(kind))
    setContentTab("write")
    setEditorOpen(true)
  }
  function openEdit(t: Template) {
    setForm({
      id: t.id, kind: t.kind, name: t.name, description: t.description ?? "",
      categoryId: t.categoryId ?? "", titleTemplate: t.titleTemplate ?? "",
      defaultCategoryName: t.defaultCategoryName ?? "", summary: t.summary ?? "",
      content: t.content ?? "", steps: coerceSteps(t.stepsJson), tags: t.tagNames ?? [],
      isPublished: t.isPublished,
    })
    setContentTab("write")
    setEditorOpen(true)
  }

  async function save() {
    if (!form.name.trim()) { alert("Name is required"); return }
    setSaving(true)
    try {
      const payload: any = {
        name: form.name,
        description: form.description || null,
        categoryId: form.categoryId || null,
        titleTemplate: form.titleTemplate || null,
        defaultCategoryName: form.defaultCategoryName || null,
        content: form.content || null,
        isPublished: form.isPublished,
      }
      if (form.kind === "RUNBOOK") {
        payload.summary = form.summary || null
        payload.stepsJson = form.steps.filter((s) => s.title.trim()).map((s) => ({ title: s.title, notes: s.notes || null }))
        payload.tagNames = form.tags
      }
      const res = form.id
        ? await fetch(`/api/templates/${form.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch("/api/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, kind: form.kind }) })
      if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error || "Save failed"); return }
      setEditorOpen(false)
      await load()
    } finally { setSaving(false) }
  }

  async function toggleArchive(t: Template) {
    await fetch(`/api/templates/${t.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isArchived: !t.isArchived }) })
    await load()
  }
  async function removeTemplate(t: Template) {
    if (!confirm(t.isSeed ? `Archive the seed template "${t.name}"? (Re-seed can restore it.)` : `Permanently delete "${t.name}"?`)) return
    await fetch(`/api/templates/${t.id}`, { method: "DELETE" })
    await load()
  }
  async function reseed() {
    if (!confirm("Re-seed the starter library? Missing templates are created and archived seeds restored; your edits are preserved.")) return
    setReseeding(true)
    try {
      const res = await fetch("/api/templates/reseed", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ force: false }) })
      const d = await res.json()
      if (res.ok) alert(`Seeded: ${d.created} created, ${d.restored} restored, ${d.total} total.`)
      else alert(d.error || "Re-seed failed")
      await load()
    } finally { setReseeding(false) }
  }

  async function addCategory() {
    if (!newCatName.trim()) return
    const res = await fetch("/api/template-categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newCatName.trim(), color: newCatColor, order: categories.length }) })
    if (res.ok) { setNewCatName(""); await load() }
    else { const d = await res.json().catch(() => ({})); alert(d.error || "Failed") }
  }
  async function deleteCategory(id: string) {
    if (!confirm("Delete this category? Templates in it become uncategorized.")) return
    await fetch(`/api/template-categories/${id}`, { method: "DELETE" })
    await load()
  }

  // ── Guards ───────────────────────────────────────────────────────────────
  if (status === "loading") return <AppShell><div style={{ padding: 32, color: "var(--muted)" }}>Loading…</div></AppShell>
  if (!isAdmin) return <AppShell><div style={{ padding: 32 }}><div className="state-box"><span>Template management is available to administrators only.</span></div></div></AppShell>

  const columns: DataColumn<Template>[] = [
    { key: "name", label: "Name", primary: true, render: (t) => (
      <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 600 }}>{t.name}</span>
        {t.isSeed && <span style={{ fontSize: 10, color: "var(--muted)", border: "1px solid var(--border)", borderRadius: 3, padding: "1px 5px" }}>seed</span>}
        {t.isArchived && <span className="badge-warn">archived</span>}
        {!t.isPublished && !t.isArchived && <span className="badge-warn">unpublished</span>}
      </span>
    ) },
    { key: "kind", label: "Kind", render: (t) => t.kind === "RUNBOOK" ? "📋 SOP" : "📄 Doc" },
    { key: "category", label: "Category", render: (t) => t.category
      ? <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: t.category.color + "22", color: t.category.color, border: `1px solid ${t.category.color}44` }}>{t.category.name}</span>
      : <span style={{ color: "var(--muted)" }}>—</span> },
    { key: "usageCount", label: "Used", render: (t) => `${t.usageCount}×` },
    { key: "actions", label: "Actions", render: (t) => (
      <span style={{ display: "flex", gap: 10 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(t)}>Edit</button>
        <button className="btn btn-ghost btn-sm" onClick={() => toggleArchive(t)}>{t.isArchived ? "Unarchive" : "Archive"}</button>
        <button className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={() => removeTemplate(t)}>{t.isSeed ? "Archive" : "Delete"}</button>
      </span>
    ) },
  ]

  return (
    <AppShell>
      <div style={{ padding: "32px", maxWidth: "1000px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: "20px" }}>
          <div>
            <div style={{ fontSize: "20px", fontWeight: 600, color: "var(--text)" }}>Template Library</div>
            <div style={{ fontSize: "13px", color: "var(--muted)", marginTop: "2px" }}>Manage document + SOP templates and categories.</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-secondary" onClick={reseed} disabled={reseeding}>{reseeding ? "Seeding…" : "Re-seed starter library"}</button>
            <button className="btn btn-secondary" onClick={() => openCreate("DOCUMENT")}>+ Document</button>
            <button className="btn btn-primary" onClick={() => openCreate("RUNBOOK")}>+ SOP</button>
          </div>
        </div>

        {/* Categories */}
        <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "16px 18px", marginBottom: "24px", background: "var(--surface)" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 10 }}>Categories</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {categories.length === 0 && <span style={{ fontSize: 12, color: "var(--muted)" }}>No categories yet.</span>}
            {categories.map((c) => (
              <span key={c.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, padding: "3px 8px", borderRadius: 8, background: c.color + "22", color: c.color, border: `1px solid ${c.color}44` }}>
                {c.name}
                <button onClick={() => deleteCategory(c.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 0, lineHeight: 1, fontSize: 14 }}>×</button>
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input value={newCatName} onChange={(e) => setNewCatName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCategory()} placeholder="New category name" className="filter-input" style={{ width: 200 }} />
            <div style={{ display: "flex", gap: 6 }}>
              {PRESET_COLORS.map((c) => (
                <button key={c} onClick={() => setNewCatColor(c)} style={{ width: 22, height: 22, borderRadius: "50%", background: c, border: newCatColor === c ? "2px solid var(--text)" : "2px solid transparent", cursor: "pointer", padding: 0 }} />
              ))}
            </div>
            <button className="btn btn-secondary btn-sm" style={{ minHeight: 36 }} onClick={addCategory}>Add</button>
          </div>
        </div>

        {/* Templates table */}
        {loading ? (
          <div className="state-box"><span>Loading…</span></div>
        ) : (
          <DataCards columns={columns} rows={templates} rowKey={(t) => t.id} />
        )}
      </div>

      {/* Editor */}
      {editorOpen && (
        <Sheet
          open
          onClose={() => setEditorOpen(false)}
          title={form.id ? "Edit template" : form.kind === "RUNBOOK" ? "New SOP template" : "New document template"}
          maxWidth={720}
          footer={
            <>
              <label style={{ display: "flex", alignItems: "center", gap: 6, marginRight: "auto", fontSize: 12, color: "var(--muted)" }}>
                <input type="checkbox" checked={form.isPublished} onChange={(e) => setForm((f) => ({ ...f, isPublished: e.target.checked }))} />
                Published
              </label>
              <button className="btn btn-ghost" onClick={() => setEditorOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
            </>
          }
        >
          <div className="field">
            <label>Name *</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. New Client Onboarding" />
          </div>
          <div className="field">
            <label>Description</label>
            <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="One-line summary shown on the picker card" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="field">
              <label>Category (library)</label>
              <select value={form.categoryId} onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}>
                <option value="">No category</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Applied category</label>
              <input value={form.defaultCategoryName} onChange={(e) => setForm((f) => ({ ...f, defaultCategoryName: e.target.value }))} placeholder="Stamped on the created record" />
            </div>
          </div>
          <div className="field">
            <label>Title template</label>
            <input value={form.titleTemplate} onChange={(e) => setForm((f) => ({ ...f, titleTemplate: e.target.value }))} placeholder="e.g. {{client.name}} — Onboarding" />
          </div>

          <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 14, lineHeight: 1.6 }}>
            Placeholders resolved on create: <code>{"{{client.name}}"}</code>, <code>{"{{date}}"}</code>, <code>{"{{tech.name}}"}</code>.
          </div>

          {form.kind === "RUNBOOK" && (
            <div className="field">
              <label>Summary</label>
              <input value={form.summary} onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))} placeholder="One-liner shown on the SOP list" />
            </div>
          )}

          {/* Content markdown */}
          <div className="field">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label style={{ marginBottom: 0 }}>Content (markdown)</label>
              <div style={{ display: "flex" }}>
                {(["write", "preview"] as const).map((tab) => (
                  <button key={tab} onClick={() => setContentTab(tab)} style={{ fontSize: 12, padding: "2px 10px", border: "none", background: "transparent", cursor: "pointer", color: contentTab === tab ? "var(--text)" : "var(--muted)", fontWeight: contentTab === tab ? 600 : 400 }}>
                    {tab[0].toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            {contentTab === "write" ? (
              <textarea value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} rows={12} placeholder="# Heading&#10;&#10;Write the template body in markdown." style={{ fontFamily: "var(--mono)", fontSize: 13, lineHeight: 1.6, resize: "vertical" }} />
            ) : (
              <div className="markdown-body" style={{ padding: 14, border: "1px solid var(--border)", borderRadius: 8, minHeight: 160, fontSize: 14, lineHeight: 1.7 }} dangerouslySetInnerHTML={{ __html: form.content ? (marked(form.content) as string) : '<span style="color:var(--muted)">Nothing to preview.</span>' }} />
            )}
          </div>

          {form.kind === "RUNBOOK" && (
            <>
              {/* Tags */}
              <div className="field">
                <label>Tags</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                  {form.tags.map((t) => (
                    <span key={t} style={{ fontSize: 12, padding: "3px 8px", borderRadius: 6, background: "var(--card)", color: "var(--muted)", display: "flex", alignItems: "center", gap: 4 }}>
                      #{t}
                      <button onClick={() => setForm((f) => ({ ...f, tags: f.tags.filter((x) => x !== t) }))} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 0, lineHeight: 1 }}>×</button>
                    </span>
                  ))}
                </div>
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault()
                      const v = tagInput.trim().toLowerCase()
                      if (v && !form.tags.includes(v)) setForm((f) => ({ ...f, tags: [...f.tags, v] }))
                      setTagInput("")
                    }
                  }}
                  placeholder="Type a tag and press Enter"
                />
              </div>

              {/* Steps */}
              <div className="field">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label style={{ marginBottom: 0 }}>Checklist steps</label>
                  <button className="btn btn-ghost btn-sm" onClick={() => setForm((f) => ({ ...f, steps: [...f.steps, { title: "", notes: "" }] }))}>+ Add step</button>
                </div>
                {form.steps.length === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--muted)", padding: "8px 0" }}>No steps — add them for a tick-off checklist.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                    {form.steps.map((s, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}>
                        <span style={{ fontSize: 12, color: "var(--muted)", paddingTop: 8, minWidth: 20 }}>{i + 1}.</span>
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                          <input value={s.title} onChange={(e) => setForm((f) => ({ ...f, steps: f.steps.map((x, idx) => idx === i ? { ...x, title: e.target.value } : x) }))} placeholder="Step title" style={{ fontSize: 13 }} />
                          <input value={s.notes} onChange={(e) => setForm((f) => ({ ...f, steps: f.steps.map((x, idx) => idx === i ? { ...x, notes: e.target.value } : x) }))} placeholder="Notes (optional)" style={{ fontSize: 12 }} />
                        </div>
                        <button className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={() => setForm((f) => ({ ...f, steps: f.steps.filter((_, idx) => idx !== i) }))}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </Sheet>
      )}
    </AppShell>
  )
}
