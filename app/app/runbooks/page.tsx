"use client"

import AppShell from "@/components/AppShell"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"

export default function RunbooksPage() {
  const router = useRouter()
  const [runbooks, setRunbooks] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [tags, setTags] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filterCategory, setFilterCategory] = useState("")
  const [filterTag, setFilterTag] = useState("")
  const [filterScope, setFilterScope] = useState<"all" | "global" | "client">("all")

  useEffect(() => {
    Promise.all([
      fetch("/api/runbooks").then(r => r.json()),
      fetch("/api/runbook-categories").then(r => r.json()),
      fetch("/api/runbook-tags").then(r => r.json()),
    ]).then(([rb, cats, tgs]) => {
      setRunbooks(Array.isArray(rb) ? rb : [])
      setCategories(Array.isArray(cats) ? cats : [])
      setTags(Array.isArray(tgs) ? tgs : [])
    }).finally(() => setLoading(false))
  }, [])

  const filtered = runbooks.filter(rb => {
    if (search && !rb.title.toLowerCase().includes(search.toLowerCase())) return false
    if (filterCategory && rb.categoryId !== filterCategory) return false
    if (filterTag && !rb.tags.some((t: any) => t.tag.name === filterTag)) return false
    if (filterScope === "global" && rb.clientId) return false
    if (filterScope === "client" && !rb.clientId) return false
    return true
  })

  async function deleteRunbook(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm("Delete this runbook?")) return
    await fetch(`/api/runbooks/${id}`, { method: "DELETE" })
    setRunbooks(rb => rb.filter(r => r.id !== id))
  }

  return (
    <AppShell>
      <div style={{ padding: "32px", maxWidth: "960px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }}>
          <div>
            <div style={{ fontSize: "20px", fontWeight: 600, color: "var(--color-text-primary)" }}>SOPs</div>
            <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginTop: "2px" }}>
              {runbooks.length} SOP{runbooks.length !== 1 ? "s" : ""}
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => router.push("/runbooks/history")}
              className="btn btn-secondary"
            >
              History
            </button>
            <button
              onClick={() => router.push("/runbooks/new")}
              style={{ fontSize: "14px", fontWeight: 500, padding: "8px 18px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}
            >
              New SOP
            </button>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "20px", flexWrap: "wrap" }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search SOPs..."
            className="filter-input"
            style={{ flex: "1 1 200px", minWidth: "160px" }}
          />
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={{ padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}>
            <option value="">All categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={filterTag} onChange={e => setFilterTag(e.target.value)} style={{ padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}>
            <option value="">All tags</option>
            {tags.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
          </select>
          <select value={filterScope} onChange={e => setFilterScope(e.target.value as any)} style={{ padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}>
            <option value="all">All SOPs</option>
            <option value="global">Global (MSP)</option>
            <option value="client">Client-specific</option>
          </select>
        </div>

        {loading ? (
          <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>
            {runbooks.length === 0 ? "No SOPs yet. Create your first one." : "No SOPs match your filters."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {filtered.map(rb => (
              <div
                key={rb.id}
                onClick={() => router.push(`/runbooks/${rb.id}`)}
                style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "10px", padding: "16px 20px", background: "var(--color-background-secondary)", cursor: "pointer" }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--color-border-secondary)")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--color-border-tertiary)")}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "4px" }}>
                      <span style={{ fontSize: "15px", fontWeight: 600, color: "var(--color-text-primary)" }}>{rb.title}</span>
                      {rb.category && (
                        <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "10px", background: rb.category.color + "22", color: rb.category.color, fontWeight: 500, border: `1px solid ${rb.category.color}44` }}>
                          {rb.category.name}
                        </span>
                      )}
                      {!rb.clientId && (
                        <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "10px", background: "var(--color-background-hover)", color: "var(--color-text-muted)" }}>Global</span>
                      )}
                      {rb.client && (
                        <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "10px", background: "rgba(61,111,255,0.13)", color: "var(--accent)" }}>{rb.client.name}</span>
                      )}
                    </div>
                    {rb.summary && (
                      <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginBottom: "8px" }}>{rb.summary}</div>
                    )}
                    <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                      {rb.steps.length > 0 && (
                        <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>{rb.steps.length} step{rb.steps.length !== 1 ? "s" : ""}</span>
                      )}
                      {rb.tags.map((t: any) => (
                        <span key={t.tagId} style={{ fontSize: "11px", color: "var(--color-text-muted)", background: "var(--color-background-hover)", padding: "1px 6px", borderRadius: "4px" }}>#{t.tag.name}</span>
                      ))}
                      <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>{new Date(rb.updatedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                    <button onClick={e => { e.stopPropagation(); router.push(`/runbooks/${rb.id}/edit`) }} style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Edit</button>
                    <button onClick={e => deleteRunbook(rb.id, e)} style={{ fontSize: "12px", color: "var(--color-text-danger)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
