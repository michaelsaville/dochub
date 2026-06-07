"use client"

import React, { useEffect, useRef, useState, useCallback } from "react"
import AttachmentPreview, {
  PreviewFile,
  canPreview,
  fileEmoji,
  downloadHref,
  formatBytes,
  FileThumb,
} from "@/components/AttachmentPreview"

// Shape returned by GET /api/attachments?entityType=client&entityId=...
type FileItem = {
  id: string
  originalName: string
  mimeType: string
  detectedMime?: string | null
  size: number
  notes: string | null
  createdAt: string
  previewable?: boolean
  width?: number | null
  height?: number | null
  scanStatus?: string | null
  version: number
  portalVisible: boolean
  downloadCount?: number
}

type VersionRow = {
  id: string
  version: number
  originalName: string
  size: number
  mimeType: string
  createdAt: string
  isCurrent: boolean
}

type Upload = {
  key: string
  name: string
  pct: number
  error?: string | null
  done?: boolean
}

type SortKey = "name" | "date" | "size"

const MAX_BYTES = 100 * 1024 * 1024 // 100MB client-side cap

const btn: React.CSSProperties = {
  fontSize: 12,
  padding: "4px 10px",
  borderRadius: 6,
  border: "0.5px solid var(--color-border-secondary)",
  background: "var(--color-background-primary)",
  color: "var(--color-text-primary)",
  cursor: "pointer",
}

const ghostBtn: React.CSSProperties = {
  fontSize: 11,
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: 0,
  color: "var(--color-text-secondary)",
}

