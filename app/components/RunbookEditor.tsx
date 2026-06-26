"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { marked } from "marked"

const PRESET_COLORS = ["#6366f1", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"]

const inp = { width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }
const lbl: React.CSSProperties = { fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }

type Step = { id?: string; title: string; notes: string }

type Props = {
  initial?: any  // existing runbook for edit mode
  clientId?: string  // pre-scoped client
}

export default function RunbookEditor({ initial, clientId: preClientId }: Props) {
  const router = useRouter()
  const isEdit = !!initial

  const [title, setTitle] = useState(initial?.title ?? "")
  const [summary, setSummary] = useState(initial?.summary ?? "")
  const [content, setContent] = useState(initial?.content ?? "")
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "")
  const [clientId, setClientId] = useState(initial?.clientId ?? preClientId ?? "")
  const [contentTab, setContentTab] = useState<"write" | "preview">("write")

  const [steps, setSteps] = useState<Step[]>(
    initial?.steps?.map((s: any) => ({ id: s.id, title: s.title, notes: s.notes ?? "" })) ?? []
  )

  // Tags
  const [allTags, setAllTags] = useState<{ id: string; name: string }[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(
    initial?.tags?.map((t: any) => t.tagId) ?? []
  )
  const [tagInput, setTagInput] = useState("")

  // Categories
  const [categories, setCategories] = useState<any[]>([])
  const [showNewCat, setShowNewCat] = useState(false)
  const [newCatName, setNewCatName] = useState("")
  const [newCatColor, setNewCatColor] = useState(PRESET_COLORS[0])
  const [savingCat, setSavingCat] = useState(false)

  // Clients
  const [clients, setClients] = useState<{ id: string; name: string }[]>([])

  const [saving, setSaving] = useState(false)
  const [drafting, setDrafting] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch("/api/runbook-categories").then(r => r.json()),
      fetch("/api/runbook-tags").then(r => r.json()),
      fetch("/api/clients").then(r => r.json()),
    ]).then(([cats, tgs, cls]) => {
      setCategories(Array.isArray(cats) ? cats : [])
      setAllTags(Array.isArray(tgs) ? tgs : [])
      setClients(Array.isArray(cls) ? cls.map((c: any) => ({ id: c.id, name: c.name })) : [])
    })
  }, [])

  // ── Tag management ──────────────────────────────────────────────────────────

  async function addTag(name: string) {
    const trimmed = name.trim().toLowerCase()
    if (!trimmed) return
    let tag = allTags.find(t => t.name === trimmed)
    if (!tag) {
      const res = await fetch("/api/runbook-tags", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      })
      tag = await res.json()
      setAllTags(t => [...t, tag!])
    }
    if (!selectedTagIds.includes(tag!.id)) setSelectedTagIds(ids => [...ids, tag!.id])
    setTagInput("")
  }

  function removeTag(tagId: string) {
    setSelectedTagIds(ids => ids.filter(id => id !== tagId))
  }

  // ── Category management ─────────────────────────────────────────────────────

  async function createCategory() {
    if (!newCatName.trim()) return
    setSavingCat(true)
    try {
      const res = await fetch("/api/runbook-categories", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCatName.trim(), color: newCatColor }),
      })
      const cat = await res.json()
      setCategories(c => [...c, cat])
      setCategoryId(cat.id)
      setShowNewCat(false)
      setNewCatName("")
    } finally { setSavingCat(false) }
  }

  // ── Steps ───────────────────────────────────────────────────────────────────

  function addStep() { setSteps(s => [...s, { title: "", notes: "" }]) }
  function updateStep(i: number, field: keyof Step, val: string) {
    setSteps(s => s.map((step, idx) => idx === i ? { ...step, [field]: val } : step))
  }
  function removeStep(i: number) { setSteps(s => s.filter((_, idx) => idx !== i)) }
  function moveStep(i: number, dir: -1 | 1) {
    setSteps(s => {
      const next = [...s]
      const target = i + dir
      if (target < 0 || target >= next.length) return next
      ;[next[i], next[target]] = [next[target], next[i]]
      return next
    })
  }

  // ── Save ────────────────────────────────────────────────────────────────────

  async function draftWithAI() {
    if (!title.trim()) return alert("Add a title first — the AI drafts from it.")
    if ((content.trim() || steps.length > 0) && !confirm("Replace the current content and checklist with an AI draft?")) return
    setDrafting(true)
    try {
      const res = await fetch("/api/runbooks/draft", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, prompt: summary }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || "AI draft failed"); return }
      if (data.summary && !summary.trim()) setSummary(data.summary)
      if (typeof data.content === "string") setContent(data.content)
      if (Array.isArray(data.steps)) setSteps(data.steps.map((s: any) => ({ title: s.title ?? "", notes: s.notes ?? "" })))
      setContentTab("preview")
    } finally { setDrafting(false) }
  }

  async function save() {
    if (!title.trim()) return alert("Title is required")
    setSaving(true)
    try {
      const payload = { title, summary, content, categoryId: categoryId || null, clientId: clientId || null, tagIds: selectedTagIds, steps }
      const res = await fetch(isEdit ? `/api/runbooks/${initial.id}` : "/api/runbooks", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const rb = await res.json()
        router.push(`/runbooks/${rb.id}`)
      }
    } finally { setSaving(false) }
  }

  const selectedTags = allTags.filter(t => selectedTagIds.includes(t.id))

  return (
    <div style={{ maxWidth: "820px" }}>
      {/* Title */}
      <div style={{ marginBottom: "20px" }}>
        <label style={lbl}>Title *</label>
        <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. New workstation setup" style={{ ...inp, fontSize: "18px", fontWeight: 500 }} />
      </div>

      {/* Draft with AI */}
      <div style={{ marginBottom: "20px", display: "flex", alignItems: "center", gap: "10px" }}>
        <button onClick={draftWithAI} disabled={drafting} style={{ fontSize: "13px", padding: "8px 14px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: drafting ? "not-allowed" : "pointer", color: "var(--color-text-secondary)", opacity: drafting ? 0.7 : 1 }}>
          {drafting ? "Drafting..." : "Draft with AI"}
        </button>
        <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>Generates the summary, markdown content and checklist steps from the title.</span>
      </div>

      {/* Summary */}
      <div style={{ marginBottom: "20px" }}>
        <label style={lbl}>Summary <span style={{ color: "var(--color-text-muted)", fontSize: "12px" }}>(one-liner shown on list)</span></label>
        <input value={summary} onChange={e => setSummary(e.target.value)} placeholder="Brief description of what this SOP covers" style={inp} />
      </div>

      {/* Category + Client row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>
        <div>
          <label style={lbl}>Category</label>
          {showNewCat ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <input autoFocus value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="Category name" style={inp} onKeyDown={e => e.key === "Enter" && createCategory()} />
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {PRESET_COLORS.map(c => (
                  <button key={c} onClick={() => setNewCatColor(c)} style={{ width: "22px", height: "22px", borderRadius: "50%", background: c, border: newCatColor === c ? "2px solid var(--color-text-primary)" : "2px solid transparent", cursor: "pointer", padding: 0 }} />
                ))}
              </div>
              <div style={{ display: "flex", gap: "6px" }}>
                <button onClick={createCategory} disabled={savingCat} style={{ fontSize: "12px", padding: "5px 12px", borderRadius: "6px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>Save</button>
                <button onClick={() => setShowNewCat(false)} style={{ fontSize: "12px", padding: "5px 10px", borderRadius: "6px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>Cancel</button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: "8px" }}>
              <select value={categoryId} onChange={e => setCategoryId(e.target.value)} style={{ ...inp, flex: 1 }}>
                <option value="">No category</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button onClick={() => setShowNewCat(true)} style={{ fontSize: "12px", padding: "8px 10px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>+ New</button>
            </div>
          )}
        </div>
        <div>
          <label style={lbl}>Client <span style={{ color: "var(--color-text-muted)", fontSize: "12px" }}>(leave blank for global)</span></label>
          <select value={clientId} onChange={e => setClientId(e.target.value)} style={inp}>
            <option value="">Global (MSP SOP)</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {/* Tags */}
      <div style={{ marginBottom: "20px" }}>
        <label style={lbl}>Tags</label>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "8px" }}>
          {selectedTags.map(t => (
            <span key={t.id} style={{ fontSize: "12px", padding: "3px 8px", borderRadius: "6px", background: "var(--color-background-hover)", color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: "4px" }}>
              #{t.name}
              <button onClick={() => removeTag(t.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)", padding: 0, lineHeight: 1, fontSize: "13px" }}>×</button>
            </span>
          ))}
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(tagInput) } }}
            placeholder="Type a tag and press Enter"
            list="tag-suggestions"
            style={{ ...inp, flex: 1 }}
          />
          <datalist id="tag-suggestions">
            {allTags.filter(t => !selectedTagIds.includes(t.id)).map(t => <option key={t.id} value={t.name} />)}
          </datalist>
          <button onClick={() => addTag(tagInput)} style={{ fontSize: "13px", padding: "8px 12px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>Add</button>
        </div>
      </div>

      {/* Content — Write / Preview tabs */}
      <div style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", gap: "0", marginBottom: "0", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
          <label style={lbl}>Content <span style={{ color: "var(--color-text-muted)", fontSize: "12px" }}>(markdown)</span></label>
          <div style={{ marginLeft: "auto", display: "flex", gap: "0" }}>
            {(["write", "preview"] as const).map(tab => (
              <button key={tab} onClick={() => setContentTab(tab)} style={{ fontSize: "12px", padding: "4px 12px", border: "none", background: "transparent", cursor: "pointer", color: contentTab === tab ? "var(--color-text-primary)" : "var(--color-text-muted)", fontWeight: contentTab === tab ? 600 : 400, borderBottom: contentTab === tab ? "2px solid var(--color-text-primary)" : "2px solid transparent", marginBottom: "-1px" }}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>
        {contentTab === "write" ? (
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder={`# Heading\n\nWrite your procedure here using markdown.\n\n- Bullet points\n- **Bold text**\n- \`code blocks\``}
            rows={16}
            style={{ ...inp, fontFamily: "monospace", fontSize: "13px", resize: "vertical", lineHeight: 1.6, marginTop: "8px" }}
          />
        ) : (
          <div
            className="markdown-body"
            style={{ marginTop: "8px", padding: "16px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", minHeight: "200px", fontSize: "14px", lineHeight: 1.7, color: "var(--color-text-primary)" }}
            dangerouslySetInnerHTML={{ __html: content ? marked(content) as string : '<span style="color:var(--color-text-muted)">Nothing to preview yet.</span>' }}
          />
        )}
      </div>

      {/* Steps */}
      <div style={{ marginBottom: "32px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <label style={{ ...lbl, marginBottom: 0 }}>Checklist steps <span style={{ color: "var(--color-text-muted)", fontSize: "12px" }}>(optional — for step-by-step jobs)</span></label>
          <button onClick={addStep} style={{ fontSize: "12px", padding: "5px 12px", borderRadius: "6px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>+ Add step</button>
        </div>
        {steps.length === 0 ? (
          <div style={{ fontSize: "13px", color: "var(--color-text-muted)", padding: "12px 0" }}>No steps yet — add them above for a tick-off checklist.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {steps.map((step, i) => (
              <div key={i} style={{ display: "flex", gap: "8px", alignItems: "flex-start", background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "8px", padding: "10px 12px" }}>
                <div style={{ fontSize: "13px", color: "var(--color-text-muted)", fontWeight: 500, minWidth: "24px", paddingTop: "2px" }}>{i + 1}.</div>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
                  <input value={step.title} onChange={e => updateStep(i, "title", e.target.value)} placeholder="Step title" style={{ ...inp, fontSize: "13px" }} />
                  <input value={step.notes} onChange={e => updateStep(i, "notes", e.target.value)} placeholder="Notes (optional)" style={{ ...inp, fontSize: "12px", color: "var(--color-text-secondary)" }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <button onClick={() => moveStep(i, -1)} disabled={i === 0} style={{ fontSize: "12px", padding: "2px 6px", borderRadius: "4px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: i === 0 ? "default" : "pointer", color: i === 0 ? "var(--color-text-muted)" : "var(--color-text-secondary)" }}>↑</button>
                  <button onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1} style={{ fontSize: "12px", padding: "2px 6px", borderRadius: "4px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: i === steps.length - 1 ? "default" : "pointer", color: i === steps.length - 1 ? "var(--color-text-muted)" : "var(--color-text-secondary)" }}>↓</button>
                  <button onClick={() => removeStep(i)} style={{ fontSize: "12px", padding: "2px 6px", borderRadius: "4px", border: "none", background: "transparent", cursor: "pointer", color: "var(--color-text-danger)" }}>×</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: "8px" }}>
        <button onClick={save} disabled={saving} style={{ fontSize: "14px", fontWeight: 500, padding: "10px 24px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}>
          {saving ? "Saving..." : isEdit ? "Save changes" : "Create SOP"}
        </button>
        <button onClick={() => router.back()} style={{ fontSize: "14px", padding: "10px 16px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>Cancel</button>
      </div>
    </div>
  )
}
