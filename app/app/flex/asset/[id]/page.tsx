"use client"

import React, { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import AppShell from "@/components/AppShell"
import AttachmentsPanel from "@/components/AttachmentsPanel"
import FlexFieldValue from "@/components/flex/FlexFieldValue"
import FlexAssetForm from "@/components/flex/FlexAssetForm"
import {
  type FlexLayout,
  type FlexAssetDetail,
  type FlexValues,
  expiryStatus,
  expiryLabel,
} from "@/components/flex/types"

// =============================================================================
// /flex/asset/[id] — one Flexible-Asset instance. Title + client/location,
// expiry badges above the fold, every field via FlexFieldValue (relation chips,
// attachments, audited password reveal), and a sticky bottom Edit bar on mobile
// whose Edit opens the dynamic form (Sheet).
// =============================================================================

const MOBILE_QUERY = "(max-width: 767px)"
function useIsMobile(): boolean {
  const [m, setM] = useState(false)
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return
    const mql = window.matchMedia(MOBILE_QUERY)
    const u = () => setM(mql.matches)
    u()
    mql.addEventListener("change", u)
    return () => mql.removeEventListener("change", u)
  }, [])
  return m
}

export default function FlexAssetDetailPage(): React.ReactElement {
  const params = useParams<{ id: string }>()
  const id = params?.id
  const router = useRouter()
  const isMobile = useIsMobile()

  const [asset, setAsset] = useState<FlexAssetDetail | null>(null)
  const [layout, setLayout] = useState<FlexLayout | null>(null)
  const [slug, setSlug] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [editing, setEditing] = useState(false)

  async function load() {
    if (!id) return
    const a: FlexAssetDetail | null = await fetch(`/api/flex-assets/${id}`)
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null)
    if (!a) {
      setNotFound(true)
      setLoading(false)
      return
    }
    setAsset(a)
    const [full, list] = await Promise.all([
      fetch(`/api/flex-layouts/${a.layoutId}`).then(r => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/flex-layouts").then(r => (r.ok ? r.json() : [])).catch(() => []),
    ])
    setLayout(full)
    const s = (Array.isArray(list) ? list : []).find((l: { id: string; slug: string }) => l.id === a.layoutId)
    setSlug(s?.slug ?? null)
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function reveal(fieldKey: string): Promise<string | null> {
    const res = await fetch(`/api/flex-assets/${id}/reveal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fieldKey }),
    })
    if (!res.ok) return null
    const j = await res.json().catch(() => ({}))
    return typeof j.value === "string" ? j.value : null
  }

  async function del() {
    if (!confirm("Delete this record? It will be archived.")) return
    const res = await fetch(`/api/flex-assets/${id}`, { method: "DELETE" })
    if (res.ok) router.push(slug ? `/flex/${slug}` : "/flex")
  }

  if (loading) {
    return (
      <AppShell>
        <div className="state-box" style={{ padding: "var(--space-12)" }}>
          <span>Loading…</span>
        </div>
      </AppShell>
    )
  }

  if (notFound || !asset) {
    return (
      <AppShell>
        <div className="state-box" style={{ padding: "var(--space-12)" }}>
          <span>Record not found.</span>
          <a href="/flex" className="btn btn-secondary">
            Back to Flexible Assets
          </a>
        </div>
      </AppShell>
    )
  }

  const fields = [...(layout?.fields ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  const relations = asset.resolvedRelations ?? []
  const attachments = asset.attachments ?? []
  const accent = layout?.color || "var(--accent)"

  // Above-the-fold expiry summary.
  const expiring = fields
    .filter(f => f.expires && f.type === "date")
    .map(f => ({ field: f, status: expiryStatus(asset.values?.[f.key]) }))
    .filter(x => x.status && x.status.level !== "ok") as { field: (typeof fields)[number]; status: NonNullable<ReturnType<typeof expiryStatus>> }[]

  // Strip password + upload keys before prefilling the edit form.
  const editValues: FlexValues = {}
  for (const f of fields) {
    if (f.type === "password" || f.type === "upload" || f.type === "header") continue
    if (asset.values && f.key in asset.values) editValues[f.key] = asset.values[f.key]
  }

  const labelStyle: React.CSSProperties = {
    fontSize: "var(--text-xs)",
    fontWeight: 600,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: "var(--muted)",
    marginBottom: 4,
  }

  return (
    <AppShell>
      <div style={{ padding: "var(--space-8)", maxWidth: 760, margin: "0 auto", paddingBottom: isMobile ? 96 : "var(--space-8)" }}>
        <a
          href={slug ? `/flex/${slug}` : "/flex"}
          style={{ fontSize: "var(--text-sm)", color: "var(--muted)", textDecoration: "none" }}
        >
          ← {layout?.name ?? "Flexible Assets"}
        </a>

        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "var(--space-4)",
            margin: "var(--space-3) 0 var(--space-5)",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", gap: "var(--space-3)", minWidth: 0 }}>
            <span style={{ fontSize: 30, lineHeight: 1 }}>{layout?.icon ?? "📄"}</span>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ margin: 0, borderLeft: `3px solid ${accent}`, paddingLeft: "var(--space-3)", wordBreak: "break-word" }}>
                {asset.title || "Untitled"}
              </h1>
              <div style={{ fontSize: "var(--text-sm)", color: "var(--muted)", marginTop: 4, paddingLeft: "var(--space-3)" }}>
                {asset.client?.name ?? "—"}
                {asset.location?.name ? ` · ${asset.location.name}` : ""}
              </div>
            </div>
          </div>
          {!isMobile && (
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <button className="btn btn-secondary" onClick={() => setEditing(true)}>
                Edit
              </button>
              <button className="btn btn-danger" onClick={del}>
                Delete
              </button>
            </div>
          )}
        </div>

        {/* Expiry banner (above the fold) */}
        {expiring.length > 0 && (
          <div
            style={{
              marginBottom: "var(--space-5)",
              padding: "12px 14px",
              borderRadius: 10,
              background: expiring.some(e => e.status.level === "expired") ? "rgba(255,77,109,0.1)" : "rgba(255,179,71,0.1)",
              border: `1px solid ${expiring.some(e => e.status.level === "expired") ? "rgba(255,77,109,0.4)" : "rgba(255,179,71,0.4)"}`,
            }}
          >
            <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: 6, color: "var(--text)" }}>⏰ Expiration</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {expiring.map(e => (
                <div key={e.field.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--text-sm)" }}>
                  <span className={e.status.level === "expired" ? "badge-danger" : "badge-warn"}>{expiryLabel(e.status)}</span>
                  <span style={{ color: "var(--muted)" }}>{e.field.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Fields */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          {fields.map(f => {
            if (f.type === "header") {
              return <FlexFieldValue key={f.key} field={f} value={undefined} context="detail" />
            }
            if (f.type === "upload") {
              return (
                <div key={f.key}>
                  <div style={labelStyle}>{f.label}</div>
                  <AttachmentsPanel entityType="flexAsset" entityId={asset.id} flexFieldKey={f.key} accept="image/*,application/pdf" compact />
                </div>
              )
            }
            const fieldRelations = f.type === "relation" ? relations.filter(r => r.fieldKey === f.key) : undefined
            const fieldAttachments = undefined
            return (
              <div key={f.key}>
                <div style={labelStyle}>{f.label}</div>
                <div style={{ fontSize: "var(--text-base)" }}>
                  <FlexFieldValue
                    field={f}
                    value={asset.values?.[f.key]}
                    context="detail"
                    relations={fieldRelations}
                    attachments={fieldAttachments}
                    reveal={f.type === "password" ? reveal : undefined}
                  />
                </div>
              </div>
            )
          })}
        </div>

        {/* General attachments (files not tied to a specific upload field) */}
        <div style={{ marginTop: "var(--space-6)" }}>
          <div style={labelStyle}>Attachments</div>
          <AttachmentsPanel entityType="flexAsset" entityId={asset.id} accept="image/*,application/pdf" compact />
        </div>
      </div>

      {/* Sticky mobile action bar */}
      {isMobile && (
        <div
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 30,
            display: "flex",
            gap: "var(--space-3)",
            padding: "var(--space-3) var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom))",
            background: "var(--surface)",
            borderTop: "1px solid var(--border)",
          }}
        >
          <button className="btn btn-danger" onClick={del} style={{ flexShrink: 0 }}>
            Delete
          </button>
          <button className="btn btn-primary" onClick={() => setEditing(true)} style={{ flex: 1 }}>
            Edit
          </button>
        </div>
      )}

      {layout && (
        <FlexAssetForm
          open={editing}
          onClose={() => setEditing(false)}
          layout={layout}
          mode="edit"
          assetId={asset.id}
          initialClientId={asset.clientId}
          initialLocationId={(asset as { locationId?: string | null }).locationId ?? null}
          initialValues={editValues}
          initialRelations={relations}
          onSaved={() => {
            setEditing(false)
            setLoading(true)
            load()
          }}
        />
      )}
    </AppShell>
  )
}
