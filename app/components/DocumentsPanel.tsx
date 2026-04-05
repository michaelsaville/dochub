"use client"

import { useState, useRef } from "react"
import { marked } from "marked"

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
  isPinned: boolean
  createdAt: string
  updatedAt: string
  attachments: Attachment[]
}

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

export default function DocumentsPanel({ docs, clientId, onDocsChange }: Props) {
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null)
  const [editingDoc, setEditingDoc] = useState<string | null>(null)
  const [showNewDoc, setShowNewDoc] = useState(false)
  const [contentTab, setContentTab] = useState<Record<string, "write" | "preview">>({})

  const [newForm, setNewForm] = useState({ title: "", content: "", category: "", isPinned: false })
  const [editForm, setEditForm] = useState<any>({})
  const [saving, setSaving] = useState(false)

  const [uploadingTo, setUploadingTo] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)

  // Unique categories from existing docs
  const categories = [...new Set(docs.map(d => d.category).filter(Boolean))] as string[]

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
      const res = await fetch(`/api/clients/${clientId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newForm),
      })
      if (res.ok) {
        const doc = await res.json()
        onDocsChange([doc, ...docs])
        setExpandedDoc(doc.id)
        setNewForm({ title: "", content: "", category: "", isPinned: false })
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

  const pinned = docs.filter(d => d.isPinned)
  const unpinned = docs.filter(d => !d.isPinned)
  const grouped = [
    ...(pinned.length ? [{ label: "Pinned", items: pinned }] : []),
    ...(unpinned.length ? [{ label: pinned.length ? "Documents" : "", items: unpinned }] : []),
  ]

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px" }}>
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
              <label style={lbl}>Category</label>
              <input value={newForm.category} onChange={e => setNewForm(f => ({ ...f, category: e.target.value }))} placeholder="e.g. Network, Security, Contacts" list="cat-list" style={inp} />
              <datalist id="cat-list">{categories.map(c => <option key={c} value={c} />)}</datalist>
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

      {docs.length === 0 && !showNewDoc && (
        <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>No documents yet.</div>
      )}

      {grouped.map(group => (
        <div key={group.label} style={{ marginBottom: "16px" }}>
          {group.label && <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>{group.label}</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {group.items.map(doc => (
              <div key={doc.id} style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "10px", overflow: "hidden" }}>

                {/* Doc header row */}
                <div
                  style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px", background: "var(--color-background-secondary)", cursor: "pointer" }}
                  onClick={() => setExpandedDoc(expandedDoc === doc.id ? null : doc.id)}
                >
                  <span style={{ fontSize: "14px" }}>{doc.isPinned ? "📌" : "📄"}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-text-primary)" }}>{doc.title}</span>
                      {doc.category && (
                        <span style={{ fontSize: "11px", padding: "1px 7px", borderRadius: "8px", background: "var(--color-background-hover)", color: "var(--color-text-muted)" }}>{doc.category}</span>
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
                    <button onClick={() => { setEditingDoc(doc.id); setEditForm({ title: doc.title, content: doc.content ?? "", category: doc.category ?? "", isPinned: doc.isPinned }); setExpandedDoc(doc.id) }}
                      style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Edit</button>
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
                            <label style={lbl}>Category</label>
                            <input value={editForm.category ?? ""} onChange={e => setEditForm((f: any) => ({ ...f, category: e.target.value }))} list="cat-list" style={inp} />
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
            ))}
          </div>
        </div>
      ))}

      {/* Hidden file input shared across all docs */}
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
