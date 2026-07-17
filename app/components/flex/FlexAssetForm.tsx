"use client"

import React, { useEffect, useState } from "react"
import Sheet from "@/components/Sheet"
import FlexFieldInput from "./FlexFieldInput"
import {
  type FlexLayout,
  type FlexValues,
  type FlexRelationValue,
  relationTargetType,
  isEmptyValue,
} from "./types"

// =============================================================================
// FlexAssetForm — the single-column dynamic create/edit form, hosted in a Sheet
// (bottom-sheet on mobile) with a sticky footer action bar. Reused by the
// layout index (create) and the instance detail (edit).
//
// • create: client picker → optional location → the layout's fields.
//   Staged upload files are posted to /api/attachments after the instance is
//   created (the FlexAsset id doesn't exist until then).
// • edit: client is fixed; uploads use the live AttachmentsPanel; empty
//   password fields are omitted so the stored secret is preserved.
// =============================================================================

type ClientOpt = { id: string; name: string }
type LocationOpt = { id: string; name: string }

type Props = {
  open: boolean
  onClose: () => void
  layout: FlexLayout
  mode: "create" | "edit"
  /** create only — organizations to scope the instance under */
  clients?: ClientOpt[]
  /** edit only */
  assetId?: string
  initialClientId?: string
  initialLocationId?: string | null
  initialValues?: FlexValues
  initialRelations?: FlexRelationValue[]
  onSaved: (id: string) => void
}

function groupRelations(rels: FlexRelationValue[]): Record<string, FlexRelationValue[]> {
  const out: Record<string, FlexRelationValue[]> = {}
  for (const r of rels) (out[r.fieldKey] ||= []).push(r)
  return out
}