export default function ClientFilesPanel({ clientId }: { clientId: string }): React.JSX.Element {
  const [files, setFiles] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [sort, setSort] = useState<SortKey>("date")

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)

  const [preview, setPreview] = useState<PreviewFile | null>(null)

  const [uploads, setUploads] = useState<Record<string, Upload>>({})
  const [dragOver, setDragOver] = useState(false)
  const uploadKeyRef = useRef(0)

  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameVal, setRenameVal] = useState("")

  const [versionsOpen, setVersionsOpen] = useState<string | null>(null)
  const [versions, setVersions] = useState<Record<string, VersionRow[]>>({})
  const [versionsLoading, setVersionsLoading] = useState<string | null>(null)

  const [menuOpen, setMenuOpen] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const replaceRef = useRef<HTMLInputElement>(null)
  const replaceTargetRef = useRef<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/attachments?entityType=client&entityId=${clientId}`)
      if (!res.ok) {
        setErr(`Could not load files (${res.status})`)
        return
      }
      setErr(null)
      setFiles(await res.json())
    } catch {
      setErr("Could not load files.")
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => {
    load()
  }, [load])

  // ---- Upload (XHR for real progress) ----
  function uploadOne(file: File): Promise<void> {
    const key = `u${uploadKeyRef.current++}`

    if (file.size > MAX_BYTES) {
      setUploads(prev => ({
        ...prev,
        [key]: { key, name: file.name, pct: 0, error: `Too large — ${formatBytes(file.size)} exceeds the 100MB limit.`, done: true },
      }))
      return Promise.resolve()
    }

    setUploads(prev => ({ ...prev, [key]: { key, name: file.name, pct: 0 } }))

    return new Promise<void>(resolve => {
      const xhr = new XMLHttpRequest()
      const fd = new FormData()
      fd.append("file", file)
      fd.append("entityType", "client")
      fd.append("entityId", clientId)

      xhr.upload.onprogress = e => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100)
          setUploads(prev => (prev[key] ? { ...prev, [key]: { ...prev[key], pct } } : prev))
        }
      }
      xhr.onload = () => {
        if (xhr.status === 201 || xhr.status === 200) {
          try {
            const created = JSON.parse(xhr.responseText) as FileItem
            setFiles(prev => [created, ...prev])
          } catch {
            /* ignore parse, refresh below */
          }
          setUploads(prev => (prev[key] ? { ...prev, [key]: { ...prev[key], pct: 100, done: true } } : prev))
          // Drop the finished row after a beat.
          setTimeout(() => setUploads(prev => {
            const next = { ...prev }
            delete next[key]
            return next
          }), 1200)
        } else {
          let msg = `Upload failed (${xhr.status})`
          try {
            const j = JSON.parse(xhr.responseText)
            if (j.error) msg = xhr.status === 422 ? `Rejected: ${j.error}` : j.error
          } catch {
            /* keep default */
          }
          setUploads(prev => (prev[key] ? { ...prev, [key]: { ...prev[key], error: msg, done: true } } : prev))
        }
        resolve()
      }
      xhr.onerror = () => {
        setUploads(prev => (prev[key] ? { ...prev, [key]: { ...prev[key], error: "Network error during upload.", done: true } } : prev))
        resolve()
      }
      xhr.open("POST", "/api/attachments")
      xhr.send(fd)
    })
  }

  async function uploadMany(list: FileList | File[]) {
    const arr = Array.from(list)
    if (!arr.length) return
    await Promise.allSettled(arr.map(uploadOne))
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files?.length) uploadMany(e.dataTransfer.files)
  }

  function onPaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items
    if (!items) return
    const imgs: File[] = []
    for (const it of Array.from(items)) {
      if (it.kind === "file" && it.type.startsWith("image/")) {
        const f = it.getAsFile()
        if (f) {
          // Clipboard images are typically named "image.png"; keep it but stamp time so they don't collide.
          const stamped = new File([f], f.name || `pasted-${Date.now()}.png`, { type: f.type })
          imgs.push(stamped)
        }
      }
    }
    if (imgs.length) {
      e.preventDefault()
      uploadMany(imgs)
    }
  }

  // ---- Per-file mutations ----
  async function rename(id: string) {
    const name = renameVal.trim()
    setRenamingId(null)
    if (!name) return
    const res = await fetch(`/api/attachments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ originalName: name }),
    })
    if (res.ok) {
      const updated = await res.json()
      setFiles(prev => prev.map(f => (f.id === id ? { ...f, ...updated } : f)))
    }
  }

  async function togglePortal(file: FileItem) {
    const res = await fetch(`/api/attachments/${file.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ portalVisible: !file.portalVisible }),
    })
    if (res.ok) {
      const updated = await res.json()
      setFiles(prev => prev.map(f => (f.id === file.id ? { ...f, ...updated } : f)))
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this file? This cannot be undone.")) return
    const res = await fetch(`/api/attachments/${id}`, { method: "DELETE" })
    if (res.ok) {
      setFiles(prev => prev.filter(f => f.id !== id))
      setSelected(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  function triggerReplace(id: string) {
    replaceTargetRef.current = id
    replaceRef.current?.click()
  }

  async function doReplace(file: File) {
    const id = replaceTargetRef.current
    if (!id) return
    const fd = new FormData()
    fd.append("file", file)
    const res = await fetch(`/api/attachments/${id}/replace`, { method: "POST", body: fd })
    if (res.ok) {
      const updated = await res.json()
      setFiles(prev => prev.map(f => (f.id === id ? { ...f, ...updated } : f)))
      // Bust any cached version list.
      setVersions(prev => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      if (versionsOpen === id) fetchVersions(id)
    } else {
      const j = await res.json().catch(() => ({}))
      alert(j.error || "Replace failed.")
    }
    replaceTargetRef.current = null
  }

  async function fetchVersions(id: string) {
    setVersionsLoading(id)
    try {
      const res = await fetch(`/api/attachments/${id}/versions`)
      if (res.ok) {
        const list = (await res.json()) as VersionRow[]
        setVersions(prev => ({ ...prev, [id]: list }))
      }
    } finally {
      setVersionsLoading(null)
    }
  }

  function toggleVersions(id: string) {
    const next = versionsOpen === id ? null : id
    setVersionsOpen(next)
    if (next && !versions[id]) fetchVersions(id)
  }

  // ---- Bulk ----
  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function bulkDelete() {
    const ids = Array.from(selected)
    if (!ids.length) return
    if (!confirm(`Delete ${ids.length} file${ids.length > 1 ? "s" : ""}? This cannot be undone.`)) return
    setBulkBusy(true)
    try {
      const res = await fetch("/api/attachments/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", ids }),
      })
      if (res.ok) {
        setFiles(prev => prev.filter(f => !selected.has(f.id)))
        setSelected(new Set())
      } else {
        alert("Bulk delete failed.")
      }
    } finally {
      setBulkBusy(false)
    }
  }

  async function bulkZip() {
    const ids = Array.from(selected)
    if (!ids.length) return
    setBulkBusy(true)
    try {
      const res = await fetch("/api/attachments/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "zip", ids, name: "client-files.zip" }),
      })
      if (!res.ok) {
        alert("Could not build zip.")
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "client-files.zip"
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } finally {
      setBulkBusy(false)
    }
  }

  // ---- Derived list ----
  const q = search.trim().toLowerCase()
  const filtered = files.filter(f => {
    if (!q) return true
    return (
      f.originalName.toLowerCase().includes(q) ||
      (f.notes ?? "").toLowerCase().includes(q)
    )
  })
  const sorted = [...filtered].sort((a, b) => {
    if (sort === "name") return a.originalName.localeCompare(b.originalName)
    if (sort === "size") return b.size - a.size
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  const previewable = sorted.filter(f => canPreview(f))
  const uploadList = Object.values(uploads)
  const allSelected = sorted.length > 0 && sorted.every(f => selected.has(f.id))

  function openPreview(f: FileItem) {
    if (!canPreview(f)) {
      window.location.href = downloadHref(f.id)
      return
    }
    setPreview(f)
  }

  return (
    <div
      onPaste={onPaste}
      style={{
        background: "var(--color-background-secondary)",
        border: "0.5px solid var(--color-border-tertiary)",
        borderRadius: 10,
        padding: 16,
        marginTop: 12,
      }}
    >
      {/* Header / controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>
          Files {files.length > 0 && <span style={{ color: "var(--color-text-muted)" }}>({files.length})</span>}
        </div>
        <div style={{ flex: 1 }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search files…"
          style={{
            fontSize: 12,
            padding: "4px 10px",
            borderRadius: 6,
            border: "0.5px solid var(--color-border-secondary)",
            background: "var(--color-background-primary)",
            color: "var(--color-text-primary)",
            width: 180,
            boxSizing: "border-box",
          }}
        />
        <select
          value={sort}
          onChange={e => setSort(e.target.value as SortKey)}
          title="Sort"
          style={{
            fontSize: 12,
            padding: "4px 8px",
            borderRadius: 6,
            border: "0.5px solid var(--color-border-secondary)",
            background: "var(--color-background-primary)",
            color: "var(--color-text-primary)",
            cursor: "pointer",
          }}
        >
          <option value="date">Newest</option>
          <option value="name">Name</option>
          <option value="size">Size</option>
        </select>
        <button onClick={() => inputRef.current?.click()} style={btn}>
          + Upload
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          style={{ display: "none" }}
          onChange={e => {
            if (e.target.files?.length) uploadMany(e.target.files)
            e.target.value = ""
          }}
        />
        <input
          ref={replaceRef}
          type="file"
          style={{ display: "none" }}
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) doReplace(f)
            e.target.value = ""
          }}
        />
      </div>

      {err && (
        <div style={{ fontSize: 12, color: "var(--color-text-danger)", marginBottom: 10 }}>{err}</div>
      )}

      {/* Bulk toolbar */}
      {selected.size > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 12px",
            marginBottom: 10,
            borderRadius: 8,
            background: "var(--color-background-primary)",
            border: "0.5px solid var(--color-border-secondary)",
          }}
        >
          <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
            {selected.size} selected
          </span>
          <button onClick={bulkZip} disabled={bulkBusy} style={btn}>
            ⬇ Download as .zip
          </button>
          <button
            onClick={bulkDelete}
            disabled={bulkBusy}
            style={{ ...btn, color: "var(--color-text-danger)" }}
          >
            🗑 Delete selected
          </button>
          <div style={{ flex: 1 }} />
          <button onClick={() => setSelected(new Set())} style={ghostBtn}>
            Clear
          </button>
        </div>
      )}

      {/* Drop zone */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={e => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        style={{
          border: `1.5px dashed ${dragOver ? "var(--color-text-secondary)" : "var(--color-border-secondary)"}`,
          borderRadius: 8,
          padding: "14px 16px",
          textAlign: "center",
          cursor: "pointer",
          background: dragOver ? "var(--color-background-hover)" : "transparent",
          marginBottom: 12,
          transition: "all 0.15s",
        }}
      >
        <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
          Drop files here, paste a screenshot, or click to upload (max 100MB each)
        </span>
      </div>

      {/* In-flight uploads */}
      {uploadList.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
          {uploadList.map(u => (
            <div
              key={u.key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 12px",
                borderRadius: 7,
                background: "var(--color-background-primary)",
                border: "0.5px solid var(--color-border-tertiary)",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12,
                    color: u.error ? "var(--color-text-danger)" : "var(--color-text-primary)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {u.name}
                </div>
                {u.error ? (
                  <div style={{ fontSize: 11, color: "var(--color-text-danger)", marginTop: 2 }}>{u.error}</div>
                ) : (
                  <div
                    style={{
                      height: 4,
                      borderRadius: 2,
                      background: "var(--color-border-tertiary)",
                      marginTop: 5,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${u.pct}%`,
                        background: "var(--color-text-secondary)",
                        transition: "width 0.15s",
                      }}
                    />
                  </div>
                )}
              </div>
              <span style={{ fontSize: 11, color: "var(--color-text-muted)", flexShrink: 0 }}>
                {u.error ? "Failed" : u.done ? "Done" : `${u.pct}%`}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Select-all row */}
      {sorted.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() => {
              setSelected(allSelected ? new Set() : new Set(sorted.map(f => f.id)))
            }}
          />
          <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
            {allSelected ? "Deselect all" : "Select all"}
            {q && ` (${sorted.length} match${sorted.length === 1 ? "" : "es"})`}
          </span>
        </div>
      )}

      {/* List / empty / loading */}
      {loading ? (
        <div style={{ fontSize: 13, color: "var(--color-text-secondary)", padding: "8px 0" }}>Loading…</div>
      ) : sorted.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--color-text-secondary)", padding: "16px 0", textAlign: "center" }}>
          {q ? "No files match your search." : "No files yet — drop or upload files above to get started."}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
          {sorted.map(f => {
            const isSel = selected.has(f.id)
            return (
              <div
                key={f.id}
                style={{
                  position: "relative",
                  border: `0.5px solid ${isSel ? "var(--color-text-secondary)" : "var(--color-border-tertiary)"}`,
                  borderRadius: 10,
                  background: "var(--color-background-primary)",
                  overflow: "hidden",
                }}
              >
                {/* Select checkbox */}
                <div style={{ position: "absolute", top: 8, left: 8, zIndex: 2 }}>
                  <input type="checkbox" checked={isSel} onChange={() => toggleSelect(f.id)} />
                </div>

                {/* Badges */}
                <div style={{ position: "absolute", top: 8, right: 8, zIndex: 2, display: "flex", gap: 4 }}>
                  {f.version > 1 && (
                    <span
                      title={`Version ${f.version}`}
                      style={{ fontSize: 10, padding: "1px 6px", borderRadius: 6, background: "var(--color-background-hover)", color: "var(--color-text-muted)", fontWeight: 600 }}
                    >
                      v{f.version}
                    </span>
                  )}
                  {f.portalVisible && (
                    <span
                      title="Shared to customer portal"
                      style={{ fontSize: 10, padding: "1px 6px", borderRadius: 6, background: "rgba(34,197,94,0.16)", color: "#22c55e", fontWeight: 600 }}
                    >
                      📌 Portal
                    </span>
                  )}
                </div>

                {/* Thumb (click → preview) */}
                <div
                  onClick={() => openPreview(f)}
                  title={canPreview(f) ? "Click to preview" : "Click to download"}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: 120,
                    cursor: "pointer",
                    background: "var(--color-background-secondary)",
                    borderBottom: "0.5px solid var(--color-border-tertiary)",
                  }}
                >
                  <FileThumb file={f} size={120} />
                </div>

                {/* Meta */}
                <div style={{ padding: "8px 10px" }}>
                  {renamingId === f.id ? (
                    <input
                      autoFocus
                      value={renameVal}
                      onChange={e => setRenameVal(e.target.value)}
                      onBlur={() => rename(f.id)}
                      onKeyDown={e => {
                        if (e.key === "Enter") rename(f.id)
                        if (e.key === "Escape") setRenamingId(null)
                      }}
                      style={{
                        width: "100%",
                        fontSize: 12,
                        padding: "3px 6px",
                        borderRadius: 5,
                        border: "0.5px solid var(--color-border-secondary)",
                        background: "var(--color-background-primary)",
                        color: "var(--color-text-primary)",
                        boxSizing: "border-box",
                      }}
                    />
                  ) : (
                    <div
                      title={f.originalName}
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        color: "var(--color-text-primary)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {fileEmoji(f)} {f.originalName}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 3, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <span>{formatBytes(f.size)}</span>
                    <span>·</span>
                    <span>{new Date(f.createdAt).toLocaleDateString()}</span>
                    {f.scanStatus === "skipped" && (
                      <span title="This file was not virus-scanned" style={{ color: "var(--color-text-muted)", opacity: 0.7 }}>
                        · not scanned
                      </span>
                    )}
                  </div>

                  {/* Row actions */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                    <button onClick={() => openPreview(f)} style={ghostBtn} title="Preview">
                      Preview
                    </button>
                    <a href={downloadHref(f.id)} download={f.originalName} style={{ ...ghostBtn, textDecoration: "none" }} title="Download">
                      Download
                    </a>
                    <div style={{ position: "relative" }}>
                      <button
                        onClick={() => setMenuOpen(menuOpen === f.id ? null : f.id)}
                        style={{ ...ghostBtn, fontSize: 14, lineHeight: 1, color: "var(--color-text-muted)" }}
                        title="More actions"
                      >
                        ···
                      </button>
                      {menuOpen === f.id && (
                        <div
                          onMouseLeave={() => setMenuOpen(null)}
                          style={{
                            position: "absolute",
                            right: 0,
                            top: "100%",
                            zIndex: 50,
                            background: "var(--color-background-secondary)",
                            border: "0.5px solid var(--color-border-secondary)",
                            borderRadius: 8,
                            padding: 4,
                            minWidth: 170,
                            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                          }}
                        >
                          {[
                            {
                              label: "Rename",
                              action: () => {
                                setMenuOpen(null)
                                setRenamingId(f.id)
                                setRenameVal(f.originalName)
                              },
                            },
                            {
                              label: "Replace…",
                              action: () => {
                                setMenuOpen(null)
                                triggerReplace(f.id)
                              },
                            },
                            {
                              label: `Versions${f.version > 1 ? ` (${f.version})` : ""}`,
                              action: () => {
                                setMenuOpen(null)
                                toggleVersions(f.id)
                              },
                            },
                            {
                              label: f.portalVisible ? "👁 Unshare from portal" : "Share to portal",
                              action: () => {
                                setMenuOpen(null)
                                togglePortal(f)
                              },
                            },
                            {
                              label: "Delete",
                              danger: true,
                              action: () => {
                                setMenuOpen(null)
                                remove(f.id)
                              },
                            },
                          ].map(item => (
                            <button
                              key={item.label}
                              onClick={item.action}
                              style={{
                                display: "block",
                                width: "100%",
                                textAlign: "left",
                                padding: "6px 10px",
                                fontSize: 12,
                                border: "none",
                                background: "transparent",
                                cursor: "pointer",
                                color: item.danger ? "var(--color-text-danger)" : "var(--color-text-primary)",
                                borderRadius: 5,
                              }}
                              onMouseEnter={e => (e.currentTarget.style.background = "var(--color-background-hover)")}
                              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Versions inline */}
                  {versionsOpen === f.id && (
                    <div
                      style={{
                        marginTop: 8,
                        paddingTop: 8,
                        borderTop: "0.5px solid var(--color-border-tertiary)",
                      }}
                    >
                      <div style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 6 }}>
                        Version history
                      </div>
                      {versionsLoading === f.id ? (
                        <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Loading…</div>
                      ) : !versions[f.id] || versions[f.id].length === 0 ? (
                        <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>No prior versions.</div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {versions[f.id].map(v => (
                            <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 10, color: "var(--color-text-muted)", width: 26, flexShrink: 0 }}>
                                v{v.version}
                              </span>
                              <a
                                href={downloadHref(v.id)}
                                download={v.originalName}
                                style={{ fontSize: 11, color: "var(--color-text-primary)", textDecoration: "none", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                              >
                                {v.originalName}
                              </a>
                              {v.isCurrent && (
                                <span style={{ fontSize: 10, color: "var(--color-text-muted)", flexShrink: 0 }}>current</span>
                              )}
                              <span style={{ fontSize: 10, color: "var(--color-text-muted)", flexShrink: 0 }}>
                                {formatBytes(v.size)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Lightbox */}
      <AttachmentPreview
        file={preview}
        files={previewable}
        onClose={() => setPreview(null)}
        onNavigate={n => setPreview(n)}
      />
    </div>
  )
}
