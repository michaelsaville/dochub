"use client"

import React, { useState } from "react"
import {
  type FlexField,
  type FlexRelationValue,
  type FlexAttachment,
  expiryStatus,
  expiryLabel,
  relationHref,
} from "./types"

// =============================================================================
// FlexFieldValue — read-only render of one Flexible-Asset field value, for both
// the list cells (context="list") and the instance detail (context="detail").
//
//   • text / textarea / number  → CopyableText (one-tap copy)
//   • website                   → auto-linked <a>
//   • date (field.expires)      → value + colored expiry badge
//   • password                  → "••••" masked; on detail a Reveal→Copy→Hide
//                                 flow calls POST /api/flex-assets/[id]/reveal
//   • relation                  → >=44px chips linking to each target
//   • upload                    → attachment list (detail) / file count (list)
//   • checkbox / tags / select  → badge / chips
// =============================================================================

type Props = {
  field: FlexField
  value: unknown
  context?: "list" | "detail"
  /** relation targets for THIS field (detail) */
  relations?: FlexRelationValue[]
  /** attachments for THIS field (detail, upload type) */
  attachments?: FlexAttachment[]
  /** detail-only password reveal: fieldKey → decrypted value */
  reveal?: (fieldKey: string) => Promise<string | null>
}

const dash = <span style={{ color: "var(--muted)" }}>—</span>

