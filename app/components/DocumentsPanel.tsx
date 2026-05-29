"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { marked } from "marked"
import ShareExternallyButton from "@/components/ShareExternallyButton"

type Attachment = {
  id: string
  originalName: string
  mimeType: string
  size: number
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
  createdAt: string
  updatedAt: string
  attachments: Attachment[]
}

type Folder = {
  id: string
  name: string
  parentId: string | null
  order: number
}

type FolderNode = Folder & { children: FolderNode[] }

type Props = {
  docs: Doc[]
  clientId: string
  onDocsChange: (docs: Doc[]) => void
}

const inp = {
  width: "100%", padding: "8px 12px", fontSize: "14px",
  border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px",
  background: "var(--color-background-primary)", color: "var(--color-text-primary)",
  boxSizing: "border-box" as const,
}
const lbl: React.CSSProperties = { fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function fileIcon(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "🖼"
  if (mimeType === "application/pdf") return "📄"
  if (mimeType.includes("word") || mimeType.includes("document")) return "📝"
  if (mimeType.includes("sheet") || mimeType.includes("excel")) return "📊"
  if (mimeType.includes("zip") || mimeType.includes("compressed")) return "🗜"
  return "📎"
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
  // Sort children by order then name
  function sortNodes(nodes: FolderNode[]) {
    nodes.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
    nodes.forEach(n => sortNodes(n.children))
  }
  sortNodes(roots)
  return roots
}

// Flatten tree for dropdown, with indentation level
function flattenTree(nodes: FolderNode[], level = 0): { folder: FolderNode; level: number }[] {
  const result: { folder: FolderNode; level: number }[] = []
  nodes.forEach(n => {
    result.push({ folder: n, level })
    result.push(...flattenTree(n.children, level + 1))
  })
  return result
}

function docCountInFolder(docs: Doc[], folderId: string): number {
  return docs.filter(d => d.folderId === folderId).length
}

// Recursive folder tree item
function FolderItem({
  node,
  docs,
  selected,
  onSelect,
  onRename,
  onDelete,
  onNewChild,
  depth,
}: {
  node: FolderNode
  docs: Doc[]
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
  const count = docCountInFolder(docs, node.id)
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
        {/* Expand toggle */}
        <span
          onClick={e => { e.stopPropagation(); setExpanded(x => !x) }}
          style={{ fontSize: "10px", color: "var(--color-text-muted)", width: "12px", flexShrink: 0, userSelect: "none" }}
        >
          {hasChildren ? (expanded ? "▼" : "▶") : ""}
        </span>

        {/* Folder icon */}
        <span style={{ fontSize: "13px", flexShrink: 0 }}>
          {expanded && hasChildren ? "📂" : "📁"}
        </span>

        {/* Name / rename input */}
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

        {/* Doc count */}
        {!renaming && count > 0 && (
          <span style={{ fontSize: "11px", color: "var(--color-text-muted)", flexShrink: 0 }}>{count}</span>
        )}

        {/* Actions menu */}
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

      {/* Children */}
      {expanded && hasChildren && (
        <div>
          {node.children.map(child => (
            <FolderItem key={child.id} node={child} docs={docs} selected={selected}
              onSelect={onSelect} onRename={onRename} onDelete={onDelete} onNewChild={onNewChild} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function DocumentsPanel({ docs, clientId, onDocsChange }: Props) {
  const [folders, setFolders] = useState<Folder[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null) // null = All
  const [newFolderParent, setNewFolderParent] = useState<string | null | "__root__">(null)
  const [newFolderName, setNewFolderName] = useState("")
  const [savingFolder, setSavingFolder] = useState(false)

  const [expandedDoc, setExpandedDoc] = useState<string | null>(null)
  const [editingDoc, setEditingDoc] = useState<string | null>(null)
  const [showNewDoc, setShowNewDoc] = useState(false)
  const [contentTab, setContentTab] = useState<Record<string, "write" | "preview">>({})

  const [newForm, setNewForm] = useState({ title: "", content: "", category: "", isPinned: false, folderId: null as string | null })
  const [editForm, setEditForm] = useState<any>({})
  const [saving, setSaving] = useState(false)

  const [uploadingTo, setUploadingTo] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)

  const [versionsOpen, setVersionsOpen] = useState<string | null>(null)
  const [docVersions, setDocVersions] = useState<Record<string, { id: string; title: string; savedAt: string; savedBy: string | null }[]>>({})
  const [loadingVersions, setLoadingVersions] = useState<Record<string, boolean>>({})
  const [reverting, setReverting] = useState<string | null>(null)

  const fetchFolders = useCallback(async () => {
    const res = await fetch(`/api/clients/${clientId}/folders`)
    if (res.ok) setFolders(await res.json())
  }, [clientId])

  useEffect(() => { fetchFolders() }, [fetchFolders])

  const tree = buildTree(folders)
  const flatFolders = flattenTree(tree)

  const visibleDocs = selectedFolderId === null
    ? docs
    : docs.filter(d => d.folderId === selectedFolderId)

  function getContentTab(docId: string): "write" | "preview" {
    return contentTab[docId] ?? "write"
  }
  function setDocContentTab(docId: string, tab: "write" | "preview") {
    setContentTab(t => ({ ...t, [docId]: tab }))
  }

  async function createDoc() {
    if (!newForm.title.trim()) return
    setSaving(true)
    try {
      const folderId = newForm.folderId ?? (selectedFolderId !== null ? selectedFolderId : null)
      const res = await fetch(`/api/clients/${clientId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newForm, folderId }),
      })
      if (res.ok) {
        const doc = await res.json()
        onDocsChange([doc, ...docs])
        setExpandedDoc(doc.id)
        setNewForm({ title: "", content: "", category: "", isPinned: false, folderId: null })
        setShowNewDoc(false)
      }
    } finally { setSaving(false) }
  }

  async function saveDoc(docId: string) {
    setSaving(true)
    try {
      const res = await fetch(`/api/documents/${docId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      })
      if (res.ok) {
        const updated = await res.json()
        onDocsChange(docs.map(d => d.id === docId ? updated : d))
        setEditingDoc(null)
      }
    } finally { setSaving(false) }
  }

  async function deleteDoc(docId: string) {
    if (!confirm("Delete this document and all its attachments?")) return
    await fetch(`/api/documents/${docId}`, { method: "DELETE" })
    onDocsChange(docs.filter(d => d.id !== docId))
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
      const newDocs = docs.map(d => d.id === doc.id ? updated : d)
        .sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0))
      onDocsChange(newDocs)
    }
  }

  // Share/unshare a doc to the customer portal. Default deny — internal
  // runbooks stay private unless a tech explicitly opts them in.
  async function togglePortalVisible(doc: Doc) {
    const res = await fetch(`/api/documents/${doc.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ portalVisible: !doc.portalVisible }),
    })
    if (res.ok) {
      const updated = await res.json()
      onDocsChange(docs.map(d => d.id === doc.id ? updated : d))
    }
  }

  async function uploadFile(docId: string, file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch(`/api/documents/${docId}/attachments`, { method: "POST", body: fd })
      if (res.ok) {
        const att = await res.json()
        onDocsChange(docs.map(d => d.id === docId ? { ...d, attachments: [...d.attachments, att] } : d))
      } else {
        const err = await res.json()
        alert(err.error || "Upload failed")
      }
    } finally { setUploading(false); setUploadingTo(null) }
  }

  async function deleteAttachment(docId: string, attId: string) {
    await fetch(`/api/attachments/${attId}`, { method: "DELETE" })
    onDocsChange(docs.map(d => d.id === docId ? { ...d, attachments: d.attachments.filter(a => a.id !== attId) } : d))
  }

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
    if (!confirm("Delete this folder? Documents inside will be moved to its parent folder.")) return
    await fetch(`/api/folders/${id}`, { method: "DELETE" })
    if (selectedFolderId === id) setSelectedFolderId(null)
    await fetchFolders()
    // Refresh docs since their folderId may have changed
    const res = await fetch(`/api/clients/${clientId}/documents`)
    if (res.ok) onDocsChange(await res.json())
  }

  async function fetchVersions(docId: string) {
    setLoadingVersions(v => ({ ...v, [docId]: true }))
    try {
      const res = await fetch(`/api/documents/${docId}/versions`)
      if (res.ok) { const data = await res.json(); setDocVersions(v => ({ ...v, [docId]: data })) }
    } finally {
      setLoadingVersions(v => ({ ...v, [docId]: false }))
    }
  }

  async function revertToVersion(docId: string, versionId: string) {
    if (!confirm("Revert to this version? The current content will be saved as a new version first.")) return
    setReverting(versionId)
    try {
      const res = await fetch(`/api/documents/${docId}/versions/${versionId}/revert`, { method: "POST" })
      if (res.ok) {
        const updated = await res.json()
        onDocsChange(docs.map(d => d.id === docId ? updated : d))
        // Refresh version list
        await fetchVersions(docId)
      }
    } finally { setReverting(null) }
  }

  const pinned = visibleDocs.filter(d => d.isPinned)
  const unpinned = visibleDocs.filter(d => !d.isPinned)
  const grouped = [
    ...(pinned.length ? [{ label: "Pinned", items: pinned }] : []),
    ...(unpinned.length ? [{ label: pinned.length ? "Documents" : "", items: unpinned }] : []),
  ]

  const selectedFolderName = selectedFolderId ? folders.find(f => f.id === selectedFolderId)?.name : null

  return (
    <div style={{ display: "flex", gap: "0", minHeight: "400px" }}>

      {/* === Folder sidebar === */}
      <div style={{
        width: "220px", flexShrink: 0,
        borderRight: "0.5px solid var(--color-border-tertiary)",
        paddingRight: "0", marginRight: "20px",
        display: "flex", flexDirection: "column",
      }}>
        <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px", paddingLeft: "8px" }}>
          Folders
        </div>

        {/* All Documents */}
        <div
          onClick={() => setSelectedFolderId(null)}
          style={{
            display: "flex", alignItems: "center", gap: "6px",
            padding: "5px 8px", borderRadius: "6px", cursor: "pointer", marginBottom: "2px",
            background: selectedFolderId === null ? "var(--color-background-hover)" : "transparent",
          }}
          onMouseEnter={e => { if (selectedFolderId !== null) e.currentTarget.style.background = "var(--color-background-hover)" }}
          onMouseLeave={e => { if (selectedFolderId !== null) e.currentTarget.style.background = "transparent" }}
        >
          <span style={{ fontSize: "13px" }}>📋</span>
          <span style={{ fontSize: "13px", color: selectedFolderId === null ? "var(--color-text-primary)" : "var(--color-text-secondary)", fontWeight: selectedFolderId === null ? 500 : 400, flex: 1 }}>All Documents</span>
          <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>{docs.length}</span>
        </div>

        {/* Folder tree */}
        <div style={{ flex: 1 }}>
          {tree.map(node => (
            <FolderItem
              key={node.id}
              node={node}
              docs={docs}
              selected={selectedFolderId}
              onSelect={id => setSelectedFolderId(id)}
              onRename={renameFolder}
              onDelete={deleteFolder}
              onNewChild={parentId => { setNewFolderParent(parentId); setNewFolderName("") }}
              depth={0}
            />
          ))}
        </div>

        {/* New folder inline form */}
        {newFolderParent !== null ? (
          <div style={{ marginTop: "8px", padding: "8px", background: "var(--color-background-secondary)", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)" }}>
            <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginBottom: "4px" }}>
              {newFolderParent === "__root__" ? "New top-level folder" : `New subfolder`}
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
              <button onClick={() => setNewFolderParent(null)} style={{ fontSize: "12px", padding: "4px 8px", borderRadius: "6px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => { setNewFolderParent("__root__"); setNewFolderName("") }}
            style={{ marginTop: "8px", fontSize: "12px", color: "var(--color-text-muted)", background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: "4px 8px", borderRadius: "6px" }}
            onMouseEnter={e => (e.currentTarget.style.color = "var(--color-text-secondary)")}
            onMouseLeave={e => (e.currentTarget.style.color = "var(--color-text-muted)")}
          >
            + New folder
          </button>
        )}
      </div>

      {/* === Doc list === */}
      <div style={{ flex: 1, minWidth: 0 }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div style={{ fontSize: "14px", color: "var(--color-text-secondary)" }}>
            {selectedFolderName ? (
              <span>📁 {selectedFolderName}</span>
            ) : (
              <span style={{ color: "var(--color-text-muted)" }}>All Documents</span>
            )}
          </div>
          <button onClick={() => setShowNewDoc(true)} style={{ fontSize: "14px", fontWeight: 500, padding: "8px 16px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: "pointer" }}>
            New document
          </button>
        </div>

        {/* New doc form */}
        {showNewDoc && (
          <div style={{ background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: "10px", padding: "20px", marginBottom: "16px" }}>
            <div style={{ fontSize: "15px", fontWeight: 500, marginBottom: "16px" }}>New document</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={lbl}>Title *</label>
                <input autoFocus value={newForm.title} onChange={e => setNewForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Network Overview, VPN Access, Emergency Contacts" style={inp} />
              </div>
              <div>
                <label style={lbl}>Folder</label>
                <select
                  value={newForm.folderId ?? (selectedFolderId ?? "")}
                  onChange={e => setNewForm(f => ({ ...f, folderId: e.target.value || null }))}
                  style={{ ...inp }}
                >
                  <option value="">(No folder)</option>
                  {flatFolders.map(({ folder, level }) => (
                    <option key={folder.id} value={folder.id}>
                      {"\u00a0".repeat(level * 3)}{folder.name}
                    </option>
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
                <textarea value={newForm.content} onChange={e => setNewForm(f => ({ ...f, content: e.target.value }))} rows={10} placeholder="Write your document content in markdown..." style={{ ...inp, fontFamily: "monospace", fontSize: "13px", resize: "vertical", lineHeight: 1.6 }} />
              ) : (
                <div className="markdown-body" style={{ padding: "12px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", minHeight: "120px", fontSize: "14px", lineHeight: 1.7 }}
                  dangerouslySetInnerHTML={{ __html: newForm.content ? marked(newForm.content) as string : '<span style="color:var(--color-text-muted)">Nothing to preview.</span>' }} />
              )}
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={createDoc} disabled={saving} style={{ fontSize: "14px", fontWeight: 500, padding: "8px 18px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>
                {saving ? "Saving..." : "Create"}
              </button>
              <button onClick={() => setShowNewDoc(false)} style={{ fontSize: "14px", padding: "8px 14px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>Cancel</button>
            </div>
          </div>
        )}

        {visibleDocs.length === 0 && !showNewDoc && (
          <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>
            {selectedFolderId ? "No documents in this folder." : "No documents yet."}
          </div>
        )}

        {grouped.map(group => (
          <div key={group.label} style={{ marginBottom: "16px" }}>
            {group.label && <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>{group.label}</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {group.items.map(doc => {
                const docFolder = doc.folderId ? folders.find(f => f.id === doc.folderId) : null
                return (
                  <div key={doc.id} style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "10px", overflow: "hidden" }}>

                    {/* Doc header row */}
                    <div
                      style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px", background: "var(--color-background-secondary)", cursor: "pointer" }}
                      onClick={() => setExpandedDoc(expandedDoc === doc.id ? null : doc.id)}
                    >
                      <span style={{ fontSize: "14px" }}>{doc.isPinned ? "📌" : "📄"}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                          <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-text-primary)" }}>{doc.title}</span>
                          {docFolder && selectedFolderId === null && (
                            <span style={{ fontSize: "11px", padding: "1px 7px", borderRadius: "8px", background: "var(--color-background-hover)", color: "var(--color-text-muted)" }}>📁 {docFolder.name}</span>
                          )}
                          {doc.attachments.length > 0 && (
                            <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>📎 {doc.attachments.length}</span>
                          )}
                        </div>
                        <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "2px" }}>
                          Updated {new Date(doc.updatedAt).toLocaleDateString()}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "8px", flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                        <button onClick={() => togglePin(doc)} style={{ fontSize: "11px", color: doc.isPinned ? "#f59e0b" : "var(--color-text-muted)", background: "none", border: "none", cursor: "pointer", padding: 0 }} title={doc.isPinned ? "Unpin" : "Pin"}>
                          {doc.isPinned ? "📌 Unpin" : "Pin"}
                        </button>
                        <button onClick={() => togglePortalVisible(doc)} style={{ fontSize: "11px", color: doc.portalVisible ? "#22c55e" : "var(--color-text-muted)", background: "none", border: "none", cursor: "pointer", padding: 0 }} title={doc.portalVisible ? "Visible to customer portal — click to make private" : "Private — click to share with customer portal"}>
                          {doc.portalVisible ? "👁 Portal" : "Share to portal"}
                        </button>
                        <button onClick={() => { setEditingDoc(doc.id); setEditForm({ title: doc.title, content: doc.content ?? "", category: doc.category ?? "", isPinned: doc.isPinned, folderId: doc.folderId ?? null }); setExpandedDoc(doc.id) }}
                          style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Edit</button>
                        <button
                          onClick={() => {
                            const next = versionsOpen === doc.id ? null : doc.id
                            setVersionsOpen(next)
                            if (next && !docVersions[doc.id]) fetchVersions(doc.id)
                            if (!expandedDoc || expandedDoc !== doc.id) setExpandedDoc(doc.id)
                          }}
                          style={{ fontSize: "12px", color: versionsOpen === doc.id ? "var(--color-text-primary)" : "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                        >History</button>
                        <ShareExternallyButton resourceType="document" resourceId={doc.id} compact label="Share" />
                        <button onClick={() => deleteDoc(doc.id)}
                          style={{ fontSize: "12px", color: "var(--color-text-danger)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Delete</button>
                      </div>
                      <span style={{ fontSize: "12px", color: "var(--color-text-muted)", flexShrink: 0 }}>{expandedDoc === doc.id ? "▲" : "▼"}</span>
                    </div>

                    {/* Doc expanded body */}
                    {expandedDoc === doc.id && (
                      <div style={{ background: "var(--color-background-primary)" }}>
                        {editingDoc === doc.id ? (
                          /* Edit form */
                          <div style={{ padding: "20px" }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                              <div style={{ gridColumn: "1 / -1" }}>
                                <label style={lbl}>Title</label>
                                <input value={editForm.title ?? ""} onChange={e => setEditForm((f: any) => ({ ...f, title: e.target.value }))} style={inp} />
                              </div>
                              <div>
                                <label style={lbl}>Folder</label>
                                <select
                                  value={editForm.folderId ?? ""}
                                  onChange={e => setEditForm((f: any) => ({ ...f, folderId: e.target.value || null }))}
                                  style={{ ...inp }}
                                >
                                  <option value="">(No folder)</option>
                                  {flatFolders.map(({ folder, level }) => (
                                    <option key={folder.id} value={folder.id}>
                                      {"\u00a0".repeat(level * 3)}{folder.name}
                                    </option>
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
                              <button onClick={() => saveDoc(doc.id)} disabled={saving} style={{ fontSize: "13px", fontWeight: 500, padding: "7px 16px", borderRadius: "7px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>
                                {saving ? "Saving..." : "Save"}
                              </button>
                              <button onClick={() => setEditingDoc(null)} style={{ fontSize: "13px", padding: "7px 12px", borderRadius: "7px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          /* Read view */
                          doc.content ? (
                            <div className="markdown-body" style={{ padding: "20px", fontSize: "14px", lineHeight: 1.75, borderBottom: doc.attachments.length > 0 || uploadingTo === doc.id ? "0.5px solid var(--color-border-tertiary)" : "none" }}
                              dangerouslySetInnerHTML={{ __html: marked(doc.content) as string }} />
                          ) : (
                            <div style={{ padding: "16px 20px", fontSize: "13px", color: "var(--color-text-muted)", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>No content yet — click Edit to add.</div>
                          )
                        )}

                        {/* Version history panel */}
                        {versionsOpen === doc.id && (
                          <div style={{ padding: "14px 16px", borderTop: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-secondary)" }}>
                            <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: "10px" }}>Version history</div>
                            {loadingVersions[doc.id] ? (
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
                                    <button
                                      onClick={() => revertToVersion(doc.id, v.id)}
                                      disabled={reverting === v.id}
                                      style={{ fontSize: "12px", padding: "4px 10px", borderRadius: "6px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }}
                                    >
                                      {reverting === v.id ? "Reverting..." : "Revert"}
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Attachments section */}
                        <div style={{ padding: "14px 16px" }}>
                          <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: "10px" }}>Attachments</div>

                          {doc.attachments.length > 0 && (
                            <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "10px" }}>
                              {doc.attachments.map(att => (
                                <div key={att.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px", background: "var(--color-background-secondary)", borderRadius: "7px", border: "0.5px solid var(--color-border-tertiary)" }}>
                                  <span style={{ fontSize: "16px" }}>{fileIcon(att.mimeType)}</span>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <a href={`/api/attachments/${att.id}`} download={att.originalName} style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-primary)", textDecoration: "none" }}
                                      onMouseEnter={e => (e.currentTarget.style.textDecoration = "underline")}
                                      onMouseLeave={e => (e.currentTarget.style.textDecoration = "none")}>
                                      {att.originalName}
                                    </a>
                                    <div style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>{formatBytes(att.size)} · {new Date(att.createdAt).toLocaleDateString()}</div>
                                  </div>
                                  <button onClick={() => deleteAttachment(doc.id, att.id)} style={{ fontSize: "12px", color: "var(--color-text-danger)", background: "none", border: "none", cursor: "pointer", padding: 0, flexShrink: 0 }}>Remove</button>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Upload area */}
                          <div
                            style={{ border: `1.5px dashed ${dragOver === doc.id ? "var(--color-text-secondary)" : "var(--color-border-secondary)"}`, borderRadius: "8px", padding: "12px 16px", textAlign: "center", cursor: "pointer", background: dragOver === doc.id ? "var(--color-background-hover)" : "transparent", transition: "all 0.15s" }}
                            onClick={() => { setUploadingTo(doc.id); fileRef.current?.click() }}
                            onDragOver={e => { e.preventDefault(); setDragOver(doc.id) }}
                            onDragLeave={() => setDragOver(null)}
                            onDrop={e => { e.preventDefault(); setDragOver(null); const f = e.dataTransfer.files[0]; if (f) uploadFile(doc.id, f) }}
                          >
                            <span style={{ fontSize: "13px", color: "var(--color-text-muted)" }}>
                              {uploading && uploadingTo === doc.id ? "Uploading..." : "Drop a file here or click to attach (max 25MB)"}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        style={{ display: "none" }}
        onChange={e => {
          const f = e.target.files?.[0]
          if (f && uploadingTo) uploadFile(uploadingTo, f)
          e.target.value = ""
        }}
      />
    </div>
  )
}