export default function FlexAssetForm({
  open,
  onClose,
  layout,
  mode,
  clients,
  assetId,
  initialClientId,
  initialLocationId,
  initialValues,
  initialRelations,
  onSaved,
}: Props): React.ReactElement {
  const [clientId, setClientId] = useState(initialClientId ?? "")
  const [locationId, setLocationId] = useState(initialLocationId ?? "")
  const [values, setValues] = useState<FlexValues>(initialValues ?? {})
  const [relsByField, setRelsByField] = useState<Record<string, FlexRelationValue[]>>(
    groupRelations(initialRelations ?? []),
  )
  const [locations, setLocations] = useState<LocationOpt[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset state each time the sheet opens.
  useEffect(() => {
    if (!open) return
    setClientId(initialClientId ?? "")
    setLocationId(initialLocationId ?? "")
    setValues(initialValues ?? {})
    setRelsByField(groupRelations(initialRelations ?? []))
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Load the chosen client's locations (the client detail GET includes them).
  useEffect(() => {
    if (!clientId) {
      setLocations([])
      return
    }
    let cancelled = false
    fetch(`/api/clients/${clientId}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (cancelled || !d) return
        setLocations(Array.isArray(d.locations) ? d.locations.map((l: LocationOpt) => ({ id: l.id, name: l.name })) : [])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [clientId])

  const fields = [...layout.fields].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))

  function setValue(key: string, v: unknown) {
    setValues(prev => ({ ...prev, [key]: v }))
  }

  function missingRequired(): string[] {
    const missing: string[] = []
    for (const f of fields) {
      if (!f.required || f.type === "header") continue
      if (f.type === "relation") {
        if ((relsByField[f.key] ?? []).length === 0) missing.push(f.label)
      } else if (f.type === "upload") {
        const staged = Array.isArray(values[f.key]) ? (values[f.key] as File[]) : []
        if (mode === "create" && staged.length === 0) missing.push(f.label)
      } else if (isEmptyValue(values[f.key])) {
        missing.push(f.label)
      }
    }
    return missing
  }

  function buildPayloadValues(): FlexValues {
    const out: FlexValues = {}
    for (const f of fields) {
      if (f.type === "header" || f.type === "relation" || f.type === "upload") continue
      const v = values[f.key]
      if (f.type === "password" && mode === "edit" && (v == null || v === "")) continue // keep current
      if (v === undefined) continue
      out[f.key] = v
    }
    return out
  }

  function flatRelations() {
    return Object.values(relsByField)
      .flat()
      .map(r => ({ fieldKey: r.fieldKey, targetType: r.targetType, targetId: r.targetId }))
  }

  async function uploadStaged(newAssetId: string) {
    for (const f of fields) {
      if (f.type !== "upload") continue
      const staged = Array.isArray(values[f.key]) ? (values[f.key] as File[]) : []
      for (const file of staged) {
        const fd = new FormData()
        fd.append("file", file)
        fd.append("entityType", "flexAsset")
        fd.append("entityId", newAssetId)
        fd.append("flexAssetId", newAssetId)
        fd.append("flexFieldKey", f.key)
        try {
          await fetch("/api/attachments", { method: "POST", body: fd })
        } catch {
          /* best effort; failures surface in the attachments list */
        }
      }
    }
  }

  async function submit() {
    setError(null)
    if (mode === "create" && !clientId) {
      setError("Choose a client first.")
      return
    }
    const missing = missingRequired()
    if (missing.length) {
      setError(`Required: ${missing.join(", ")}`)
      return
    }
    setSaving(true)
    try {
      if (mode === "create") {
        const res = await fetch(`/api/clients/${clientId}/flex-assets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            layoutId: layout.id,
            locationId: locationId || null,
            values: buildPayloadValues(),
            relations: flatRelations(),
          }),
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          setError(j.error ?? `Save failed (${res.status})`)
          return
        }
        const created = await res.json()
        await uploadStaged(created.id)
        onSaved(created.id)
      } else {
        const res = await fetch(`/api/flex-assets/${assetId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            locationId: locationId || null,
            values: buildPayloadValues(),
            relations: flatRelations(),
          }),
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          setError(j.error ?? `Save failed (${res.status})`)
          return
        }
        onSaved(assetId!)
      }
    } finally {
      setSaving(false)
    }
  }

  const footer = (
    <>
      <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
        Cancel
      </button>
      <button type="button" className="btn btn-primary" onClick={submit} disabled={saving} style={{ minWidth: 120 }}>
        {saving ? "Saving…" : mode === "create" ? `Create ${layout.name}` : "Save changes"}
      </button>
    </>
  )

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={mode === "create" ? `New ${layout.name}` : `Edit ${layout.name}`}
      footer={footer}
    >
      {error && (
        <div
          style={{
            marginBottom: "var(--space-4)",
            padding: "10px 12px",
            borderRadius: 8,
            background: "rgba(255,77,109,0.1)",
            border: "1px solid rgba(255,77,109,0.35)",
            color: "var(--danger)",
            fontSize: "var(--text-sm)",
          }}
        >
          {error}
        </div>
      )}

      {mode === "create" && (
        <div className="field">
          <label>
            Client <span style={{ color: "var(--danger)" }}>*</span>
          </label>
          <select value={clientId} onChange={e => setClientId(e.target.value)}>
            <option value="">— Select client —</option>
            {(clients ?? []).map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {clientId && locations.length > 0 && (
        <div className="field">
          <label>Location</label>
          <select value={locationId} onChange={e => setLocationId(e.target.value)}>
            <option value="">— No specific location —</option>
            {locations.map(l => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {fields.map((f, i) => (
        <FlexFieldInput
          key={f.key}
          field={f}
          value={values[f.key]}
          onChange={v => setValue(f.key, v)}
          relations={relsByField[f.key] ?? []}
          onRelationsChange={rels => setRelsByField(prev => ({ ...prev, [f.key]: rels.map(r => ({ ...r, targetType: relationTargetType(f.relationTarget) })) }))}
          clientId={clientId || undefined}
          flexAssetId={mode === "edit" ? assetId : undefined}
          autoFocus={mode === "create" && i === 0 && f.type !== "header"}
        />
      ))}
    </Sheet>
  )
}
