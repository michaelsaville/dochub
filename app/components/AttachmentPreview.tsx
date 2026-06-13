"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"
import type { JSX } from "react"

// =============================================================================
// Shared file-preview component for DocHub attachments.
//
// One module exports a set of pure helpers (classification, href builders,
// byte formatting), a small <FileThumb> tile reused in file lists, and the
// full-screen <AttachmentPreview> lightbox (default export). Office formats
// (docx/xlsx) are rendered client-side via dynamically-imported mammoth/xlsx
// so those heavy libs are code-split out of the initial bundle.
// =============================================================================

export type PreviewFile = {
  id: string
  originalName: string
  mimeType: string
  detectedMime?: string | null
  size: number
  previewable?: boolean
  width?: number | null
  height?: number | null
}

export type PreviewKind = "image" | "pdf" | "text" | "docx" | "xlsx" | "csv" | "none"

// Pick the most reliable mime: the server-sniffed one wins over the
// client-claimed Content-Type when present.
function effectiveMime(file: PreviewFile): string {
  return (file.detectedMime ?? file.mimeType ?? "").toLowerCase()
}

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
const XLS_MIME = "application/vnd.ms-excel"

export function previewKindOf(file: PreviewFile): PreviewKind {
  const mime = effectiveMime(file)
  if (!mime) return "none"

  // SVG is intentionally NOT treated as an image here — it can carry script,
  // so we let it download rather than render inline.
  if (mime.startsWith("image/")) {
    if (mime.includes("svg")) return "none"
    return "image"
  }
  if (mime === "application/pdf") return "pdf"

  if (mime === "text/csv" || mime === "application/csv") return "csv"
  if (mime === DOCX_MIME) return "docx"
  if (mime === XLSX_MIME || mime === XLS_MIME) return "xlsx"

  // Plain-text family (incl. common application/* text formats).
  if (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/xml" ||
    mime === "application/javascript" ||
    mime === "application/x-yaml" ||
    mime === "application/x-sh"
  ) {
    return "text"
  }

  return "none"
}

export function canPreview(file: PreviewFile): boolean {
  return previewKindOf(file) !== "none"
}

export function fileEmoji(file: PreviewFile): string {
  const kind = previewKindOf(file)
  switch (kind) {
    case "image": return "🖼"
    case "pdf": return "📄"
    case "docx": return "📝"
    case "xlsx": return "📊"
    case "csv": return "📊"
    case "text": return "📄"
    default: break
  }
  // Fall back to a few mime-based hints for non-previewable files.
  const mime = effectiveMime(file)
  if (mime.includes("word") || mime.includes("document")) return "📝"
  if (mime.includes("sheet") || mime.includes("excel")) return "📊"
  if (mime.includes("zip") || mime.includes("compressed") || mime.includes("tar")) return "🗜"
  if (mime.startsWith("audio/")) return "🎵"
  if (mime.startsWith("video/")) return "🎬"
  return "📎"
}

export function inlineHref(id: string): string {
  return `/api/attachments/${id}?disposition=inline`
}

export function downloadHref(id: string): string {
  return `/api/attachments/${id}`
}

