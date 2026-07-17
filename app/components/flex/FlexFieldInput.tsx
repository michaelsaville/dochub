"use client"

import React, { useState } from "react"
import RelationLinker from "@/components/RelationLinker"
import AttachmentsPanel from "@/components/AttachmentsPanel"
import {
  type FlexField,
  type FlexRelationValue,
  relationTargetType,
  relationSearchEndpoint,
  relationMapOption,
  relationNoun,
} from "./types"

// =============================================================================
// FlexFieldInput — renders the correct <input> for one Flexible-Asset field.
//
// Handles all 13 field types. Non-value types are special:
//   • header   → a section divider, never an input
//   • relation → RelationLinker (its own searchable picker); value flows through
//                `relations` / `onRelationsChange`, not `value`
//   • upload   → AttachmentsPanel when the FlexAsset already exists, otherwise a
//                staged file queue (value = File[]) uploaded by the parent after
//                the instance is created
//
// Every control is >=44px on mobile via the global .field touch contract; the
// form is single-column. Subcomponents that own text state (tags, password) are
// module-scope so React never remounts their <input> (focus-loss guard).
// =============================================================================

type Props = {
  field: FlexField
  value: unknown
  onChange: (value: unknown) => void
  /** relation fields: current relation rows for THIS field + setter */
  relations?: FlexRelationValue[]
  onRelationsChange?: (rels: FlexRelationValue[]) => void
  /** client scope for relation search + attachment ownership */
  clientId?: string
  /** present once the instance exists → live AttachmentsPanel for uploads */
  flexAssetId?: string
  autoFocus?: boolean
}

const hintStyle: React.CSSProperties = {
  fontSize: "var(--text-xs)",
  color: "var(--muted)",
  marginTop: 4,
}

export default function FlexFieldInput({
  field,
  value,
  onChange,
  relations,
  onRelationsChange,
  clientId,
  flexAssetId,
  autoFocus,
}: Props): React.ReactElement {
  // ── header: a divider, not a field ────────────────────────────────────────
  if (field.type === "header") {
    return (
      <div
        style={{
          margin: "var(--space-5) 0 var(--space-1)",
          borderTop: "1px solid var(--border)",
          paddingTop: "var(--space-4)",
        }}
      >
        <div
          style={{
            fontSize: "var(--text-sm)",
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--accent)",
          }}
        >
          {field.label}
        </div>
        {field.hint && <div style={hintStyle}>{field.hint}</div>}
      </div>
    )
  }

  // ── relation: RelationLinker owns its picker ──────────────────────────────
  if (field.type === "relation") {
    const rels = relations ?? []
    const targetType = relationTargetType(field.relationTarget)
    const endpoint = relationSearchEndpoint(field.relationTarget, clientId)

    async function resolveLabels(ids: string[]): Promise<Record<string, string>> {
      try {
        const r = await fetch(endpoint)
        if (!r.ok) return {}
        const rows = await r.json()
        const arr = Array.isArray(rows) ? rows : []
        const map: Record<string, string> = {}
        for (const row of arr) {
          const opt = relationMapOption(row)
          map[opt.id] = opt.label
        }
        return map
      } catch {
        return {}
      }
    }

    return (
      <div>
        <RelationLinker
          title={field.label + (field.required ? " *" : "")}
          itemNoun={relationNoun(field.relationTarget)}
          currentLinks={rels.map(r => ({ id: r.targetId, label: r.label ?? r.targetId }))}
          searchEndpoint={endpoint}
          mapOption={relationMapOption}
          onLink={async ids => {
            const labels = await resolveLabels(ids)
            const added: FlexRelationValue[] = ids.map(id => ({
              fieldKey: field.key,
              targetType,
              targetId: id,
              label: labels[id] ?? id,
            }))
            const kept = rels.filter(r => !ids.includes(r.targetId))
            onRelationsChange?.([...kept, ...added])
          }}
          onUnlink={async id => {
            onRelationsChange?.(rels.filter(r => r.targetId !== id))
          }}
        />
        {field.hint && <div style={{ ...hintStyle, marginTop: -4, marginBottom: 12 }}>{field.hint}</div>}
      </div>
    )
  }

  // ── upload: live AttachmentsPanel or a staged queue ───────────────────────
  if (field.type === "upload") {
    return (
      <div className="field">
        <label>
          {field.label}
          {field.required && <span style={{ color: "var(--danger)" }}> *</span>}
        </label>
        {flexAssetId ? (
          <AttachmentsPanel
            entityType="flexAsset"
            entityId={flexAssetId}
            flexFieldKey={field.key}
            accept="image/*,application/pdf"
            compact
          />
        ) : (
          <StagedUpload
            files={Array.isArray(value) ? (value as File[]) : []}
            onChange={onChange}
          />
        )}
        {field.hint && <div style={hintStyle}>{field.hint}</div>}
      </div>
    )
  }

  // ── checkbox: inline label + control ──────────────────────────────────────
  if (field.type === "checkbox") {
    return (
      <div className="field">
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-3)",
            minHeight: 44,
            cursor: "pointer",
            textTransform: "none",
            letterSpacing: "normal",
            fontSize: "var(--text-base)",
            color: "var(--text)",
            fontWeight: 400,
            margin: 0,
          }}
        >
          <input
            type="checkbox"
            checked={!!value}
            onChange={e => onChange(e.target.checked)}
            style={{ width: 20, height: 20, flexShrink: 0, accentColor: "var(--accent)" }}
          />
          <span>
            {field.label}
            {field.required && <span style={{ color: "var(--danger)" }}> *</span>}
          </span>
        </label>
        {field.hint && <div style={hintStyle}>{field.hint}</div>}
      </div>
    )
  }

  // ── everything else shares a labelled wrapper ─────────────────────────────
  return (
    <div className="field">
      <label>
        {field.label}
        {field.required && <span style={{ color: "var(--danger)" }}> *</span>}
      </label>
      <FieldControl field={field} value={value} onChange={onChange} autoFocus={autoFocus} isEdit={!!flexAssetId} />
      {field.hint && <div style={hintStyle}>{field.hint}</div>}
    </div>
  )
}

