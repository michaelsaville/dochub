"use client"

import { useState, useEffect } from "react"
import { usePortalUser } from "../layout"
import { marked } from "marked"

type Doc = {
  id: string; title: string; content: string | null; category: string | null
  isPinned: boolean; updatedAt: string
  folder: { id: string; name: string } | null
}

export default function PortalDocuments() {
  const user = usePortalUser()
  const [docs, setDocs] = useState<Doc[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    fetch("/api/portal/documents")
      .then(r => r.ok ? r.json() : [])
      .then(setDocs)
      .finally(() => setLoading(false))
  }, [user])

  if (!user?.permissions.documents) return <div style={{ color: "var(--color-text-secondary)" }}>Access not enabled for this section.</div>

  return (
    <div>
      <h1 style={{ fontSize: "20px", fontWeight: 500, marginBottom: "4px" }}>Documents</h1>
      <p style={{ fontSize: "14px", color: "var(--color-text-secondary)", marginBottom: "24px" }}>Information and guides shared by your IT team.</p>

      {loading && <div style={{ color: "var(--color-text-secondary)" }}>Loading...</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {docs.map(doc => (
          <div key={doc.id} style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "10px", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px", background: "var(--color-background-secondary)", cursor: "pointer" }}
              onClick={() => setExpandedId(expandedId === doc.id ? null : doc.id)}>
              <span style={{ fontSize: "14px" }}>{doc.isPinned ? "📌" : "📄"}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-text-primary)" }}>{doc.title}</span>
                  {doc.folder && <span style={{ fontSize: "11px", padding: "1px 7px", borderRadius: "8px", background: "var(--color-background-hover)", color: "var(--color-text-muted)" }}>📁 {doc.folder.name}</span>}
                </div>
                <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "2px" }}>Updated {new Date(doc.updatedAt).toLocaleDateString()}</div>
              </div>
              <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>{expandedId === doc.id ? "▲" : "▼"}</span>
            </div>
            {expandedId === doc.id && doc.content && (
              <div className="markdown-body" style={{ padding: "20px", fontSize: "14px", lineHeight: 1.75, background: "var(--color-background-primary)" }}
                dangerouslySetInnerHTML={{ __html: marked(doc.content) as string }} />
            )}
            {expandedId === doc.id && !doc.content && (
              <div style={{ padding: "16px 20px", fontSize: "13px", color: "var(--color-text-muted)", background: "var(--color-background-primary)" }}>No content.</div>
            )}
          </div>
        ))}
      </div>
      {!loading && docs.length === 0 && <div style={{ color: "var(--color-text-secondary)" }}>No documents available.</div>}
    </div>
  )
}