export default function FlexFieldValue({
  field,
  value,
  context = "detail",
  relations,
  attachments,
  reveal,
}: Props): React.ReactElement {
  const isList = context === "list"

  switch (field.type) {
    // ── header: divider on detail, nothing in a list cell ───────────────────
    case "header":
      if (isList) return <>{dash}</>
      return (
        <div
          style={{
            margin: "var(--space-5) 0 var(--space-2)",
            borderTop: "1px solid var(--border)",
            paddingTop: "var(--space-4)",
            fontSize: "var(--text-sm)",
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--accent)",
          }}
        >
          {field.label}
        </div>
      )

    case "website": {
      const url = String(value ?? "").trim()
      if (!url) return <>{dash}</>
      const href = /^https?:\/\//i.test(url) ? url : `https://${url}`
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--accent)", textDecoration: "none", wordBreak: "break-all" }}
        >
          {url} ↗
        </a>
      )
    }

    case "checkbox":
      return value ? (
        <span className="badge-success">Yes</span>
      ) : (
        <span style={{ color: "var(--muted)", fontSize: "var(--text-sm)" }}>No</span>
      )

    case "date": {
      const s = String(value ?? "").trim()
      if (!s) return <>{dash}</>
      const d = new Date(s)
      const nice = isNaN(d.getTime()) ? s : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
      const exp = field.expires ? expiryStatus(s) : null
      return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span>{nice}</span>
          {exp && exp.level !== "ok" && (
            <span className={exp.level === "expired" ? "badge-danger" : "badge-warn"}>{expiryLabel(exp)}</span>
          )}
          {exp && exp.level === "ok" && !isList && (
            <span style={{ fontSize: "var(--text-xs)", color: "var(--muted)" }}>{expiryLabel(exp)}</span>
          )}
        </span>
      )
    }

    case "multiselect":
    case "tags": {
      const arr = Array.isArray(value) ? (value as string[]) : []
      if (arr.length === 0) return <>{dash}</>
      return (
        <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 6, justifyContent: isList ? "flex-end" : "flex-start" }}>
          {arr.map(t => (
            <span
              key={t}
              style={{
                background: "var(--accent-subtle)",
                color: "var(--accent)",
                borderRadius: 6,
                padding: "2px 8px",
                fontSize: "var(--text-xs)",
              }}
            >
              {t}
            </span>
          ))}
        </span>
      )
    }

    case "password":
      return <PasswordValue fieldKey={field.key} isList={isList} reveal={reveal} hasValue={!!value || context === "detail"} />

    case "relation": {
      const rels = relations ?? []
      if (rels.length === 0) return <>{dash}</>
      return (
        <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 8, justifyContent: isList ? "flex-end" : "flex-start" }}>
          {rels.map(r => {
            const href = relationHref(r.targetType, r.targetId)
            const label = r.label ?? r.targetId
            const chip: React.CSSProperties = {
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              minHeight: isList ? 0 : 44,
              padding: isList ? "2px 8px" : "0 12px",
              borderRadius: 8,
              background: "var(--card)",
              border: "1px solid var(--border)",
              color: href ? "var(--accent)" : "var(--text)",
              fontSize: "var(--text-sm)",
              textDecoration: "none",
            }
            return href ? (
              <a key={r.targetId} href={href} style={chip}>
                🔗 {label}
              </a>
            ) : (
              <span key={r.targetId} style={{ ...chip, color: "var(--text)" }}>
                🔗 {label}
              </span>
            )
          })}
        </span>
      )
    }

    case "upload": {
      const files = attachments ?? []
      if (isList) {
        return files.length ? (
          <span style={{ color: "var(--muted)" }}>{files.length} file{files.length === 1 ? "" : "s"}</span>
        ) : (
          <>{dash}</>
        )
      }
      if (files.length === 0) return <>{dash}</>
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {files.map(a => (
            <a
              key={a.id}
              href={`/api/attachments/${a.id}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                minHeight: 44,
                padding: "0 4px",
                color: "var(--accent)",
                textDecoration: "none",
                fontSize: "var(--text-sm)",
              }}
            >
              📎 {a.originalName}
            </a>
          ))}
        </div>
      )
    }

    case "textarea": {
      const s = String(value ?? "")
      if (!s.trim()) return <>{dash}</>
      if (isList) return <CopyableText text={s.length > 60 ? s.slice(0, 60) + "…" : s} copy={s} />
      return (
        <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: "var(--text-base)", color: "var(--text)" }}>
          <CopyableText text={s} copy={s} block />
        </div>
      )
    }

    // text / number and any fallthrough
    default: {
      const s = value == null ? "" : String(value)
      if (!s.trim()) return <>{dash}</>
      return <CopyableText text={s} copy={s} />
    }
  }
}

// ── one-tap-copy text (Hudu "CopyableText") ──────────────────────────────────
function CopyableText({ text, copy, block }: { text: string; copy: string; block?: boolean }): React.ReactElement {
  const [copied, setCopied] = useState(false)
  async function doCopy() {
    try {
      await navigator.clipboard.writeText(copy)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      /* clipboard blocked */
    }
  }
  return (
    <span
      onClick={doCopy}
      role="button"
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          doCopy()
        }
      }}
      title="Tap to copy"
      style={{
        display: block ? "block" : "inline-flex",
        alignItems: "center",
        gap: 6,
        cursor: "pointer",
        wordBreak: "break-word",
        color: "var(--text)",
      }}
    >
      {text}
      <span style={{ fontSize: "var(--text-xs)", color: copied ? "var(--accent2)" : "var(--muted)", flexShrink: 0 }}>
        {copied ? "✓ copied" : "⧉"}
      </span>
    </span>
  )
}

// ── password reveal flow (detail) / masked (list) ────────────────────────────
function PasswordValue({
  fieldKey,
  isList,
  reveal,
  hasValue,
}: {
  fieldKey: string
  isList: boolean
  reveal?: (fieldKey: string) => Promise<string | null>
  hasValue: boolean
}): React.ReactElement {
  const [revealed, setRevealed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const masked = <span style={{ fontFamily: "var(--mono)", letterSpacing: 1 }}>••••••••</span>

  if (isList || !reveal) return hasValue ? masked : <>{dash}</>

  async function doReveal() {
    setBusy(true)
    setErr(null)
    try {
      const v = await reveal!(fieldKey)
      if (v == null) setErr("Not permitted")
      else setRevealed(v)
    } catch {
      setErr("Reveal failed")
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    if (!revealed) return
    try {
      await navigator.clipboard.writeText(revealed)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      /* blocked */
    }
  }

  const btn: React.CSSProperties = {
    minHeight: 44,
    padding: "0 14px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--card)",
    color: "var(--muted)",
    cursor: "pointer",
    fontSize: "var(--text-sm)",
  }

  if (revealed == null) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {masked}
        <button type="button" onClick={doReveal} disabled={busy} style={btn}>
          {busy ? "Revealing…" : "🔓 Reveal"}
        </button>
        {err && <span style={{ fontSize: "var(--text-xs)", color: "var(--danger)" }}>{err}</span>}
      </span>
    )
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <code style={{ fontFamily: "var(--mono)", fontSize: "var(--text-sm)", wordBreak: "break-all", color: "var(--text)" }}>
        {revealed}
      </code>
      <button type="button" onClick={copy} style={btn}>
        {copied ? "✓ copied" : "⧉ Copy"}
      </button>
      <button type="button" onClick={() => setRevealed(null)} style={btn}>
        Hide
      </button>
    </span>
  )
}