// ── inner control for the "value" field types ────────────────────────────────
function FieldControl({
  field,
  value,
  onChange,
  autoFocus,
  isEdit,
}: {
  field: FlexField
  value: unknown
  onChange: (v: unknown) => void
  autoFocus?: boolean
  isEdit?: boolean
}): React.ReactElement {
  switch (field.type) {
    case "textarea":
      return (
        <textarea
          rows={4}
          value={String(value ?? "")}
          onChange={e => onChange(e.target.value)}
          autoFocus={autoFocus}
          style={{ resize: "vertical", minHeight: 88 }}
        />
      )

    case "number":
      return (
        <input
          type="number"
          inputMode="decimal"
          value={value == null ? "" : String(value)}
          onChange={e => onChange(e.target.value === "" ? null : e.target.value)}
          autoFocus={autoFocus}
        />
      )

    case "date":
      return (
        <input
          type="date"
          value={String(value ?? "")}
          onChange={e => onChange(e.target.value)}
          autoFocus={autoFocus}
        />
      )

    case "select":
      return (
        <select value={String(value ?? "")} onChange={e => onChange(e.target.value)} autoFocus={autoFocus}>
          <option value="">— Select —</option>
          {(field.options ?? []).map(o => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )

    case "multiselect":
      return (
        <select
          multiple
          value={Array.isArray(value) ? (value as string[]) : []}
          onChange={e => onChange(Array.from(e.target.selectedOptions).map(o => o.value))}
          style={{ minHeight: 132 }}
        >
          {(field.options ?? []).map(o => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )

    case "tags":
      return <TagsInput tags={Array.isArray(value) ? (value as string[]) : []} onChange={onChange} />

    case "password":
      return <PasswordInput value={String(value ?? "")} onChange={onChange} isEdit={!!isEdit} />

    case "website":
      return (
        <input
          type="url"
          inputMode="url"
          placeholder="https://…"
          value={String(value ?? "")}
          onChange={e => onChange(e.target.value)}
          autoFocus={autoFocus}
        />
      )

    // text + any fallthrough
    default:
      return (
        <input
          type="text"
          value={String(value ?? "")}
          onChange={e => onChange(e.target.value)}
          autoFocus={autoFocus}
        />
      )
  }
}

// ── Tags: chip input (module scope → stable <input> focus) ───────────────────
function TagsInput({ tags, onChange }: { tags: string[]; onChange: (v: string[]) => void }): React.ReactElement {
  const [draft, setDraft] = useState("")

  function commit(raw: string) {
    const t = raw.trim().replace(/,$/, "").trim()
    if (!t) return
    if (!tags.includes(t)) onChange([...tags, t])
    setDraft("")
  }

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "var(--space-2)",
        alignItems: "center",
        padding: "6px 8px",
        minHeight: 44,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 5,
      }}
    >
      {tags.map(t => (
        <span
          key={t}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "var(--accent-subtle)",
            color: "var(--accent)",
            borderRadius: 6,
            padding: "4px 8px",
            fontSize: "var(--text-sm)",
          }}
        >
          {t}
          <button
            type="button"
            onClick={() => onChange(tags.filter(x => x !== t))}
            aria-label={`Remove ${t}`}
            style={{
              background: "none",
              border: "none",
              color: "var(--accent)",
              cursor: "pointer",
              fontSize: 15,
              lineHeight: 1,
              padding: 0,
            }}
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault()
            commit(draft)
          } else if (e.key === "Backspace" && draft === "" && tags.length) {
            onChange(tags.slice(0, -1))
          }
        }}
        onBlur={() => commit(draft)}
        placeholder={tags.length ? "" : "Type and press Enter…"}
        style={{
          flex: 1,
          minWidth: 120,
          border: "none",
          outline: "none",
          background: "transparent",
          color: "var(--text)",
          fontSize: "var(--text-base)",
          padding: "4px 2px",
        }}
      />
    </div>
  )
}

