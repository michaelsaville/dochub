"use client"

import React, { useState } from "react"
import FlexFieldInput from "./FlexFieldInput"
import { type FlexField } from "./types"

// =============================================================================
// FlexLayoutPreview — a live, read-only mock of the record CREATE form for the
// layout being designed. It reuses the exact same FlexFieldInput the real
// FlexAssetForm mounts, so the preview always matches production rendering with
// zero duplicated field logic.
//
// The whole field body is `inert` + pointer-events:none: it never submits,
// never opens the relation picker (so it never hits an API), and needs no real
// asset. Upload fields fall back to the network-free staged-file affordance
// because no flexAssetId is passed. The local `values` state only exists to keep
// the reused controlled inputs happy — being inert, it never actually changes.
// =============================================================================

type PreviewField = FlexField & { _uid?: string }

type Props = {
  fields: PreviewField[]
  layoutName: string
  layoutIcon: string
  layoutColor: string
}

const cardStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: "var(--space-5)",
}

export default function FlexLayoutPreview({
  fields,
  layoutName,
  layoutIcon,
  layoutColor,
}: Props): React.ReactElement {
  const [values, setValues] = useState<Record<string, unknown>>({})
  const accent = layoutColor || "var(--accent)"

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ fontSize: "var(--text-lg)", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
          <span aria-hidden style={{ fontSize: 18 }}>{layoutIcon || "📄"}</span>
          Live preview
        </div>
        <span style={{ fontSize: "var(--text-xs)", color: "var(--muted)" }}>read-only</span>
      </div>
      <div style={{ fontSize: "var(--text-xs)", color: "var(--muted)", marginBottom: "var(--space-3)" }}>
        How the “New {layoutName || "record"}” form looks with the fields below.
      </div>

      {/* Non-interactive mirror of the real create form body. */}
      <div
        inert
        aria-hidden
        style={{
          pointerEvents: "none",
          userSelect: "none",
          borderTop: `2px solid ${accent}`,
          borderRadius: 10,
          padding: "var(--space-4)",
          background: "var(--card)",
        }}
      >
        {/* Mirror the create form chrome: client picker sits above the fields. */}
        <div className="field">
          <label>
            Client <span style={{ color: "var(--danger)" }}>*</span>
          </label>
          <select disabled defaultValue="">
            <option value="">— Select client —</option>
          </select>
        </div>

        {fields.length === 0 ? (
          <div style={{ fontSize: "var(--text-sm)", color: "var(--muted)" }}>
            Add fields on the left to see them here.
          </div>
        ) : (
          fields.map((f, i) => (
            <FlexFieldInput
              key={f._uid ?? f.key ?? i}
              field={f}
              value={values[f.key]}
              onChange={v => setValues(prev => ({ ...prev, [f.key]: v }))}
            />
          ))
        )}
      </div>
    </div>
  )
}