export function thumbHref(id: string): string {
  return `/api/attachments/${id}/thumbnail`
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—"
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`
}

// -----------------------------------------------------------------------------
// FileThumb — small icon/thumbnail tile reused in file lists.
// Raster images AND PDFs (page-1 render) get the server webp thumbnail with an
// emoji fallback on error; everything else just renders the emoji.
// -----------------------------------------------------------------------------
export function FileThumb({ file, size = 40 }: { file: PreviewFile; size?: number }): JSX.Element {
  const [errored, setErrored] = useState(false)
  const kind = previewKindOf(file)
  const hasThumb = kind === "image" || kind === "pdf"

  const box: React.CSSProperties = {
    width: size,
    height: size,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    overflow: "hidden",
    background: "var(--color-background-secondary)",
    border: "0.5px solid var(--color-border-tertiary)",
    fontSize: Math.round(size * 0.5),
    lineHeight: 1,
  }

  if (hasThumb && !errored) {
    return (
      <div style={box}>
        <img
          src={thumbHref(file.id)}
          alt={file.originalName}
          width={size}
          height={size}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          onError={() => setErrored(true)}
        />
      </div>
    )
  }

  return <div style={box} aria-hidden>{fileEmoji(file)}</div>
}

// -----------------------------------------------------------------------------
// Internal: naive CSV parser (handles simple quoted fields). Capped row count
// is enforced by the caller.
// -----------------------------------------------------------------------------
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ",") {
      row.push(field); field = ""
    } else if (c === "\n") {
      row.push(field); field = ""
      rows.push(row); row = []
    } else if (c === "\r") {
      // ignore; handled by following \n
    } else {
      field += c
    }
  }
  // flush trailing field/row
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

const MAX_TEXT_CHARS = 500_000
const MAX_CSV_ROWS = 1000

type Loaded =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "text"; text: string; truncated: boolean }
  | { status: "csv"; rows: string[][]; truncated: boolean }
  | { status: "docx"; html: string }
  | { status: "xlsx"; sheets: { name: string; html: string }[] }

// -----------------------------------------------------------------------------
// AttachmentPreview — full-screen lightbox / preview modal.
// -----------------------------------------------------------------------------
export default function AttachmentPreview({
  file,
  files,
  onClose,
  onNavigate,
}: {
  file: PreviewFile | null
  files?: PreviewFile[]
  onClose: () => void
  onNavigate?: (next: PreviewFile) => void
}): JSX.Element | null {
  const [loaded, setLoaded] = useState<Loaded>({ status: "idle" })
  const [activeSheet, setActiveSheet] = useState(0)
  const [zoom, setZoom] = useState(false)

  const kind = file ? previewKindOf(file) : "none"

  // --- lightbox navigation ---
  const canNavigate = Boolean(files && files.length > 1 && onNavigate && file)
  const index = canNavigate ? files!.findIndex(f => f.id === file!.id) : -1
  const goPrev = useCallback(() => {
    if (!canNavigate || index < 0) return
    const next = files![(index - 1 + files!.length) % files!.length]
    onNavigate!(next)
  }, [canNavigate, index, files, onNavigate])
  const goNext = useCallback(() => {
    if (!canNavigate || index < 0) return
    const next = files![(index + 1) % files!.length]
    onNavigate!(next)
  }, [canNavigate, index, files, onNavigate])

  // --- keyboard handling ---
  useEffect(() => {
    if (!file) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); onClose() }
      else if (e.key === "ArrowLeft") goPrev()
      else if (e.key === "ArrowRight") goNext()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [file, onClose, goPrev, goNext])

  // --- reset per-file view state ---
  useEffect(() => {
    setActiveSheet(0)
    setZoom(false)
  }, [file?.id])

  // --- fetch-based viewers (text/csv/docx/xlsx) ---
  useEffect(() => {
    if (!file) { setLoaded({ status: "idle" }); return }
    if (kind === "image" || kind === "pdf" || kind === "none") {
      setLoaded({ status: "idle" })
      return
    }

    let cancelled = false
    setLoaded({ status: "loading" })

    ;(async () => {
      try {
        const res = await fetch(downloadHref(file.id))
        if (!res.ok) throw new Error(`HTTP ${res.status}`)

        if (kind === "text") {
          let text = await res.text()
          const truncated = text.length > MAX_TEXT_CHARS
          if (truncated) text = text.slice(0, MAX_TEXT_CHARS)
          if (!cancelled) setLoaded({ status: "text", text, truncated })
          return
        }

        if (kind === "csv") {
          const raw = await res.text()
          let rows = parseCsv(raw)
          const truncated = rows.length > MAX_CSV_ROWS
          if (truncated) rows = rows.slice(0, MAX_CSV_ROWS)
          if (!cancelled) setLoaded({ status: "csv", rows, truncated })
          return
        }

        const buf = await res.arrayBuffer()

        if (kind === "docx") {
          const mod = await import("mammoth")
          const mammoth: any = (mod as any).default ?? mod
          const result = await mammoth.convertToHtml({ arrayBuffer: buf })
          if (!cancelled) setLoaded({ status: "docx", html: result.value || "<p>(empty document)</p>" })
          return
        }

        if (kind === "xlsx") {
          const XLSX: any = await import("xlsx")
          const wb = XLSX.read(buf, { type: "array" })
          const sheets: { name: string; html: string }[] = (wb.SheetNames as string[]).map((name) => ({
            name,
            html: XLSX.utils.sheet_to_html(wb.Sheets[name]),
          }))
          if (!cancelled) setLoaded({ status: "xlsx", sheets: sheets.length ? sheets : [{ name: "Sheet1", html: "<i>(empty)</i>" }] })
          return
        }
      } catch {
        if (!cancelled) setLoaded({ status: "error" })
      }
    })()

    return () => { cancelled = true }
  }, [file?.id, kind])

  if (!file) return null

  // --- shared chrome styles ---
  const backdrop: React.CSSProperties = {
    position: "fixed", inset: 0, zIndex: 1000,
    background: "rgba(0,0,0,0.72)",
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: 24,
  }
  const panel: React.CSSProperties = {
    position: "relative",
    width: "min(1100px, 92vw)",
    maxHeight: "90vh",
    display: "flex", flexDirection: "column",
    background: "var(--color-background-primary)",
    border: "0.5px solid var(--color-border-secondary)",
    borderRadius: 12,
    overflow: "hidden",
    boxShadow: "0 12px 48px rgba(0,0,0,0.45)",
  }
  const headerBtn: React.CSSProperties = {
    fontSize: 13, padding: "6px 12px", borderRadius: 7,
    border: "0.5px solid var(--color-border-secondary)",
    background: "var(--color-background-primary)",
    color: "var(--color-text-primary)", cursor: "pointer",
    textDecoration: "none", whiteSpace: "nowrap",
  }
  const navBtn: React.CSSProperties = {
    position: "absolute", top: "50%", transform: "translateY(-50%)",
    zIndex: 5, width: 44, height: 44, borderRadius: "50%",
    border: "none", background: "rgba(0,0,0,0.45)", color: "#fff",
    fontSize: 24, cursor: "pointer", display: "flex",
    alignItems: "center", justifyContent: "center",
  }

  function renderBody(): JSX.Element {
    // Loading / error states for the fetch-based viewers.
    if (loaded.status === "loading") {
      return <div style={{ padding: 48, textAlign: "center", color: "var(--color-text-secondary)", fontSize: 14 }}>Loading preview…</div>
    }
    if (loaded.status === "error") {
      return (
        <div style={{ padding: 48, textAlign: "center" }}>
          <div style={{ fontSize: 14, color: "var(--color-text-secondary)", marginBottom: 16 }}>
            Couldn&apos;t render preview — download instead.
          </div>
          <a href={downloadHref(file!.id)} download={file!.originalName} style={{ ...headerBtn, display: "inline-block" }}>
            ⬇ Download
          </a>
        </div>
      )
    }

    if (kind === "image") {
      return (
        <div
          style={{
            flex: 1, minHeight: 0, overflow: "auto",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "#111", padding: 16,
          }}
          onClick={() => setZoom(z => !z)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={inlineHref(file!.id)}
            alt={file!.originalName}
            style={{
              maxWidth: zoom ? "none" : "100%",
              maxHeight: zoom ? "none" : "calc(90vh - 120px)",
              width: zoom ? "auto" : undefined,
              objectFit: "contain",
              cursor: zoom ? "zoom-out" : "zoom-in",
              display: "block",
            }}
          />
        </div>
      )
    }

    if (kind === "pdf") {
      return (
        <iframe
          src={inlineHref(file!.id)}
          title={file!.originalName}
          sandbox="allow-scripts allow-same-origin allow-popups allow-downloads"
          style={{ flex: 1, minHeight: 0, width: "100%", border: "none", background: "#fff" }}
        />
      )
    }

    if (loaded.status === "text") {
      return (
        <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 16 }}>
          {loaded.truncated && (
            <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 8 }}>
              Showing the first {formatBytes(MAX_TEXT_CHARS)} of a larger file.
            </div>
          )}
          <pre style={{
            margin: 0, fontFamily: "monospace", fontSize: 13, lineHeight: 1.6,
            whiteSpace: "pre-wrap", wordBreak: "break-word",
            color: "var(--color-text-primary)",
          }}>
            {loaded.text}
          </pre>
        </div>
      )
    }

    if (loaded.status === "csv") {
      return (
        <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 16 }}>
          {loaded.truncated && (
            <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 8 }}>
              Showing the first {MAX_CSV_ROWS} rows.
            </div>
          )}
          <table style={{ borderCollapse: "collapse", fontSize: 13, color: "var(--color-text-primary)" }}>
            <tbody>
              {loaded.rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((cell, ci) => {
                    const Tag = ri === 0 ? "th" : "td"
                    return (
                      <Tag key={ci} style={{
                        border: "0.5px solid var(--color-border-tertiary)",
                        padding: "4px 8px", textAlign: "left",
                        background: ri === 0 ? "var(--color-background-secondary)" : "transparent",
                        fontWeight: ri === 0 ? 600 : 400,
                        whiteSpace: "nowrap",
                      }}>
                        {cell}
                      </Tag>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

    if (loaded.status === "docx") {
      return (
        <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "24px 28px", background: "#fff" }}>
          <div
            style={{ fontSize: 14, lineHeight: 1.7, color: "#1a1a1a", maxWidth: 760, margin: "0 auto" }}
            // mammoth emits sanitized markup; rendered into a plain div, never the page head.
            dangerouslySetInnerHTML={{ __html: loaded.html }}
          />
        </div>
      )
    }

    if (loaded.status === "xlsx") {
      const sheet = loaded.sheets[Math.min(activeSheet, loaded.sheets.length - 1)]
      return (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          {loaded.sheets.length > 1 && (
            <div style={{ display: "flex", gap: 4, padding: "8px 12px", borderBottom: "0.5px solid var(--color-border-tertiary)", overflowX: "auto", flexShrink: 0 }}>
              {loaded.sheets.map((s, i) => (
                <button
                  key={s.name + i}
                  onClick={() => setActiveSheet(i)}
                  style={{
                    fontSize: 12, padding: "4px 12px", borderRadius: 6, cursor: "pointer",
                    border: "0.5px solid var(--color-border-secondary)",
                    background: i === activeSheet ? "var(--color-text-primary)" : "var(--color-background-primary)",
                    color: i === activeSheet ? "var(--color-background-primary)" : "var(--color-text-secondary)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
          <div
            className="xlsx-preview"
            style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 16, background: "#fff", color: "#1a1a1a", fontSize: 13 }}
            // SheetJS sheet_to_html emits sanitized table markup.
            dangerouslySetInnerHTML={{ __html: sheet?.html ?? "" }}
          />
        </div>
      )
    }

    // kind === "none"
    return (
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 48, textAlign: "center", gap: 16 }}>
        <div style={{ fontSize: 56, lineHeight: 1 }}>{fileEmoji(file!)}</div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 500, color: "var(--color-text-primary)", marginBottom: 4 }}>{file!.originalName}</div>
          <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
            {formatBytes(file!.size)} · {effectiveMime(file!) || "unknown type"}
          </div>
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 8 }}>No inline preview for this file type.</div>
        </div>
        <a href={downloadHref(file!.id)} download={file!.originalName} style={{
          ...headerBtn, display: "inline-block", fontSize: 14, fontWeight: 500, padding: "10px 22px",
          background: "var(--color-text-primary)", color: "var(--color-background-primary)", border: "none",
        }}>
          ⬇ Download
        </a>
      </div>
    )
  }

  return (
    <div style={backdrop} onClick={onClose} role="dialog" aria-modal="true">
      <div style={panel} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "12px 16px", flexShrink: 0,
          borderBottom: "0.5px solid var(--color-border-tertiary)",
          background: "var(--color-background-secondary)",
        }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>{fileEmoji(file)}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {file.originalName}
            </div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
              {formatBytes(file.size)}
              {canNavigate && index >= 0 ? ` · ${index + 1} of ${files!.length}` : ""}
            </div>
          </div>
          <a href={downloadHref(file.id)} download={file.originalName} style={headerBtn}>⬇ Download</a>
          <button onClick={onClose} title="Close (Esc)" style={{
            ...headerBtn, padding: "4px 11px", fontSize: 18, lineHeight: 1,
          }}>×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", position: "relative" }}>
          {canNavigate && (
            <>
              <button onClick={goPrev} title="Previous (←)" style={{ ...navBtn, left: 10 }}>‹</button>
              <button onClick={goNext} title="Next (→)" style={{ ...navBtn, right: 10 }}>›</button>
            </>
          )}
          {renderBody()}
        </div>
      </div>
    </div>
  )
}