// ── Password: reveal (show/hide) + copy pair, each 44px ──────────────────────
function PasswordInput({
  value,
  onChange,
  isEdit,
}: {
  value: string
  onChange: (v: string) => void
  isEdit: boolean
}): React.ReactElement {
  const [show, setShow] = useState(false)
  const [copied, setCopied] = useState(false)

  async function copy() {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      /* clipboard blocked */
    }
  }

  const iconBtn: React.CSSProperties = {
    minWidth: 44,
    minHeight: 44,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    color: "var(--muted)",
    cursor: "pointer",
    fontSize: 13,
    flexShrink: 0,
  }

  return (
    <div>
      <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "stretch" }}>
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={e => onChange(e.target.value)}
          autoComplete="new-password"
          placeholder={isEdit ? "Leave blank to keep current" : "Enter secret…"}
          style={{ flex: 1, minWidth: 0, fontFamily: show ? "var(--mono)" : undefined }}
        />
        <button type="button" onClick={() => setShow(s => !s)} style={iconBtn} title={show ? "Hide" : "Show"} aria-label={show ? "Hide" : "Show"}>
          {show ? "Hide" : "Show"}
        </button>
        <button type="button" onClick={copy} style={iconBtn} title="Copy" aria-label="Copy" disabled={!value}>
          {copied ? "✓" : "Copy"}
        </button>
      </div>
    </div>
  )
}

// ── Staged upload (pre-create): queue File[] for post-create upload ──────────
function StagedUpload({ files, onChange }: { files: File[]; onChange: (v: File[]) => void }): React.ReactElement {
  return (
    <div>
      <label
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          minHeight: 44,
          padding: "0 16px",
          borderRadius: 6,
          border: "1px dashed var(--border)",
          background: "var(--surface)",
          color: "var(--muted)",
          cursor: "pointer",
          fontSize: "var(--text-sm)",
        }}
      >
        + Add file / photo
        <input
          type="file"
          multiple
          accept="image/*,application/pdf"
          style={{ display: "none" }}
          onChange={e => {
            const picked = Array.from(e.target.files ?? [])
            if (picked.length) onChange([...files, ...picked])
            e.target.value = ""
          }}
        />
      </label>
      {files.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
          {files.map((f, i) => (
            <div
              key={`${f.name}-${i}`}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                fontSize: "var(--text-sm)",
                color: "var(--text)",
                background: "var(--card)",
                borderRadius: 6,
                padding: "6px 10px",
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📎 {f.name}</span>
              <button
                type="button"
                onClick={() => onChange(files.filter((_, idx) => idx !== i))}
                style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 16, lineHeight: 1 }}
                aria-label={`Remove ${f.name}`}
              >
                ×
              </button>
            </div>
          ))}
          <div style={hintStyle}>Uploads after the record is created.</div>
        </div>
      )}
    </div>
  )
}
