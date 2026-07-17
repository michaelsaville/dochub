"use client"

import React, { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import AppShell from "@/components/AppShell"
import DataCards, { type DataColumn } from "@/components/DataCards"
import FlexFieldValue from "@/components/flex/FlexFieldValue"
import FlexAssetForm from "@/components/flex/FlexAssetForm"
import {
  type FlexLayout,
  type FlexLayoutSummary,
  type FlexAssetInstance,
} from "@/components/flex/types"

// =============================================================================
// /flex/[slug] — instances of one layout. Desktop: a data-table of the
// show-in-list columns (via DataCards, which becomes stacked cards on phones).
// A client filter + a "+ New" that opens the dynamic create form in a Sheet.
// =============================================================================

type ClientOpt = { id: string; name: string }

export default function FlexLayoutIndexPage(): React.ReactElement {
  const params = useParams<{ slug: string }>()
  const slug = params?.slug
  const router = useRouter()

  const [layout, setLayout] = useState<FlexLayout | null>(null)
  const [summary, setSummary] = useState<FlexLayoutSummary | null>(null)
  const [instances, setInstances] = useState<FlexAssetInstance[]>([])
  const [clients, setClients] = useState<ClientOpt[]>([])
  const [clientFilter, setClientFilter] = useState("")
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [creating, setCreating] = useState(false)

  // Resolve the layout by slug, then load its fields + instances.
  useEffect(() => {
    if (!slug) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const listRes = await fetch("/api/flex-layouts").then(r => (r.ok ? r.json() : [])).catch(() => [])
      const found: FlexLayoutSummary | undefined = (Array.isArray(listRes) ? listRes : []).find(
        (l: FlexLayoutSummary) => l.slug === slug,
      )
      if (cancelled) return
      if (!found) {
        setNotFound(true)
        setLoading(false)
        return
      }
      setSummary(found)
      const [full] = await Promise.all([
        fetch(`/api/flex-layouts/${found.id}`).then(r => (r.ok ? r.json() : null)).catch(() => null),
        loadInstances(found.id),
      ])
      if (cancelled) return
      setLayout(full)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  useEffect(() => {
    fetch("/api/clients")
      .then(r => (r.ok ? r.json() : []))
      .then((cs: ClientOpt[]) => setClients(Array.isArray(cs) ? cs.map(c => ({ id: c.id, name: c.name })) : []))
      .catch(() => {})
  }, [])

  async function loadInstances(layoutId: string) {
    const data = await fetch(`/api/flex-assets?layoutId=${layoutId}`)
      .then(r => (r.ok ? r.json() : []))
      .catch(() => [])
    setInstances(Array.isArray(data) ? data : [])
  }

  const listFields = useMemo(() => (layout?.fields ?? []).filter(f => f.showInList && f.type !== "header"), [layout])

  const clientOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const inst of instances) {
      if (inst.clientId) seen.set(inst.clientId, inst.client?.name ?? inst.clientId)
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [instances])

  const filtered = useMemo(
    () => (clientFilter ? instances.filter(i => i.clientId === clientFilter) : instances),
    [instances, clientFilter],
  )

  const columns: DataColumn<FlexAssetInstance>[] = useMemo(() => {
    const cols: DataColumn<FlexAssetInstance>[] = [
      {
        key: "title",
        label: "Name",
        primary: true,
        render: r => <span style={{ fontWeight: 600 }}>{r.title || "Untitled"}</span>,
      },
      {
        key: "client",
        label: "Client",
        render: r => r.client?.name ?? "—",
      },
    ]
    for (const f of listFields) {
      cols.push({
        key: `f_${f.key}`,
        label: f.label,
        render: r => <FlexFieldValue field={f} value={r.values?.[f.key]} context="list" />,
      })
    }
    cols.push({
      key: "updatedAt",
      label: "Updated",
      hideOnMobile: true,
      render: r => (r.updatedAt ? new Date(r.updatedAt).toLocaleDateString() : "—"),
    })
    return cols
  }, [listFields])

  const accent = summary?.color || "var(--accent)"

  return (
    <AppShell>
      <div style={{ padding: "var(--space-8)", maxWidth: 1100, margin: "0 auto" }}>
        <a href="/flex" style={{ fontSize: "var(--text-sm)", color: "var(--muted)", textDecoration: "none" }}>
          ← Flexible Assets
        </a>

        {notFound ? (
          <div className="state-box" style={{ marginTop: "var(--space-6)" }}>
            <span>Layout not found.</span>
            <a href="/flex" className="btn btn-secondary">
              Back to hub
            </a>
          </div>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "var(--space-4)",
                margin: "var(--space-3) 0 var(--space-6)",
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", minWidth: 0 }}>
                <span style={{ fontSize: 30, lineHeight: 1 }}>{summary?.icon ?? "📄"}</span>
                <h1 style={{ margin: 0, borderLeft: `3px solid ${accent}`, paddingLeft: "var(--space-3)" }}>
                  {summary?.name ?? "…"}
                </h1>
              </div>
              <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
                {clientOptions.length > 1 && (
                  <select
                    className="filter-input"
                    value={clientFilter}
                    onChange={e => setClientFilter(e.target.value)}
                    style={{ minWidth: 160 }}
                  >
                    <option value="">All clients</option>
                    {clientOptions.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}
                <button className="btn btn-primary" onClick={() => setCreating(true)} disabled={!layout}>
                  + New
                </button>
              </div>
            </div>

            {loading ? (
              <div className="state-box">
                <span>Loading…</span>
              </div>
            ) : (
              <DataCards<FlexAssetInstance>
                columns={columns}
                rows={filtered}
                rowKey={r => r.id}
                onRowClick={r => router.push(`/flex/asset/${r.id}`)}
              />
            )}
          </>
        )}
      </div>

      {layout && (
        <FlexAssetForm
          open={creating}
          onClose={() => setCreating(false)}
          layout={layout}
          mode="create"
          clients={clients}
          onSaved={id => {
            setCreating(false)
            router.push(`/flex/asset/${id}`)
          }}
        />
      )}
    </AppShell>
  )
}
