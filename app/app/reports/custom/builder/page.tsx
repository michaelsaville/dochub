"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ENTITIES, FILTER_OPS } from "@/lib/report-entities"
import type { EntityKey, ReportConfig, Filter } from "@/lib/report-entities"

type Client = { id: string; name: string }

const ENTITY_KEYS = Object.keys(ENTITIES) as EntityKey[]

function BuilderInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams.get("edit")

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [entity, setEntity] = useState<EntityKey>("assets")
  const [columns, setColumns] = useState<string[]>([])
  const [filters, setFilters] = useState<Filter[]>([])
  const [sort, setSort] = useState<{ field: string; dir: "asc" | "desc" } | null>(null)
  const [groupBy, setGroupBy] = useState<string | null>(null)
  const [clientIds, setClientIds] = useState<string[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!!editId)

  const entityDef = ENTITIES[entity]

  // Load clients
  useEffect(() => {
    fetch("/api/clients?limit=999")
      .then(r => r.ok ? r.json() : [])
      .then(d => setClients(Array.isArray(d) ? d : []))
  }, [])

  // Load existing report if editing
  useEffect(() => {
    if (!editId) {
      setColumns(ENTITIES.assets.defaultColumns)
      return
    }
    fetch(`/api/reports/custom/${editId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return
        setName(d.name)
        setDescription(d.description ?? "")
        setEntity(d.entity)
        const cfg = d.config as ReportConfig
        setColumns(cfg.columns ?? ENTITIES[d.entity as EntityKey].defaultColumns)
        setFilters(cfg.filters ?? [])
        setSort(cfg.sort ?? null)
        setGroupBy(cfg.groupBy ?? null)
        setClientIds(cfg.clientIds ?? [])
      })
      .finally(() => setLoading(false))
  }, [editId])

  // Reset columns when entity changes
  function changeEntity(key: EntityKey) {
    setEntity(key)
    setColumns(ENTITIES[key].defaultColumns)
    setFilters([])
    setSort(null)
    setGroupBy(null)
  }

  function toggleColumn(key: string) {
    setColumns(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }

  function addFilter() {
    const first = entityDef.fields.find(f => f.filterable)
    if (!first) return
    setFilters(prev => [...prev, { field: first.key, op: "contains", value: "" }])
  }

  function updateFilter(i: number, patch: Partial<Filter>) {
    setFilters(prev => prev.map((f, idx) => idx === i ? { ...f, ...patch } : f))
  }

  function removeFilter(i: number) {
    setFilters(prev => prev.filter((_, idx) => idx !== i))
  }

  function toggleClient(id: string) {
    setClientIds(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])
  }

  async function save() {
    if (!name.trim()) { alert("Report name is required"); return }
    setSaving(true)
    const config: ReportConfig = { clientIds, columns, filters, sort, groupBy }
    const body = { name: name.trim(), description: description.trim() || null, entity, config }
    const url = editId ? `/api/reports/custom/${editId}` : "/api/reports/custom"
    const method = editId ? "PUT" : "POST"
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    setSaving(false)
    if (res.ok) {
      const data = await res.json()
      router.push(`/reports/custom/${editId ?? data.id}/run`)
    }
  }

  if (loading) return <div style={{ padding: "40px", color: "var(--color-text-secondary)", fontSize: "13px" }}>Loading…</div>

  const filterableFields = entityDef.fields.filter(f => f.filterable)
  const sortableFields = entityDef.fields.filter(f => f.sortable)

  const labelStyle: React.CSSProperties = { display: "block", fontSize: "11px", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }
  const inputStyle: React.CSSProperties = { padding: "7px 10px", borderRadius: "6px", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-secondary)", color: "var(--color-text-primary)", fontSize: "13px", width: "100%", boxSizing: "border-box" as const }
  const sectionStyle: React.CSSProperties = { marginBottom: "28px" }

  return (
    <div style={{ padding: "32px", maxWidth: "860px", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "28px" }}>
        <button onClick={() => router.push("/reports/custom")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-secondary)", fontSize: "13px" }}>← Back</button>
        <h1 style={{ fontSize: "20px", fontWeight: 500, margin: 0, flex: 1 }}>{editId ? "Edit Report" : "New Report"}</h1>
        <button
          onClick={save}
          disabled={saving}
          style={{ padding: "8px 20px", borderRadius: "7px", border: "none", cursor: "pointer", background: "var(--color-accent)", color: "#fff", fontSize: "13px", fontWeight: 500 }}
        >
          {saving ? "Saving…" : (editId ? "Save & Run" : "Save & Run")}
        </button>
      </div>

      {/* Name + Entity */}
      <div style={{ ...sectionStyle, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <div>
          <label style={labelStyle}>Report Name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Expiring Warranties Q1" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Data Source</label>
          <select value={entity} onChange={e => changeEntity(e.target.value as EntityKey)} style={inputStyle}>
            {ENTITY_KEYS.map(k => <option key={k} value={k}>{ENTITIES[k].label}</option>)}
          </select>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={labelStyle}>Description (optional)</label>
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief description…" style={inputStyle} />
        </div>
      </div>

      {/* Client scope */}
      <div style={sectionStyle}>
        <label style={labelStyle}>Client Scope</label>
        <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginBottom: "8px" }}>Leave all unchecked to include all clients.</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {clients.map(c => (
            <label key={c.id} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", cursor: "pointer", padding: "5px 10px", borderRadius: "6px", background: clientIds.includes(c.id) ? "var(--color-accent)" : "var(--color-background-secondary)", color: clientIds.includes(c.id) ? "#fff" : "var(--color-text-primary)", border: "0.5px solid var(--color-border-tertiary)" }}>
              <input type="checkbox" checked={clientIds.includes(c.id)} onChange={() => toggleClient(c.id)} style={{ display: "none" }} />
              {c.name}
            </label>
          ))}
        </div>
      </div>

      {/* Columns */}
      <div style={sectionStyle}>
        <label style={labelStyle}>Columns</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {entityDef.fields.map(f => (
            <label key={f.key} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", cursor: "pointer", padding: "5px 10px", borderRadius: "6px", background: columns.includes(f.key) ? "var(--color-accent)" : "var(--color-background-secondary)", color: columns.includes(f.key) ? "#fff" : "var(--color-text-primary)", border: "0.5px solid var(--color-border-tertiary)" }}>
              <input type="checkbox" checked={columns.includes(f.key)} onChange={() => toggleColumn(f.key)} style={{ display: "none" }} />
              {f.label}
            </label>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div style={sectionStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "10px" }}>
          <label style={{ ...labelStyle, marginBottom: 0 }}>Filters</label>
          <button onClick={addFilter} style={{ padding: "3px 12px", borderRadius: "5px", border: "0.5px solid var(--color-border-secondary)", cursor: "pointer", background: "none", color: "var(--color-text-secondary)", fontSize: "12px" }}>+ Add filter</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {filters.map((f, i) => {
            const fieldDef = entityDef.fields.find(fd => fd.key === f.field)
            const validOps = FILTER_OPS.filter(op => !fieldDef || op.types.includes(fieldDef.type))
            return (
              <div key={i} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <select value={f.field} onChange={e => updateFilter(i, { field: e.target.value, op: "contains", value: "" })} style={{ ...inputStyle, width: "auto", flex: 1 }}>
                  {filterableFields.map(fd => <option key={fd.key} value={fd.key}>{fd.label}</option>)}
                </select>
                <select value={f.op} onChange={e => updateFilter(i, { op: e.target.value as any })} style={{ ...inputStyle, width: "auto", flex: 1 }}>
                  {validOps.map(op => <option key={op.op} value={op.op}>{op.label}</option>)}
                </select>
                {FILTER_OPS.find(op => op.op === f.op)?.hasValue && (
                  fieldDef?.enumValues ? (
                    <select value={f.value ?? ""} onChange={e => updateFilter(i, { value: e.target.value })} style={{ ...inputStyle, width: "auto", flex: 1 }}>
                      {fieldDef.enumValues.map(v => <option key={v} value={v}>{v.replace(/_/g, " ")}</option>)}
                    </select>
                  ) : (
                    <input
                      value={f.value ?? ""}
                      onChange={e => updateFilter(i, { value: e.target.value })}
                      placeholder={fieldDef?.type === "date" ? "YYYY-MM-DD or days" : "value…"}
                      style={{ ...inputStyle, flex: 1 }}
                    />
                  )
                )}
                <button onClick={() => removeFilter(i)} style={{ padding: "5px 10px", borderRadius: "5px", border: "none", cursor: "pointer", background: "none", color: "var(--color-text-danger)", fontSize: "16px", lineHeight: 1 }}>×</button>
              </div>
            )
          })}
          {filters.length === 0 && <div style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>No filters — all rows will be included.</div>}
        </div>
      </div>

      {/* Sort + Group */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", ...sectionStyle }}>
        <div>
          <label style={labelStyle}>Sort By</label>
          <div style={{ display: "flex", gap: "8px" }}>
            <select
              value={sort?.field ?? ""}
              onChange={e => setSort(e.target.value ? { field: e.target.value, dir: sort?.dir ?? "asc" } : null)}
              style={{ ...inputStyle, flex: 1 }}
            >
              <option value="">None</option>
              {sortableFields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
            {sort && (
              <select value={sort.dir} onChange={e => setSort({ ...sort, dir: e.target.value as "asc" | "desc" })} style={{ ...inputStyle, width: "auto" }}>
                <option value="asc">Asc</option>
                <option value="desc">Desc</option>
              </select>
            )}
          </div>
        </div>
        <div>
          <label style={labelStyle}>Group By</label>
          <select value={groupBy ?? ""} onChange={e => setGroupBy(e.target.value || null)} style={inputStyle}>
            <option value="">None</option>
            {sortableFields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
        </div>
      </div>
    </div>
  )
}

export default function CustomReportBuilder() {
  return (
    <Suspense fallback={<div style={{ padding: "40px", color: "var(--color-text-secondary)" }}>Loading…</div>}>
      <BuilderInner />
    </Suspense>
  )
}
