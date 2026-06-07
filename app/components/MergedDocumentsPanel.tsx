"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import type { JSX } from "react"
import { marked } from "marked"
import ShareExternallyButton from "@/components/ShareExternallyButton"
import AttachmentPreview, { FileThumb, canPreview, downloadHref, formatBytes, type PreviewFile } from "@/components/AttachmentPreview"
import BuildAssetModal, { type BuildAssetFile } from "@/components/BuildAssetModal"

// =============================================================================
// MergedDocumentsPanel — single client document library that fuses the legacy
// "Documents" (written ClientDocument notes) and "Files" (loose
// ClientAttachment uploads) tabs into ONE folder-organized view.
//
// Left: folder tree (lifted from DocumentsPanel). Right: one mixed list of
// notes + loose files for the selected folder. Note bodies expand inline with
// markdown + their own nested attachments (so a note's attachments are NEVER
// also listed as top-level file rows). File rows get thumbnails, preview,
// versions, replace, portal toggle, "Build asset", move, etc. (lifted from
// ClientFilesPanel). Self-fetches everything.
// =============================================================================

type Attachment = {
  id: string
  originalName: string
  mimeType: string
  detectedMime?: string | null
  size: number
  previewable?: boolean
  width?: number | null
  height?: number | null
  notes: string | null
  createdAt: string
}

type Doc = {
  id: string
  title: string
  content: string | null
  category: string | null
  folderId: string | null
  isPinned: boolean
  portalVisible: boolean
  needsReview: boolean
  reviewNote: string | null
  flaggedBy: string | null
  createdAt: string
  updatedAt: string
  attachments: Attachment[]
}

// Loose library file — GET /api/attachments?...&standalone=1
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
  folderId: string | null
  assetId?: string | null
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

type Folder = {
  id: string
  name: string
  parentId: string | null
  order: number
}

type FolderNode = Folder & { children: FolderNode[] }

type SortKey = "date" | "name" | "size"

type Row = { kind: "note"; doc: Doc } | { kind: "file"; file: FileItem }

type Upload = { key: string; name: string; pct: number; error?: string | null; done?: boolean }

const MAX_BYTES = 100 * 1024 * 1024 // 100MB client-side cap
const SORT_STORE_KEY = "dochub:mergedDocs:sort"

const inp: React.CSSProperties = {
  width: "100%", padding: "8px 12px", fontSize: "14px",
  border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px",
  background: "var(--color-background-primary)", color: "var(--color-text-primary)",
  boxSizing: "border-box",
}
const lbl: React.CSSProperties = { fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }
const ghostBtn: React.CSSProperties = { fontSize: 11, background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--color-text-secondary)" }
const smallBtn: React.CSSProperties = {
  fontSize: 12, padding: "4px 10px", borderRadius: 6,
  border: "0.5px solid var(--color-border-secondary)",
  background: "var(--color-background-primary)", color: "var(--color-text-primary)", cursor: "pointer",
}

function fileExt(name: string): string {
  const i = name.lastIndexOf(".")
  return i > 0 && i < name.length - 1 ? name.slice(i + 1).toUpperCase() : ""
}

function buildTree(folders: Folder[]): FolderNode[] {
  const map = new Map<string, FolderNode>()
  folders.forEach(f => map.set(f.id, { ...f, children: [] }))
  const roots: FolderNode[] = []
  map.forEach(node => {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  })
  function sortNodes(nodes: FolderNode[]) {
    nodes.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
    nodes.forEach(n => sortNodes(n.children))
  }
  sortNodes(roots)
  return roots
}

// Flatten tree for dropdowns, with indentation level.
function flattenTree(nodes: FolderNode[], level = 0): { folder: FolderNode; level: number }[] {
  const result: { folder: FolderNode; level: number }[] = []
  nodes.forEach(n => {
    result.push({ folder: n, level })
    result.push(...flattenTree(n.children, level + 1))
  })
  return result
}

