"use client"

import { useEffect, useRef, useState } from "react"

type Attachment = {
  id: string
  originalName: string
  mimeType: string
  size: number
  notes: string | null
  createdAt: string
}

interface Props {
  entityType: "asset" | "vendor" | "location" | "vendorContract"
  entityId: string
  /** Compact = inline area on a detail page; full = bigger drop zone. */
  compact?: boolean
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function mimeIcon(mime: string): string {
  if (mime.startsWith("image/")) return "🖼"
  if (mime === "application/pdf") return "📄"
  if (mime.includes("word")) return "📝"
  if (mime.includes("sheet") || mime.includes("excel")) return "📊"
  if (mime.includes("zip") || mime.includes("tar")) return "🗜"
  return "📎"
}

/**
 * Reusable file attachment widget. Renders a list of files attached to
 * the given entity + a drop zone (or button in compact mode) for new
 * uploads. Files stream via /api/attachments and download via
 * /api/attachments/[id]. 25MB cap matches the server.
 */
export default function AttachmentsPanel({ entityType, entityId, compact }: Props) {
  const [items, setItems] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`/api/attachments?entityType=${entityType}&entityId=${entityId}`)
      .then(r => r.ok ? r.json() : [])
      .then(setItems)
      .catch(() => {})
  }, [entityType, entityId])

  async function upload(file: File, notes?: string) {
    setErr(null)
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("entityType", entityType)
      fd.append("entityId", entityId)
      if (notes) fd.append("notes", notes)
      const res = await fetch("/api/attachments", { method: "POST", body: fd })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setErr(j.error || `Upload failed (${res.status})`)
        return
      }
      const created = await res.json()
      setItems(prev => [created, ...prev])
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this file?")) return
    const res = await fetch(`/api/attachments/${id}`, { method: "DELETE" })
    if (res.ok) setItems(prev => prev.filter(a => a.id !== id))
  }

  return (
    <div style={{
      background: "var(--color-background-secondary)",
      border: "0.5px solid var(--color-border-tertiary)",
      borderRadius: 10, padding: compact ? 12 : 16,
      marginTop: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>
          Attachments {items.length > 0 && <span style={{ color: "var(--color-text-muted)" }}>({items.length})</span>}
        </div>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          style={{
            fontSize: 12, padding: "4px 10px", borderRadius: 6,
            border: "0.5px solid var(--color-border-secondary)",
            background: "var(--color-background-primary)",
            color: "var(--color-text-primary)", cursor: "pointer",
            opacity: uploading ? 0.6 : 1,
          }}
        >
          {uploading ? "Uploading..." : "+ Upload"}
        </button>
        <input
          ref={inputRef}
          type="file"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) upload(f)
          }}
        />
      </div>

      {err && (
        <div style={{ fontSize: 12, color: "#dc2626", marginBottom: 8 }}>
          {err}
        </div>
      )}

      {items.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", padding: "8px 0" }}>
          No files attached yet.
        </div>
      ) : (
        <div>
          {items.map(a => (
            <div
              key={a.id}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "8px 0", borderBottom: "0.5px solid var(--color-border-tertiary)",
              }}
            >
              <span style={{ fontSize: 18, lineHeight: 1 }}>{mimeIcon(a.mimeType)}</span>
              <a
                href={`/api/attachments/${a.id}`}
                style={{ flex: 1, fontSize: 13, color: "var(--color-text-primary)", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >
                {a.originalName}
              </a>
              <span style={{ fontSize: 11, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
                {formatBytes(a.size)}
              </span>
              <button
                onClick={() => remove(a.id)}
                style={{
                  fontSize: 11, color: "var(--color-text-danger)",
                  background: "none", border: "none", cursor: "pointer",
                }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
