"use client"

import AppShell from "@/components/AppShell"
import TemplatePicker from "@/components/TemplatePicker"
import { useEffect, useMemo, useState } from "react"

type TemplateCategory = { id: string; name: string; color: string }
type Template = {
  id: string
  kind: "DOCUMENT" | "RUNBOOK"
  name: string
  description: string | null
  category: TemplateCategory | null
  usageCount: number
}

export default function TemplatesGalleryPage() {
  const [kind, setKind] = useState<"DOCUMENT" | "RUNBOOK">("RUNBOOK")
  const [templates, setTemplates] = useState<Template[]>([])
  const [categories, setCategories] = useState<TemplateCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filterCat, setFilterCat] = useState<string>("")
  const [picking, setPicking] = useState<Template | null>(null)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch(`/api/templates?kind=${kind}`).then((r) => (r.ok ? r.json() : [])),
      fetch("/api/template-categories").then((r) => (r.ok ? r.json() : [])),
    ]).then(([tpls, cats]) => {
      setTemplates(Array.isArray(tpls) ? tpls : [])
      setCategories(Array.isArray(cats) ? cats : [])
    }).finally(() => setLoading(false))
  }, [kind])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return templates.filter((t) => {
      if (filterCat && t.category?.id !== filterCat) return false
      if (q && !t.name.toLowerCase().includes(q) && !(t.description ?? "").toLowerCase().includes(q)) return false
      return true
    })
  }, [templates, search, filterCat])

  return (
    <AppShell>
      <div style={{ padding: "32px", maxWidth: "1000px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: "20px" }}>
          <div>
            <div style={{ fontSize: "20px", fontWeight: 600, color: "var(--text)" }}>Templates</div>
            <div style={{ fontSize: "13px", color: "var(--muted)", marginTop: "2px" }}>
              Reusable starting points for documents and SOPs.
            </div>
          </div>
          <a href="/settings/templates" className="btn btn-secondary">Manage</a>
        </div>

        {/* Kind toggle */}
        <div className="pcc-snap-row" style={{ display: "flex", gap: 8, marginBottom: "16px", overflowX: "auto" }}>
          {([["RUNBOOK", "SOPs"], ["DOCUMENT", "Documents"]] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => { setKind(k); setFilterCat("") }}
              className={kind === k ? "btn btn-primary" : "btn btn-secondary"}
              style={{ whiteSpace: "nowrap" }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Search + category chips */}
        <div style={{ display: "flex", gap: 10, marginBottom: "14px", flexWrap: "wrap" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates…"
            className="filter-input"
            style={{ flex: "1 1 220px", minWidth: 160 }}
          />
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: "20px", flexWrap: "wrap" }}>
          <button
            onClick={() => setFilterCat("")}
            style={chip(!filterCat, "var(--accent)")}
          >All</button>
          {categories.map((c) => (
            <button key={c.id} onClick={() => setFilterCat(c.id)} style={chip(filterCat === c.id, c.color)}>
              {c.name}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="state-box"><span>Loading…</span></div>
        ) : filtered.length === 0 ? (
          <div className="state-box">
            <span>{templates.length === 0 ? "No templates yet — seed the starter library from Manage." : "No templates match your filters."}</span>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "14px" }}>
            {filtered.map((t) => (
              <div
                key={t.id}
                style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "16px 18px", background: "var(--surface)", display: "flex", flexDirection: "column", gap: 8 }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 16 }}>{t.kind === "RUNBOOK" ? "📋" : "📄"}</span>
                  <span style={{ fontSize: "15px", fontWeight: 600, color: "var(--text)", flex: 1, minWidth: 0 }}>{t.name}</span>
                </div>
                {t.category && (
                  <span style={{ alignSelf: "flex-start", fontSize: 11, padding: "2px 8px", borderRadius: 10, background: t.category.color + "22", color: t.category.color, fontWeight: 500, border: `1px solid ${t.category.color}44` }}>
                    {t.category.name}
                  </span>
                )}
                {t.description && (
                  <div style={{ fontSize: "13px", color: "var(--muted)", lineHeight: 1.55, flex: 1 }}>{t.description}</div>
                )}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 4 }}>
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>{t.usageCount > 0 ? `used ${t.usageCount}×` : "not used yet"}</span>
                  <button className="btn btn-primary btn-sm" style={{ minHeight: 36 }} onClick={() => setPicking(t)}>Use template</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {picking && (
        <TemplatePicker
          kind={picking.kind}
          preselected={picking}
          onClose={() => setPicking(null)}
        />
      )}
    </AppShell>
  )
}

function chip(active: boolean, color: string): React.CSSProperties {
  return {
    fontSize: 12,
    padding: "5px 12px",
    borderRadius: 999,
    cursor: "pointer",
    whiteSpace: "nowrap",
    background: active ? color + "22" : "transparent",
    color: active ? color : "var(--muted)",
    border: `1px solid ${active ? color + "66" : "var(--border)"}`,
    fontWeight: active ? 600 : 400,
  }
}