// -----------------------------------------------------------------------------
// FolderItem — recursive folder tree row (lifted from DocumentsPanel, with the
// note-only count function generalized to count notes + files).
// -----------------------------------------------------------------------------
function FolderItem({
  node,
  countFor,
  selected,
  onSelect,
  onRename,
  onDelete,
  onNewChild,
  depth,
}: {
  node: FolderNode
  countFor: (id: string) => number
  selected: string | null
  onSelect: (id: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  onNewChild: (parentId: string) => void
  depth: number
}) {
  const [expanded, setExpanded] = useState(true)
  const [hover, setHover] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameVal, setRenameVal] = useState(node.name)
  const isSelected = selected === node.id
  const count = countFor(node.id)
  const hasChildren = node.children.length > 0

  function commitRename() {
    if (renameVal.trim() && renameVal.trim() !== node.name) {
      onRename(node.id, renameVal.trim())
    }
    setRenaming(false)
  }

  return (
    <div>
      <div
        style={{
          display: "flex", alignItems: "center", gap: "4px",
          padding: `5px 8px 5px ${12 + depth * 16}px`,
          borderRadius: "6px", cursor: "pointer",
          background: isSelected ? "var(--color-background-hover)" : hover ? "var(--color-background-hover)" : "transparent",
          position: "relative",
        }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => { setHover(false); setMenuOpen(false) }}
        onClick={() => { if (!renaming) onSelect(node.id) }}
      >
        <span
          onClick={e => { e.stopPropagation(); setExpanded(x => !x) }}
          style={{ fontSize: "10px", color: "var(--color-text-muted)", width: "12px", flexShrink: 0, userSelect: "none" }}
        >
          {hasChildren ? (expanded ? "▼" : "▶") : ""}
        </span>

        <span style={{ fontSize: "13px", flexShrink: 0 }}>
          {expanded && hasChildren ? "📂" : "📁"}
        </span>

        {renaming ? (
          <input
            autoFocus
            value={renameVal}
            onChange={e => setRenameVal(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") { setRenameVal(node.name); setRenaming(false) } }}
            onClick={e => e.stopPropagation()}
            style={{ flex: 1, fontSize: "13px", padding: "1px 4px", border: "1px solid var(--color-border-secondary)", borderRadius: "4px", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}
          />
        ) : (
          <span style={{ flex: 1, fontSize: "13px", color: isSelected ? "var(--color-text-primary)" : "var(--color-text-secondary)", fontWeight: isSelected ? 500 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {node.name}
          </span>
        )}

        {!renaming && count > 0 && (
          <span style={{ fontSize: "11px", color: "var(--color-text-muted)", flexShrink: 0 }}>{count}</span>
        )}

        {!renaming && hover && (
          <div style={{ position: "relative", flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setMenuOpen(m => !m)}
              style={{ fontSize: "14px", color: "var(--color-text-muted)", background: "none", border: "none", cursor: "pointer", padding: "0 2px", lineHeight: 1 }}
              title="Folder options"
            >
              ···
            </button>
            {menuOpen && (
              <div style={{
                position: "absolute", right: 0, top: "100%", zIndex: 50,
                background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-secondary)",
                borderRadius: "8px", padding: "4px", minWidth: "140px", boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
              }}>
                {[
                  { label: "New subfolder", action: () => { setMenuOpen(false); onNewChild(node.id) } },
                  { label: "Rename", action: () => { setMenuOpen(false); setRenaming(true); setRenameVal(node.name) } },
                  { label: "Delete folder", action: () => { setMenuOpen(false); onDelete(node.id) }, danger: true },
                ].map(item => (
                  <button key={item.label} onClick={item.action} style={{
                    display: "block", width: "100%", textAlign: "left", padding: "6px 10px",
                    fontSize: "13px", border: "none", background: "transparent", cursor: "pointer",
                    color: item.danger ? "var(--color-text-danger)" : "var(--color-text-primary)",
                    borderRadius: "5px",
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
        )}
      </div>

      {expanded && hasChildren && (
        <div>
          {node.children.map(child => (
            <FolderItem key={child.id} node={child} countFor={countFor} selected={selected}
              onSelect={onSelect} onRename={onRename} onDelete={onDelete} onNewChild={onNewChild} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// FolderPickerMenu — dropdown listing root + all folders, used by "Move to…".
// -----------------------------------------------------------------------------
function FolderPickerMenu({
  flatFolders,
  onPick,
  onClose,
}: {
  flatFolders: { folder: FolderNode; level: number }[]
  onPick: (folderId: string | null) => void
  onClose: () => void
}): JSX.Element {
  return (
    <div
      onMouseLeave={onClose}
      style={{
        position: "absolute", right: 0, top: "100%", zIndex: 60,
        background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-secondary)",
        borderRadius: 8, padding: 4, minWidth: 180, maxHeight: 280, overflowY: "auto",
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
      }}
    >
      <button onClick={() => onPick(null)} style={{
        display: "block", width: "100%", textAlign: "left", padding: "6px 10px",
        fontSize: 12, border: "none", background: "transparent", cursor: "pointer",
        color: "var(--color-text-primary)", borderRadius: 5,
      }}
        onMouseEnter={e => (e.currentTarget.style.background = "var(--color-background-hover)")}
        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
      >📋 (No folder / root)</button>
      {flatFolders.map(({ folder, level }) => (
        <button key={folder.id} onClick={() => onPick(folder.id)} style={{
          display: "block", width: "100%", textAlign: "left", padding: "6px 10px",
          fontSize: 12, border: "none", background: "transparent", cursor: "pointer",
          color: "var(--color-text-primary)", borderRadius: 5, whiteSpace: "nowrap",
        }}
          onMouseEnter={e => (e.currentTarget.style.background = "var(--color-background-hover)")}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        >📁 {" ".repeat(level * 2)}{folder.name}</button>
      ))}
    </div>
  )
}

export default function MergedDocumentsPanel({ clientId }: { clientId: string }): JSX.Element {
  // ---- data ----
  const [folders, setFolders] = useState<Folder[]>([])
  const [docs, setDocs] = useState<Doc[]>([])
  const [files, setFiles] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null) // null = All

  // ---- folder create ----
  const [newFolderParent, setNewFolderParent] = useState<string | null | "__root__">(null)
  const [newFolderName, setNewFolderName] = useState("")
  const [savingFolder, setSavingFolder] = useState(false)

  // ---- right-pane controls ----
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState<SortKey>("date")

  // ---- note state ----
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null)
  const [editingDoc, setEditingDoc] = useState<string | null>(null)
  const [showNewDoc, setShowNewDoc] = useState(false)
  const [contentTab, setContentTab] = useState<Record<string, "write" | "preview">>({})
  const [newForm, setNewForm] = useState({ title: "", content: "", category: "", isPinned: false, folderId: null as string | null })
  const [editForm, setEditForm] = useState<any>({})
  const [savingDoc, setSavingDoc] = useState(false)
  const [docVersionsOpen, setDocVersionsOpen] = useState<string | null>(null)
  const [docVersions, setDocVersions] = useState<Record<string, { id: string; title: string; savedAt: string; savedBy: string | null }[]>>({})
  const [docVersionsLoading, setDocVersionsLoading] = useState<Record<string, boolean>>({})
  const [reverting, setReverting] = useState<string | null>(null)

  // ---- note attachment upload ----
  const [noteUploadingTo, setNoteUploadingTo] = useState<string | null>(null)
  const [noteUploading, setNoteUploading] = useState(false)
  const [noteDragOver, setNoteDragOver] = useState<string | null>(null)
  const noteFileRef = useRef<HTMLInputElement>(null)
  const docsRef = useRef<Doc[]>(docs)
  useEffect(() => { docsRef.current = docs }, [docs])

  // ---- loose-file state ----
  const [uploads, setUploads] = useState<Record<string, Upload>>({})
  const [dragOver, setDragOver] = useState(false)
  const uploadKeyRef = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const replaceRef = useRef<HTMLInputElement>(null)
  const replaceTargetRef = useRef<string | null>(null)
  const [renamingFileId, setRenamingFileId] = useState<string | null>(null)
  const [renameFileVal, setRenameFileVal] = useState("")
  const [fileMenuOpen, setFileMenuOpen] = useState<string | null>(null)
  const [fileMovePickerFor, setFileMovePickerFor] = useState<string | null>(null)
  const [fileVersionsOpen, setFileVersionsOpen] = useState<string | null>(null)
  const [fileVersions, setFileVersions] = useState<Record<string, VersionRow[]>>({})
  const [fileVersionsLoading, setFileVersionsLoading] = useState<string | null>(null)

  // ---- preview / build asset / bulk / toast ----
  const [previewing, setPreviewing] = useState<PreviewFile | null>(null)
  const [previewList, setPreviewList] = useState<PreviewFile[]>([])
  const [buildAssetFile, setBuildAssetFile] = useState<BuildAssetFile | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set()) // keys: n:<id> / f:<id>
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(t => (t === msg ? null : t)), 4000)
  }

  // ---- load all three datasets ----
  const fetchFolders = useCallback(async () => {
    const res = await fetch(`/api/clients/${clientId}/folders`)
    if (res.ok) setFolders(await res.json())
  }, [clientId])

  const fetchDocs = useCallback(async () => {
    const res = await fetch(`/api/clients/${clientId}/documents`)
    if (res.ok) setDocs(await res.json())
  }, [clientId])

  const fetchFiles = useCallback(async () => {
    const res = await fetch(`/api/attachments?entityType=client&entityId=${clientId}&standalone=1`)
    if (res.ok) setFiles(await res.json())
  }, [clientId])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        await Promise.all([fetchFolders(), fetchDocs(), fetchFiles()])
        if (!cancelled) setErr(null)
      } catch {
        if (!cancelled) setErr("Could not load the document library.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [fetchFolders, fetchDocs, fetchFiles])

  // Persist sort to localStorage.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SORT_STORE_KEY)
      if (saved === "date" || saved === "name" || saved === "size") setSort(saved)
    } catch { /* ignore */ }
  }, [])
  useEffect(() => {
    try { localStorage.setItem(SORT_STORE_KEY, sort) } catch { /* ignore */ }
  }, [sort])

  const tree = buildTree(folders)
  const flatFolders = flattenTree(tree)

  // Per-folder count = notes in folder + loose files in folder.
  const countFor = useCallback((folderId: string) => {
    return docs.filter(d => d.folderId === folderId).length + files.filter(f => f.folderId === folderId).length
  }, [docs, files])

  // ---- note content tab helpers ----
  function getContentTab(docId: string): "write" | "preview" {
    return contentTab[docId] ?? "write"
  }
  function setDocContentTab(docId: string, tab: "write" | "preview") {
    setContentTab(t => ({ ...t, [docId]: tab }))
  }

  // ===========================================================================
  // Note mutations (lifted from DocumentsPanel; self-managed state)
  // ===========================================================================
  async function createDoc() {
    if (!newForm.title.trim()) return
    setSavingDoc(true)
    try {
      const folderId = newForm.folderId ?? (selectedFolderId !== null ? selectedFolderId : null)
      const res = await fetch(`/api/clients/${clientId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newForm, folderId }),
      })
      if (res.ok) {
        const doc = await res.json()
        setDocs(prev => [doc, ...prev])
        setExpandedDoc(doc.id)
        setNewForm({ title: "", content: "", category: "", isPinned: false, folderId: null })
        setShowNewDoc(false)
      }
    } finally { setSavingDoc(false) }
  }

  async function saveDoc(docId: string) {
    setSavingDoc(true)
    try {
      const res = await fetch(`/api/documents/${docId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      })
      if (res.ok) {
        const updated = await res.json()
        setDocs(prev => prev.map(d => d.id === docId ? updated : d))
        setEditingDoc(null)
      }
    } finally { setSavingDoc(false) }
  }

  async function deleteDoc(docId: string) {
    if (!confirm("Delete this note and all its attachments?")) return
    await fetch(`/api/documents/${docId}`, { method: "DELETE" })
    setDocs(prev => prev.filter(d => d.id !== docId))
    if (expandedDoc === docId) setExpandedDoc(null)
  }

  async function togglePin(doc: Doc) {
    const res = await fetch(`/api/documents/${doc.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...doc, isPinned: !doc.isPinned }),
    })
    if (res.ok) {
      const updated = await res.json()
      setDocs(prev => prev.map(d => d.id === doc.id ? updated : d))
    }
  }

  async function toggleReview(doc: Doc) {
    const flagging = !doc.needsReview
    const reviewNote = flagging ? (prompt("Why does this note need review? (optional)") ?? "") : ""
    const res = await fetch(`/api/documents/${doc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ needsReview: flagging, reviewNote }),
    })
    if (res.ok) {
      const updated = await res.json()
      setDocs(prev => prev.map(d => d.id === doc.id ? updated : d))
    }
  }

  async function togglePortalVisibleDoc(doc: Doc) {
    const res = await fetch(`/api/documents/${doc.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ portalVisible: !doc.portalVisible }),
    })
    if (res.ok) {
      const updated = await res.json()
      setDocs(prev => prev.map(d => d.id === doc.id ? updated : d))
    }
  }

  async function fetchDocVersions(docId: string) {
    setDocVersionsLoading(v => ({ ...v, [docId]: true }))
    try {
      const res = await fetch(`/api/documents/${docId}/versions`)
      if (res.ok) { const data = await res.json(); setDocVersions(v => ({ ...v, [docId]: data })) }
    } finally {
      setDocVersionsLoading(v => ({ ...v, [docId]: false }))
    }
  }

  async function revertDocToVersion(docId: string, versionId: string) {
    if (!confirm("Revert to this version? The current content will be saved as a new version first.")) return
    setReverting(versionId)
    try {
      const res = await fetch(`/api/documents/${docId}/versions/${versionId}/revert`, { method: "POST" })
      if (res.ok) {
        const updated = await res.json()
        setDocs(prev => prev.map(d => d.id === docId ? updated : d))
        await fetchDocVersions(docId)
      }
    } finally { setReverting(null) }
  }

  // ---- note attachment upload ----
  async function uploadNoteFile(docId: string, file: File) {
    const fd = new FormData()
    fd.append("file", file)
    const res = await fetch(`/api/documents/${docId}/attachments`, { method: "POST", body: fd })
    if (res.ok) {
      const att = await res.json()
      setDocs(docsRef.current.map(d => d.id === docId ? { ...d, attachments: [...d.attachments, att] } : d))
    } else {
      const e = await res.json().catch(() => ({}))
      alert(e.error || "Upload failed")
    }
  }
  async function uploadNoteFiles(docId: string, list: FileList | File[]) {
    const arr = Array.from(list)
    if (arr.length === 0) return
    setNoteUploading(true)
    setNoteUploadingTo(docId)
    try {
      for (const f of arr) await uploadNoteFile(docId, f)
    } finally { setNoteUploading(false); setNoteUploadingTo(null) }
  }
  async function deleteNoteAttachment(docId: string, attId: string) {
    await fetch(`/api/attachments/${attId}`, { method: "DELETE" })
    setDocs(prev => prev.map(d => d.id === docId ? { ...d, attachments: d.attachments.filter(a => a.id !== attId) } : d))
  }

  // ===========================================================================
  // Folder mutations (match DocumentsPanel: POST create, PUT rename, DELETE)
  // ===========================================================================
  async function createFolder() {
    if (!newFolderName.trim()) return
    setSavingFolder(true)
    try {
      const parentId = newFolderParent === "__root__" ? null : newFolderParent
      const res = await fetch(`/api/clients/${clientId}/folders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newFolderName.trim(), parentId }),
      })
      if (res.ok) {
        await fetchFolders()
        setNewFolderName("")
        setNewFolderParent(null)
      }
    } finally { setSavingFolder(false) }
  }

  async function renameFolder(id: string, name: string) {
    await fetch(`/api/folders/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    })
    await fetchFolders()
  }

  async function deleteFolder(id: string) {
    if (!confirm("Delete this folder? Notes and files inside will be moved to its parent folder.")) return
    await fetch(`/api/folders/${id}`, { method: "DELETE" })
    if (selectedFolderId === id) setSelectedFolderId(null)
    // Server reparents children/docs/files — refresh all three.
    await Promise.all([fetchFolders(), fetchDocs(), fetchFiles()])
  }

  // ===========================================================================
  // Loose-file uploads (XHR for progress; always tag the selected folder)
  // ===========================================================================
  function uploadOne(file: File): Promise<void> {
    const key = `u${uploadKeyRef.current++}`

    if (file.size > MAX_BYTES) {
      setUploads(prev => ({ ...prev, [key]: { key, name: file.name, pct: 0, error: `Too large — ${formatBytes(file.size)} exceeds the 100MB limit.`, done: true } }))
      return Promise.resolve()
    }

    setUploads(prev => ({ ...prev, [key]: { key, name: file.name, pct: 0 } }))

    return new Promise<void>(resolve => {
      const xhr = new XMLHttpRequest()
      const fd = new FormData()
      fd.append("file", file)
      fd.append("entityType", "client")
      fd.append("entityId", clientId)
      if (selectedFolderId) fd.append("folderId", selectedFolderId)

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
          } catch { /* ignore parse */ }
          setUploads(prev => (prev[key] ? { ...prev, [key]: { ...prev[key], pct: 100, done: true } } : prev))
          setTimeout(() => setUploads(prev => { const next = { ...prev }; delete next[key]; return next }), 1200)
        } else {
          let msg = `Upload failed (${xhr.status})`
          try { const j = JSON.parse(xhr.responseText); if (j.error) msg = xhr.status === 422 ? `Rejected: ${j.error}` : j.error } catch { /* keep */ }
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

  function onPaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items
    if (!items) return
    const imgs: File[] = []
    for (const it of Array.from(items)) {
      if (it.kind === "file" && it.type.startsWith("image/")) {
        const f = it.getAsFile()
        if (f) imgs.push(new File([f], f.name || `pasted-${Date.now()}.png`, { type: f.type }))
      }
    }
    if (imgs.length) { e.preventDefault(); uploadMany(imgs) }
  }

  // ---- per-file mutations ----
  async function renameFile(id: string) {
    const name = renameFileVal.trim()
    setRenamingFileId(null)
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

  async function togglePortalFile(file: FileItem) {
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

  async function removeFile(id: string) {
    if (!confirm("Delete this file? This cannot be undone.")) return
    const res = await fetch(`/api/attachments/${id}`, { method: "DELETE" })
    if (res.ok) {
      setFiles(prev => prev.filter(f => f.id !== id))
      setSelected(prev => { const next = new Set(prev); next.delete(`f:${id}`); return next })
    }
  }

  async function moveFile(id: string, folderId: string | null) {
    const res = await fetch(`/api/attachments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId }),
    })
    if (res.ok) {
      const updated = await res.json()
      setFiles(prev => prev.map(f => (f.id === id ? { ...f, ...updated } : f)))
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
      setFileVersions(prev => { const next = { ...prev }; delete next[id]; return next })
      if (fileVersionsOpen === id) fetchFileVersions(id)
    } else {
      const j = await res.json().catch(() => ({}))
      alert(j.error || "Replace failed.")
    }
    replaceTargetRef.current = null
  }

  async function fetchFileVersions(id: string) {
    setFileVersionsLoading(id)
    try {
      const res = await fetch(`/api/attachments/${id}/versions`)
      if (res.ok) {
        const list = (await res.json()) as VersionRow[]
        setFileVersions(prev => ({ ...prev, [id]: list }))
      }
    } finally {
      setFileVersionsLoading(null)
    }
  }
  function toggleFileVersions(id: string) {
    const next = fileVersionsOpen === id ? null : id
    setFileVersionsOpen(next)
    if (next && !fileVersions[id]) fetchFileVersions(id)
  }

  // ---- build asset ----
  function onAssetBuilt(r: { asset: { id: string; name: string } }, fileId: string) {
    setBuildAssetFile(null)
    // Optimistically link, then refresh so the 🔗 chip + server state are accurate.
    setFiles(prev => prev.map(f => (f.id === fileId ? { ...f, assetId: r.asset.id } : f)))
    fetchFiles()
    showToast(`Created asset “${r.asset.name}” — file linked 🔗`)
  }

  // ===========================================================================
  // Bulk (mixed notes + files)
  // ===========================================================================
  function toggleSelect(key: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  function splitSelected(): { noteIds: string[]; fileIds: string[] } {
    const noteIds: string[] = []
    const fileIds: string[] = []
    selected.forEach(k => {
      if (k.startsWith("n:")) noteIds.push(k.slice(2))
      else if (k.startsWith("f:")) fileIds.push(k.slice(2))
    })
    return { noteIds, fileIds }
  }

  async function bulkDelete() {
    const { noteIds, fileIds } = splitSelected()
    if (!noteIds.length && !fileIds.length) return
    if (!confirm(`Delete ${noteIds.length} note${noteIds.length === 1 ? "" : "s"} and ${fileIds.length} file${fileIds.length === 1 ? "" : "s"}? This cannot be undone.`)) return
    setBulkBusy(true)
    try {
      if (fileIds.length) {
        await fetch("/api/attachments/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "delete", ids: fileIds }),
        })
      }
      for (const id of noteIds) await fetch(`/api/documents/${id}`, { method: "DELETE" })
      setFiles(prev => prev.filter(f => !fileIds.includes(f.id)))
      setDocs(prev => prev.filter(d => !noteIds.includes(d.id)))
      setSelected(new Set())
    } finally { setBulkBusy(false) }
  }

  async function bulkZip() {
    const { fileIds } = splitSelected()
    if (!fileIds.length) return
    setBulkBusy(true)
    try {
      const res = await fetch("/api/attachments/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "zip", ids: fileIds, name: "client-files.zip" }),
      })
      if (!res.ok) { alert("Could not build zip."); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "client-files.zip"
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } finally { setBulkBusy(false) }
  }

  async function bulkMove(targetFolderId: string | null) {
    const { noteIds, fileIds } = splitSelected()
    if (!noteIds.length && !fileIds.length) return
    setBulkMoveOpen(false)
    setBulkBusy(true)
    try {
      if (fileIds.length) {
        await fetch("/api/attachments/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "move", ids: fileIds, targetFolderId }),
        })
      }
      for (const id of noteIds) {
        await fetch(`/api/documents/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folderId: targetFolderId }),
        })
      }
      setFiles(prev => prev.map(f => (fileIds.includes(f.id) ? { ...f, folderId: targetFolderId } : f)))
      setDocs(prev => prev.map(d => (noteIds.includes(d.id) ? { ...d, folderId: targetFolderId } : d)))
      setSelected(new Set())
    } finally { setBulkBusy(false) }
  }

  // ===========================================================================
  // Derived rows
  // ===========================================================================
  const q = search.trim().toLowerCase()

  const noteMatches = (d: Doc) => !q || d.title.toLowerCase().includes(q) || (d.content ?? "").toLowerCase().includes(q)
  const fileMatches = (f: FileItem) => !q || f.originalName.toLowerCase().includes(q) || (f.notes ?? "").toLowerCase().includes(q)

  const visibleNotes = docs.filter(d => (selectedFolderId === null || d.folderId === selectedFolderId) && noteMatches(d))
  const visibleFiles = files.filter(f => (selectedFolderId === null || f.folderId === selectedFolderId) && fileMatches(f))

  const pinnedNotes = visibleNotes.filter(d => d.isPinned)
  const restRows: Row[] = [
    ...visibleNotes.filter(d => !d.isPinned).map(d => ({ kind: "note", doc: d } as Row)),
    ...visibleFiles.map(f => ({ kind: "file", file: f } as Row)),
  ]

  function rowName(r: Row): string { return r.kind === "note" ? r.doc.title : r.file.originalName }
  function rowDate(r: Row): string { return r.kind === "note" ? r.doc.updatedAt : r.file.createdAt }
  function rowSize(r: Row): number { return r.kind === "note" ? -1 : r.file.size } // notes have no size → sort to end

  restRows.sort((a, b) => {
    if (sort === "name") return rowName(a).localeCompare(rowName(b))
    if (sort === "size") return rowSize(b) - rowSize(a)
    return new Date(rowDate(b)).getTime() - new Date(rowDate(a)).getTime()
  })

  const totalVisible = pinnedNotes.length + restRows.length
  const previewableFiles: PreviewFile[] = visibleFiles.filter(f => canPreview(f as PreviewFile)) as PreviewFile[]
  const uploadList = Object.values(uploads)
  const selectedCount = selected.size

  const selectedFolderName = selectedFolderId ? folders.find(f => f.id === selectedFolderId)?.name : null

  function openFilePreview(f: FileItem) {
    if (!canPreview(f as PreviewFile)) { window.location.href = downloadHref(f.id); return }
    setPreviewList(previewableFiles)
    setPreviewing(f as PreviewFile)
  }
  function openNoteAttachmentPreview(att: Attachment, all: Attachment[]) {
    setPreviewList(all.filter(a => canPreview(a as PreviewFile)) as PreviewFile[])
    setPreviewing(att as PreviewFile)
  }

  // ===========================================================================
  // Render: note row (shared by pinned group + rest list)
  // ===========================================================================
  function renderNoteRow(doc: Doc): JSX.Element {
    const docFolder = doc.folderId ? folders.find(f => f.id === doc.folderId) : null
    const key = `n:${doc.id}`
    return (
      <div key={doc.id} style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "10px", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px", background: "var(--color-background-secondary)" }}>
          <input type="checkbox" checked={selected.has(key)} onChange={() => toggleSelect(key)} onClick={e => e.stopPropagation()} />
          <div
            style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: 0, cursor: "pointer" }}
            onClick={() => setExpandedDoc(expandedDoc === doc.id ? null : doc.id)}
          >
            <span style={{ fontSize: "14px" }}>{doc.isPinned ? "📌" : "📄"}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-text-primary)" }}>{doc.title}</span>
                {doc.attachments.length > 0 && (
                  <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>📎 {doc.attachments.length}</span>
                )}
                {doc.needsReview && (
                  <span title={doc.reviewNote ?? "Needs review"} style={{ fontSize: "10px", padding: "1px 6px", borderRadius: "4px", background: "rgba(245,158,11,0.16)", color: "#f59e0b", fontWeight: 600 }}>⚑ Needs review</span>
                )}
                {doc.portalVisible && (
                  <span title="Shared to customer portal" style={{ fontSize: "10px", padding: "1px 6px", borderRadius: "6px", background: "rgba(34,197,94,0.16)", color: "#22c55e", fontWeight: 600 }}>👁 Portal</span>
                )}
                {docFolder && selectedFolderId === null && (
                  <span style={{ fontSize: "11px", padding: "1px 7px", borderRadius: "8px", background: "var(--color-background-hover)", color: "var(--color-text-muted)" }}>📁 {docFolder.name}</span>
                )}
              </div>
              <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "2px" }}>
                Markdown · Updated {new Date(doc.updatedAt).toLocaleDateString()}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
            <button onClick={() => togglePin(doc)} style={{ fontSize: "11px", color: doc.isPinned ? "#f59e0b" : "var(--color-text-muted)", background: "none", border: "none", cursor: "pointer", padding: 0 }} title={doc.isPinned ? "Unpin" : "Pin"}>
              {doc.isPinned ? "📌 Unpin" : "Pin"}
            </button>
            <button onClick={() => togglePortalVisibleDoc(doc)} style={{ fontSize: "11px", color: doc.portalVisible ? "#22c55e" : "var(--color-text-muted)", background: "none", border: "none", cursor: "pointer", padding: 0 }} title={doc.portalVisible ? "Visible to customer portal — click to make private" : "Private — click to share with customer portal"}>
              {doc.portalVisible ? "👁 Portal" : "Share to portal"}
            </button>
            <button onClick={() => toggleReview(doc)} style={{ fontSize: "11px", color: doc.needsReview ? "#f59e0b" : "var(--color-text-muted)", background: "none", border: "none", cursor: "pointer", padding: 0 }} title={doc.needsReview ? "Flagged for review — click to resolve" : "Flag for review"}>
              {doc.needsReview ? "✓ Resolve" : "⚑ Flag"}
            </button>
            <button onClick={() => { setEditingDoc(doc.id); setEditForm({ title: doc.title, content: doc.content ?? "", category: doc.category ?? "", isPinned: doc.isPinned, folderId: doc.folderId ?? null }); setExpandedDoc(doc.id) }}
              style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Edit</button>
            <button
              onClick={() => {
                const next = docVersionsOpen === doc.id ? null : doc.id
                setDocVersionsOpen(next)
                if (next && !docVersions[doc.id]) fetchDocVersions(doc.id)
                if (expandedDoc !== doc.id) setExpandedDoc(doc.id)
              }}
              style={{ fontSize: "12px", color: docVersionsOpen === doc.id ? "var(--color-text-primary)" : "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >History</button>
            <ShareExternallyButton resourceType="document" resourceId={doc.id} compact label="Share" />
            <button onClick={() => deleteDoc(doc.id)} style={{ fontSize: "12px", color: "var(--color-text-danger)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Delete</button>
            <span onClick={() => setExpandedDoc(expandedDoc === doc.id ? null : doc.id)} style={{ fontSize: "12px", color: "var(--color-text-muted)", cursor: "pointer" }}>{expandedDoc === doc.id ? "▲" : "▼"}</span>
          </div>
        </div>

        {expandedDoc === doc.id && (
          <div style={{ background: "var(--color-background-primary)" }}>
            {editingDoc === doc.id ? (
              <div style={{ padding: "20px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={lbl}>Title</label>
                    <input value={editForm.title ?? ""} onChange={e => setEditForm((f: any) => ({ ...f, title: e.target.value }))} style={inp} />
                  </div>
                  <div>
                    <label style={lbl}>Folder</label>
                    <select value={editForm.folderId ?? ""} onChange={e => setEditForm((f: any) => ({ ...f, folderId: e.target.value || null }))} style={inp}>
                      <option value="">(No folder)</option>
                      {flatFolders.map(({ folder, level }) => (
                        <option key={folder.id} value={folder.id}>{" ".repeat(level * 3)}{folder.name}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", paddingTop: "22px" }}>
                    <input type="checkbox" id={`pin-${doc.id}`} checked={editForm.isPinned ?? false} onChange={e => setEditForm((f: any) => ({ ...f, isPinned: e.target.checked }))} />
                    <label htmlFor={`pin-${doc.id}`} style={{ fontSize: "13px", color: "var(--color-text-secondary)", cursor: "pointer" }}>Pin to top</label>
                  </div>
                </div>
                <div style={{ marginBottom: "12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "0.5px solid var(--color-border-tertiary)", marginBottom: "8px" }}>
                    <label style={{ ...lbl, marginBottom: 0, paddingBottom: "4px" }}>Content</label>
                    <div style={{ display: "flex" }}>
                      {(["write", "preview"] as const).map(tab => (
                        <button key={tab} onClick={() => setDocContentTab(doc.id, tab)} style={{ fontSize: "12px", padding: "2px 10px", border: "none", background: "transparent", cursor: "pointer", color: getContentTab(doc.id) === tab ? "var(--color-text-primary)" : "var(--color-text-muted)", fontWeight: getContentTab(doc.id) === tab ? 600 : 400, borderBottom: getContentTab(doc.id) === tab ? "2px solid var(--color-text-primary)" : "2px solid transparent", marginBottom: "-1px" }}>
                          {tab.charAt(0).toUpperCase() + tab.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                  {getContentTab(doc.id) === "write" ? (
                    <textarea value={editForm.content ?? ""} onChange={e => setEditForm((f: any) => ({ ...f, content: e.target.value }))} rows={14} style={{ ...inp, fontFamily: "monospace", fontSize: "13px", resize: "vertical", lineHeight: 1.6 }} />
                  ) : (
                    <div className="markdown-body" style={{ padding: "12px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", minHeight: "120px", fontSize: "14px", lineHeight: 1.7 }}
                      dangerouslySetInnerHTML={{ __html: editForm.content ? marked(editForm.content) as string : '<span style="color:var(--color-text-muted)">Nothing to preview.</span>' }} />
                  )}
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button onClick={() => saveDoc(doc.id)} disabled={savingDoc} style={{ fontSize: "13px", fontWeight: 500, padding: "7px 16px", borderRadius: "7px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>
                    {savingDoc ? "Saving..." : "Save"}
                  </button>
                  <button onClick={() => setEditingDoc(null)} style={{ fontSize: "13px", padding: "7px 12px", borderRadius: "7px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>Cancel</button>
                </div>
              </div>
            ) : (
              doc.content ? (
                <div className="markdown-body" style={{ padding: "20px", fontSize: "14px", lineHeight: 1.75, borderBottom: "0.5px solid var(--color-border-tertiary)" }}
                  dangerouslySetInnerHTML={{ __html: marked(doc.content) as string }} />
              ) : (
                <div style={{ padding: "16px 20px", fontSize: "13px", color: "var(--color-text-muted)", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>No content yet — click Edit to add.</div>
              )
            )}

            {/* Version history */}
            {docVersionsOpen === doc.id && (
              <div style={{ padding: "14px 16px", borderTop: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-secondary)" }}>
                <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: "10px" }}>Version history</div>
                {docVersionsLoading[doc.id] ? (
                  <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>Loading...</div>
                ) : !docVersions[doc.id] || docVersions[doc.id].length === 0 ? (
                  <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>No versions saved yet. Versions are created automatically when you save edits.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    {docVersions[doc.id].map(v => (
                      <div key={v.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "7px 10px", background: "var(--color-background-primary)", borderRadius: "7px", border: "0.5px solid var(--color-border-tertiary)" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.title}</div>
                          <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "2px" }}>
                            {new Date(v.savedAt).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                            {v.savedBy ? ` · ${v.savedBy}` : ""}
                          </div>
                        </div>
                        <button onClick={() => revertDocToVersion(doc.id, v.id)} disabled={reverting === v.id} style={{ fontSize: "12px", padding: "4px 10px", borderRadius: "6px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }}>
                          {reverting === v.id ? "Reverting..." : "Revert"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Nested attachments — these belong to the note, NOT top-level file rows */}
            <div style={{ padding: "14px 16px" }}>
              <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: "10px" }}>Attachments</div>
              {doc.attachments.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "10px" }}>
                  {doc.attachments.map(att => (
                    <div key={att.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px", background: "var(--color-background-secondary)", borderRadius: "7px", border: "0.5px solid var(--color-border-tertiary)" }}>
                      <FileThumb file={att as PreviewFile} size={32} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {canPreview(att as PreviewFile) ? (
                          <button onClick={() => openNoteAttachmentPreview(att, doc.attachments)} style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-primary)", background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title="Preview">
                            {att.originalName}
                          </button>
                        ) : (
                          <a href={downloadHref(att.id)} download={att.originalName} style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-primary)", textDecoration: "none" }}>{att.originalName}</a>
                        )}
                        <div style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>{formatBytes(att.size)} · {new Date(att.createdAt).toLocaleDateString()}</div>
                      </div>
                      {canPreview(att as PreviewFile) && (
                        <button onClick={() => openNoteAttachmentPreview(att, doc.attachments)} style={{ ...ghostBtn, flexShrink: 0 }}>Preview</button>
                      )}
                      <a href={downloadHref(att.id)} download={att.originalName} style={{ ...ghostBtn, textDecoration: "none", flexShrink: 0 }}>Download</a>
                      <button onClick={() => deleteNoteAttachment(doc.id, att.id)} style={{ ...ghostBtn, color: "var(--color-text-danger)", flexShrink: 0 }}>Remove</button>
                    </div>
                  ))}
                </div>
              )}
              <div
                style={{ border: `1.5px dashed ${noteDragOver === doc.id ? "var(--color-text-secondary)" : "var(--color-border-secondary)"}`, borderRadius: "8px", padding: "12px 16px", textAlign: "center", cursor: "pointer", background: noteDragOver === doc.id ? "var(--color-background-hover)" : "transparent", transition: "all 0.15s" }}
                onClick={() => { setNoteUploadingTo(doc.id); noteFileRef.current?.click() }}
                onDragOver={e => { e.preventDefault(); setNoteDragOver(doc.id) }}
                onDragLeave={() => setNoteDragOver(null)}
                onDrop={e => { e.preventDefault(); setNoteDragOver(null); if (e.dataTransfer.files.length) uploadNoteFiles(doc.id, e.dataTransfer.files) }}
              >
                <span style={{ fontSize: "13px", color: "var(--color-text-muted)" }}>
                  {noteUploading && noteUploadingTo === doc.id ? "Uploading..." : "Drop files here or click to attach to this note (max 100MB each)"}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ===========================================================================
  // Render: file row
  // ===========================================================================
  function renderFileRow(f: FileItem): JSX.Element {
    const key = `f:${f.id}`
    const fileFolder = f.folderId ? folders.find(x => x.id === f.folderId) : null
    return (
      <div key={f.id} style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "10px", background: "var(--color-background-secondary)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px" }}>
          <input type="checkbox" checked={selected.has(key)} onChange={() => toggleSelect(key)} />
          <div onClick={() => openFilePreview(f)} title={canPreview(f as PreviewFile) ? "Click to preview" : "Click to download"} style={{ cursor: "pointer", flexShrink: 0 }}>
            <FileThumb file={f as PreviewFile} size={40} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {renamingFileId === f.id ? (
              <input
                autoFocus
                value={renameFileVal}
                onChange={e => setRenameFileVal(e.target.value)}
                onBlur={() => renameFile(f.id)}
                onKeyDown={e => { if (e.key === "Enter") renameFile(f.id); if (e.key === "Escape") setRenamingFileId(null) }}
                style={{ width: "100%", fontSize: 13, padding: "3px 6px", borderRadius: 5, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" }}
              />
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <button onClick={() => openFilePreview(f)} title={f.originalName} style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-text-primary)", background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
                  {f.originalName}
                </button>
                {f.version > 1 && (
                  <span title={`Version ${f.version}`} style={{ fontSize: 10, padding: "1px 6px", borderRadius: 6, background: "var(--color-background-hover)", color: "var(--color-text-muted)", fontWeight: 600 }}>v{f.version}</span>
                )}
                {f.portalVisible && (
                  <span title="Shared to customer portal" style={{ fontSize: 10, padding: "1px 6px", borderRadius: 6, background: "rgba(34,197,94,0.16)", color: "#22c55e", fontWeight: 600 }}>👁 Portal</span>
                )}
                {f.assetId && (
                  <span title="Linked to an asset" style={{ fontSize: 10, padding: "1px 6px", borderRadius: 6, background: "rgba(59,130,246,0.16)", color: "#3b82f6", fontWeight: 600 }}>🔗 Asset</span>
                )}
                {fileFolder && selectedFolderId === null && (
                  <span style={{ fontSize: "11px", padding: "1px 7px", borderRadius: "8px", background: "var(--color-background-hover)", color: "var(--color-text-muted)" }}>📁 {fileFolder.name}</span>
                )}
              </div>
            )}
            <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 3, display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span>{formatBytes(f.size)}</span>
              {fileExt(f.originalName) && (<><span>·</span><span>{fileExt(f.originalName)}</span></>)}
              <span>·</span>
              <span>{new Date(f.createdAt).toLocaleDateString()}</span>
            </div>
          </div>

          {/* Row actions */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <a href={downloadHref(f.id)} download={f.originalName} style={{ ...ghostBtn, textDecoration: "none" }} title="Download">Download</a>
            <div style={{ position: "relative" }}>
              <button onClick={() => { setFileMenuOpen(fileMenuOpen === f.id ? null : f.id); setFileMovePickerFor(null) }} style={{ ...ghostBtn, fontSize: 16, lineHeight: 1, color: "var(--color-text-muted)" }} title="More actions">···</button>
              {fileMenuOpen === f.id && fileMovePickerFor !== f.id && (
                <div
                  onMouseLeave={() => setFileMenuOpen(null)}
                  style={{ position: "absolute", right: 0, top: "100%", zIndex: 50, background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: 8, padding: 4, minWidth: 180, boxShadow: "0 4px 12px rgba(0,0,0,0.3)" }}
                >
                  {[
                    { label: "👁 Preview", action: () => { setFileMenuOpen(null); openFilePreview(f) } },
                    { label: "⬇ Download", action: () => { setFileMenuOpen(null); window.location.href = downloadHref(f.id) } },
                    { label: "Rename", action: () => { setFileMenuOpen(null); setRenamingFileId(f.id); setRenameFileVal(f.originalName) } },
                    { label: "Replace…", action: () => { setFileMenuOpen(null); triggerReplace(f.id) } },
                    { label: `Versions${f.version > 1 ? ` (${f.version})` : ""}`, action: () => { setFileMenuOpen(null); toggleFileVersions(f.id) } },
                    { label: f.portalVisible ? "👁 Unshare from portal" : "Share to portal", action: () => { setFileMenuOpen(null); togglePortalFile(f) } },
                    { label: "🤖 Build asset", action: () => { setFileMenuOpen(null); setBuildAssetFile({ id: f.id, originalName: f.originalName, mimeType: f.mimeType, detectedMime: f.detectedMime ?? null }) } },
                    { label: "Move to…", action: () => { setFileMovePickerFor(f.id) } },
                    { label: "Delete", danger: true, action: () => { setFileMenuOpen(null); removeFile(f.id) } },
                  ].map(item => (
                    <button key={item.label} onClick={item.action} style={{
                      display: "block", width: "100%", textAlign: "left", padding: "6px 10px",
                      fontSize: 12, border: "none", background: "transparent", cursor: "pointer",
                      color: (item as any).danger ? "var(--color-text-danger)" : "var(--color-text-primary)", borderRadius: 5,
                    }}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--color-background-hover)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >{item.label}</button>
                  ))}
                </div>
              )}
              {fileMenuOpen === f.id && fileMovePickerFor === f.id && (
                <FolderPickerMenu
                  flatFolders={flatFolders}
                  onPick={folderId => { setFileMovePickerFor(null); setFileMenuOpen(null); moveFile(f.id, folderId) }}
                  onClose={() => { setFileMovePickerFor(null); setFileMenuOpen(null) }}
                />
              )}
            </div>
          </div>
        </div>

        {/* Versions inline */}
        {fileVersionsOpen === f.id && (
          <div style={{ padding: "0 16px 14px 16px" }}>
            <div style={{ paddingTop: 8, borderTop: "0.5px solid var(--color-border-tertiary)" }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 6 }}>Version history</div>
              {fileVersionsLoading === f.id ? (
                <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Loading…</div>
              ) : !fileVersions[f.id] || fileVersions[f.id].length === 0 ? (
                <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>No prior versions.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {fileVersions[f.id].map(v => (
                    <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 10, color: "var(--color-text-muted)", width: 26, flexShrink: 0 }}>v{v.version}</span>
                      <a href={downloadHref(v.id)} download={v.originalName} style={{ fontSize: 11, color: "var(--color-text-primary)", textDecoration: "none", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.originalName}</a>
                      {v.isCurrent && <span style={{ fontSize: 10, color: "var(--color-text-muted)", flexShrink: 0 }}>current</span>}
                      <span style={{ fontSize: 10, color: "var(--color-text-muted)", flexShrink: 0 }}>{formatBytes(v.size)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ===========================================================================
  // Render
  // ===========================================================================
  return (
    <div onPaste={onPaste} style={{ display: "flex", flexWrap: "wrap", gap: "0", minHeight: "400px" }}>

      {/* === Folder sidebar === */}
      <div style={{
        width: "220px", flexShrink: 0, minWidth: "180px",
        borderRight: "0.5px solid var(--color-border-tertiary)",
        marginRight: "20px",
        display: "flex", flexDirection: "column",
      }}>
        <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px", paddingLeft: "8px" }}>
          Folders
        </div>

        {/* All pseudo-folder */}
        <div
          onClick={() => setSelectedFolderId(null)}
          style={{ display: "flex", alignItems: "center", gap: "6px", padding: "5px 8px", borderRadius: "6px", cursor: "pointer", marginBottom: "2px", background: selectedFolderId === null ? "var(--color-background-hover)" : "transparent" }}
          onMouseEnter={e => { if (selectedFolderId !== null) e.currentTarget.style.background = "var(--color-background-hover)" }}
          onMouseLeave={e => { if (selectedFolderId !== null) e.currentTarget.style.background = "transparent" }}
        >
          <span style={{ fontSize: "13px" }}>📂</span>
          <span style={{ fontSize: "13px", color: selectedFolderId === null ? "var(--color-text-primary)" : "var(--color-text-secondary)", fontWeight: selectedFolderId === null ? 500 : 400, flex: 1 }}>All</span>
          <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>{docs.length + files.length}</span>
        </div>

        <div style={{ flex: 1 }}>
          {tree.map(node => (
            <FolderItem
              key={node.id}
              node={node}
              countFor={countFor}
              selected={selectedFolderId}
              onSelect={id => setSelectedFolderId(id)}
              onRename={renameFolder}
              onDelete={deleteFolder}
              onNewChild={parentId => { setNewFolderParent(parentId); setNewFolderName("") }}
              depth={0}
            />
          ))}
        </div>

        {newFolderParent !== null ? (
          <div style={{ marginTop: "8px", padding: "8px", background: "var(--color-background-secondary)", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)" }}>
            <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginBottom: "4px" }}>
              {newFolderParent === "__root__" ? "New top-level folder" : "New subfolder"}
            </div>
            <input
              autoFocus
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") createFolder(); if (e.key === "Escape") setNewFolderParent(null) }}
              placeholder="Folder name"
              style={{ ...inp, marginBottom: "6px", padding: "5px 8px" }}
            />
            <div style={{ display: "flex", gap: "6px" }}>
              <button onClick={createFolder} disabled={savingFolder || !newFolderName.trim()} style={{ fontSize: "12px", padding: "4px 10px", borderRadius: "6px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>
                {savingFolder ? "..." : "Create"}
              </button>
              <button onClick={() => setNewFolderParent(null)} style={{ fontSize: "12px", padding: "4px 8px", borderRadius: "6px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>Cancel</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => { setNewFolderParent("__root__"); setNewFolderName("") }}
            style={{ marginTop: "8px", fontSize: "12px", color: "var(--color-text-muted)", background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: "4px 8px", borderRadius: "6px" }}
            onMouseEnter={e => (e.currentTarget.style.color = "var(--color-text-secondary)")}
            onMouseLeave={e => (e.currentTarget.style.color = "var(--color-text-muted)")}
          >+ New folder</button>
        )}
      </div>

      {/* === Mixed list === */}
      <div style={{ flex: 1, minWidth: "280px" }}>

        {/* Header bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          <div style={{ fontSize: "14px", color: "var(--color-text-secondary)", marginRight: 4 }}>
            {selectedFolderName ? <span>📁 {selectedFolderName}</span> : <span style={{ color: "var(--color-text-muted)" }}>All documents &amp; files</span>}
          </div>
          <div style={{ flex: 1 }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Search notes & files…"
            style={{ fontSize: 13, padding: "6px 10px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", width: 200, boxSizing: "border-box" }}
          />
          <select value={sort} onChange={e => setSort(e.target.value as SortKey)} title="Sort" style={{ fontSize: 13, padding: "6px 8px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", cursor: "pointer" }}>
            <option value="date">Date (newest)</option>
            <option value="name">Name (A–Z)</option>
            <option value="size">Size</option>
          </select>
          <button onClick={() => setShowNewDoc(true)} style={smallBtn}>+ New note</button>
          <button onClick={() => fileInputRef.current?.click()} style={{ ...smallBtn, fontWeight: 500 }}>📎 Upload</button>
          <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={e => { if (e.target.files?.length) uploadMany(e.target.files); e.target.value = "" }} />
          <input ref={replaceRef} type="file" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) doReplace(f); e.target.value = "" }} />
          <input ref={noteFileRef} type="file" multiple style={{ display: "none" }} onChange={e => { if (e.target.files?.length && noteUploadingTo) uploadNoteFiles(noteUploadingTo, e.target.files); e.target.value = "" }} />
        </div>

        {err && <div style={{ fontSize: 12, color: "var(--color-text-danger)", marginBottom: 10 }}>{err}</div>}

        {/* Bulk toolbar */}
        {selectedCount > 0 && (
          <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", marginBottom: 10, borderRadius: 8, background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-secondary)" }}>
            <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{selectedCount} selected</span>
            <button onClick={bulkDelete} disabled={bulkBusy} style={{ ...smallBtn, color: "var(--color-text-danger)" }}>🗑 Delete</button>
            <button onClick={bulkZip} disabled={bulkBusy} style={smallBtn}>⬇ Download .zip</button>
            <div style={{ position: "relative" }}>
              <button onClick={() => setBulkMoveOpen(o => !o)} disabled={bulkBusy} style={smallBtn}>📁 Move to…</button>
              {bulkMoveOpen && (
                <FolderPickerMenu flatFolders={flatFolders} onPick={bulkMove} onClose={() => setBulkMoveOpen(false)} />
              )}
            </div>
            <div style={{ flex: 1 }} />
            <button onClick={() => setSelected(new Set())} style={ghostBtn}>Clear</button>
          </div>
        )}

        {/* New note form */}
        {showNewDoc && (
          <div style={{ background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: "10px", padding: "20px", marginBottom: "16px" }}>
            <div style={{ fontSize: "15px", fontWeight: 500, marginBottom: "16px" }}>New note</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={lbl}>Title *</label>
                <input autoFocus value={newForm.title} onChange={e => setNewForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Network Overview, VPN Access, Emergency Contacts" style={inp} />
              </div>
              <div>
                <label style={lbl}>Folder</label>
                <select value={newForm.folderId ?? (selectedFolderId ?? "")} onChange={e => setNewForm(f => ({ ...f, folderId: e.target.value || null }))} style={inp}>
                  <option value="">(No folder)</option>
                  {flatFolders.map(({ folder, level }) => (
                    <option key={folder.id} value={folder.id}>{" ".repeat(level * 3)}{folder.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", paddingTop: "22px" }}>
                <input type="checkbox" id="pin-new" checked={newForm.isPinned} onChange={e => setNewForm(f => ({ ...f, isPinned: e.target.checked }))} />
                <label htmlFor="pin-new" style={{ fontSize: "13px", color: "var(--color-text-secondary)", cursor: "pointer" }}>Pin to top</label>
              </div>
            </div>
            <div style={{ marginBottom: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "0.5px solid var(--color-border-tertiary)", marginBottom: "8px" }}>
                <label style={{ ...lbl, marginBottom: 0, paddingBottom: "4px" }}>Content <span style={{ color: "var(--color-text-muted)", fontSize: "12px" }}>(markdown)</span></label>
                <div style={{ display: "flex" }}>
                  {(["write", "preview"] as const).map(tab => (
                    <button key={tab} onClick={() => setDocContentTab("new", tab)} style={{ fontSize: "12px", padding: "2px 10px", border: "none", background: "transparent", cursor: "pointer", color: getContentTab("new") === tab ? "var(--color-text-primary)" : "var(--color-text-muted)", fontWeight: getContentTab("new") === tab ? 600 : 400, borderBottom: getContentTab("new") === tab ? "2px solid var(--color-text-primary)" : "2px solid transparent", marginBottom: "-1px" }}>
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              {getContentTab("new") === "write" ? (
                <textarea value={newForm.content} onChange={e => setNewForm(f => ({ ...f, content: e.target.value }))} rows={10} placeholder="Write your note content in markdown..." style={{ ...inp, fontFamily: "monospace", fontSize: "13px", resize: "vertical", lineHeight: 1.6 }} />
              ) : (
                <div className="markdown-body" style={{ padding: "12px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", minHeight: "120px", fontSize: "14px", lineHeight: 1.7 }}
                  dangerouslySetInnerHTML={{ __html: newForm.content ? marked(newForm.content) as string : '<span style="color:var(--color-text-muted)">Nothing to preview.</span>' }} />
              )}
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={createDoc} disabled={savingDoc} style={{ fontSize: "14px", fontWeight: 500, padding: "8px 18px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>
                {savingDoc ? "Saving..." : "Create"}
              </button>
              <button onClick={() => setShowNewDoc(false)} style={{ fontSize: "14px", padding: "8px 14px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>Cancel</button>
            </div>
          </div>
        )}

        {/* Drop zone */}
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.length) uploadMany(e.dataTransfer.files) }}
          style={{ border: `1.5px dashed ${dragOver ? "var(--color-text-secondary)" : "var(--color-border-secondary)"}`, borderRadius: 8, padding: "12px 16px", textAlign: "center", cursor: "pointer", background: dragOver ? "var(--color-background-hover)" : "transparent", marginBottom: 12, transition: "all 0.15s" }}
        >
          <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
            Drop files here, paste a screenshot, or click to upload{selectedFolderName ? ` into “${selectedFolderName}”` : ""} (max 100MB each)
          </span>
        </div>

        {/* In-flight uploads */}
        {uploadList.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
            {uploadList.map(u => (
              <div key={u.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 7, background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: u.error ? "var(--color-text-danger)" : "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</div>
                  {u.error ? (
                    <div style={{ fontSize: 11, color: "var(--color-text-danger)", marginTop: 2 }}>{u.error}</div>
                  ) : (
                    <div style={{ height: 4, borderRadius: 2, background: "var(--color-border-tertiary)", marginTop: 5, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${u.pct}%`, background: "var(--color-text-secondary)", transition: "width 0.15s" }} />
                    </div>
                  )}
                </div>
                <span style={{ fontSize: 11, color: "var(--color-text-muted)", flexShrink: 0 }}>{u.error ? "Failed" : u.done ? "Done" : `${u.pct}%`}</span>
              </div>
            ))}
          </div>
        )}

        {/* Body: loading / empty / list */}
        {loading ? (
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)", padding: "8px 0" }}>Loading…</div>
        ) : totalVisible === 0 ? (
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)", padding: "24px 0", textAlign: "center" }}>
            {q
              ? "Nothing matches your search."
              : selectedFolderId
                ? "This folder is empty. Add a note or upload files above."
                : "No documents or files yet. Add a note or upload files above to get started."}
          </div>
        ) : (
          <>
            {/* Pinned notes group */}
            {pinnedNotes.length > 0 && (
              <div style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>Pinned</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {pinnedNotes.map(renderNoteRow)}
                </div>
              </div>
            )}

            {/* The rest, mixed */}
            {restRows.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {restRows.map(r => (r.kind === "note" ? renderNoteRow(r.doc) : renderFileRow(r.file)))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Lightbox (shared by file rows + note attachments) */}
      <AttachmentPreview
        file={previewing}
        files={previewList}
        onClose={() => setPreviewing(null)}
        onNavigate={n => setPreviewing(n)}
      />

      {/* Build asset modal */}
      <BuildAssetModal
        file={buildAssetFile}
        clientId={clientId}
        onClose={() => setBuildAssetFile(null)}
        onBuilt={r => { if (buildAssetFile) onAssetBuilt(r, buildAssetFile.id) }}
      />

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 1100, background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: 10, padding: "10px 18px", fontSize: 13, color: "var(--color-text-primary)", boxShadow: "0 8px 28px rgba(0,0,0,0.4)" }}>
          {toast}
        </div>
      )}
    </div>
  )
}
