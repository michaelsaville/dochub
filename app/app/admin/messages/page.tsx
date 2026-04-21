"use client"

import AppShell from "@/components/AppShell"
import { useEffect, useMemo, useState } from "react"

type TemplateRow = {
  key: string
  name: string
  description: string
  category: string
  sampleVars: unknown
  subject: string
  body: string
  renderError: string | null
}

type LogRow = {
  id: string
  templateKey: string
  toEmail: string
  toName: string | null
  subject: string
  status: string
  errorMessage: string | null
  sentAt: string
}

type ApiResponse = {
  templates: TemplateRow[]
  log: LogRow[]
  totalSent: number
  totalFailed: number
}

function formatWhen(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString()
}

export default function AdminMessagesPage() {
  const [tab, setTab] = useState<"templates" | "log">("templates")
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [templateFilter, setTemplateFilter] = useState("")
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams()
      if (search) qs.set("q", search)
      if (templateFilter) qs.set("template", templateFilter)
      const res = await fetch(`/api/admin/messages?${qs.toString()}`)
      if (res.status === 401 || res.status === 403) {
        setError("You need to be signed in as an ADMIN to view this page.")
        setData(null)
        return
      }
      if (!res.ok) {
        setError(`Failed to load (HTTP ${res.status})`)
        return
      }
      setData((await res.json()) as ApiResponse)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const templatesByCategory = useMemo(() => {
    const byCat = new Map<string, TemplateRow[]>()
    if (!data) return byCat
    for (const t of data.templates) {
      if (!byCat.has(t.category)) byCat.set(t.category, [])
      byCat.get(t.category)!.push(t)
    }
    return byCat
  }, [data])

  return (
    <AppShell>
      <div style={{ padding: "32px", maxWidth: "1100px" }}>
        <div style={{ marginBottom: "24px" }}>
          <h1 style={{ fontSize: "22px", fontWeight: 500, marginBottom: "4px" }}>Messages</h1>
          <p style={{ fontSize: "14px", color: "var(--muted)" }}>
            {loading
              ? "Loading…"
              : data
                ? `${data.templates.length} template${data.templates.length === 1 ? "" : "s"} · ${data.totalSent} sent · ${data.totalFailed} failed`
                : "—"}
          </p>
        </div>

        {error && (
          <div style={{ marginBottom: "16px", padding: "12px 16px", border: "1px solid var(--danger, #dc2626)", background: "rgba(220,38,38,0.05)", color: "var(--danger, #dc2626)", borderRadius: "8px", fontSize: "13px" }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
          <button
            onClick={() => setTab("templates")}
            style={{
              padding: "6px 14px",
              fontSize: "13px",
              borderRadius: "6px",
              border: "1px solid var(--border)",
              background: tab === "templates" ? "var(--text)" : "var(--surface)",
              color: tab === "templates" ? "var(--surface)" : "var(--text)",
              cursor: "pointer",
            }}
          >
            Templates {data ? `(${data.templates.length})` : ""}
          </button>
          <button
            onClick={() => setTab("log")}
            style={{
              padding: "6px 14px",
              fontSize: "13px",
              borderRadius: "6px",
              border: "1px solid var(--border)",
              background: tab === "log" ? "var(--text)" : "var(--surface)",
              color: tab === "log" ? "var(--surface)" : "var(--text)",
              cursor: "pointer",
            }}
          >
            Sent log
          </button>
        </div>

        {tab === "templates" ? (
          <div>
            {!data || data.templates.length === 0 ? (
              <div style={{ padding: "40px", textAlign: "center", border: "1px dashed var(--border)", borderRadius: "8px", color: "var(--muted)", fontSize: "13px" }}>
                No templates registered.
              </div>
            ) : (
              Array.from(templatesByCategory.entries()).map(([cat, items]) => (
                <div key={cat} style={{ marginBottom: "24px" }}>
                  <div style={{ fontFamily: "monospace", fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)", marginBottom: "8px" }}>
                    {cat}
                  </div>
                  {items.map((t) => {
                    const isOpen = !!expanded[t.key]
                    return (
                      <div key={t.key} style={{ border: "1px solid var(--border)", borderRadius: "8px", background: "var(--surface)", padding: "16px", marginBottom: "10px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "12px", flexWrap: "wrap" }}>
                          <div>
                            <div style={{ fontWeight: 500, fontSize: "14px" }}>{t.name}</div>
                            <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "2px" }}>{t.description}</div>
                          </div>
                          <code style={{ fontSize: "11px", color: "var(--muted)", fontFamily: "monospace" }}>{t.key}</code>
                        </div>
                        <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "10px" }}>
                          <span style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>Subject:</span>{" "}
                          <span style={{ color: "var(--text)" }}>{t.renderError ? `(render failed: ${t.renderError})` : t.subject}</span>
                        </div>
                        <button
                          onClick={() => setExpanded((p) => ({ ...p, [t.key]: !isOpen }))}
                          style={{ marginTop: "10px", background: "transparent", border: "none", color: "var(--accent, #3b82f6)", cursor: "pointer", fontSize: "12px", padding: 0 }}
                        >
                          {isOpen ? "Hide preview ↑" : "Preview with sample data ↓"}
                        </button>
                        {isOpen && !t.renderError && (
                          <div style={{ marginTop: "10px" }}>
                            <iframe
                              srcDoc={t.body}
                              title={`${t.key} preview`}
                              style={{ width: "100%", height: "420px", background: "#fff", border: "1px solid var(--border)", borderRadius: "6px" }}
                            />
                            <div style={{ marginTop: "8px", padding: "10px 12px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "6px" }}>
                              <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted)", marginBottom: "4px" }}>Sample vars</div>
                              <pre style={{ fontSize: "11px", margin: 0, overflow: "auto", color: "var(--text)" }}>
                                {JSON.stringify(t.sampleVars, null, 2)}
                              </pre>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))
            )}
          </div>
        ) : (
          <div>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                load()
              }}
              style={{ display: "flex", gap: "8px", alignItems: "flex-end", marginBottom: "12px", flexWrap: "wrap" }}
            >
              <label style={{ fontSize: "12px" }}>
                <div style={{ color: "var(--muted)", marginBottom: "4px" }}>Search</div>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="email / name / subject"
                  style={{ padding: "6px 10px", fontSize: "13px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", borderRadius: "6px" }}
                />
              </label>
              <label style={{ fontSize: "12px" }}>
                <div style={{ color: "var(--muted)", marginBottom: "4px" }}>Template</div>
                <select
                  value={templateFilter}
                  onChange={(e) => setTemplateFilter(e.target.value)}
                  style={{ padding: "6px 10px", fontSize: "13px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", borderRadius: "6px" }}
                >
                  <option value="">any</option>
                  {data?.templates.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.key}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                style={{ padding: "6px 14px", fontSize: "13px", background: "var(--text)", color: "var(--surface)", border: "none", borderRadius: "6px", cursor: "pointer" }}
              >
                Filter
              </button>
              {(search || templateFilter) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("")
                    setTemplateFilter("")
                    setTimeout(load, 0)
                  }}
                  style={{ padding: "6px 10px", fontSize: "12px", background: "transparent", color: "var(--muted)", border: "none", cursor: "pointer" }}
                >
                  clear
                </button>
              )}
            </form>

            {!data || data.log.length === 0 ? (
              <div style={{ padding: "40px", textAlign: "center", border: "1px dashed var(--border)", borderRadius: "8px", color: "var(--muted)", fontSize: "13px" }}>
                No messages match.
              </div>
            ) : (
              <div style={{ border: "1px solid var(--border)", borderRadius: "8px", background: "var(--surface)", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ background: "var(--bg)", textAlign: "left" }}>
                      <th style={{ padding: "8px 12px", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", fontWeight: 600 }}>When</th>
                      <th style={{ padding: "8px 12px", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", fontWeight: 600 }}>To</th>
                      <th style={{ padding: "8px 12px", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", fontWeight: 600 }}>Template</th>
                      <th style={{ padding: "8px 12px", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", fontWeight: 600 }}>Subject</th>
                      <th style={{ padding: "8px 12px", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)", fontWeight: 600, width: "90px" }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.log.map((m) => (
                      <tr key={m.id} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ padding: "8px 12px", fontSize: "12px", color: "var(--muted)", whiteSpace: "nowrap" }}>{formatWhen(m.sentAt)}</td>
                        <td style={{ padding: "8px 12px" }}>
                          <div>{m.toEmail}</div>
                          {m.toName && <div style={{ fontSize: "11px", color: "var(--muted)" }}>{m.toName}</div>}
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          <code style={{ fontSize: "11px", color: "var(--muted)", fontFamily: "monospace" }}>{m.templateKey}</code>
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          <div>{m.subject}</div>
                          {m.errorMessage && (
                            <div style={{ fontSize: "11px", color: "var(--danger, #dc2626)", marginTop: "2px" }}>{m.errorMessage}</div>
                          )}
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "2px 8px",
                              borderRadius: "10px",
                              fontSize: "11px",
                              fontWeight: 500,
                              background: m.status === "SENT" ? "rgba(34,197,94,0.12)" : "rgba(220,38,38,0.12)",
                              color: m.status === "SENT" ? "var(--success, #15803d)" : "var(--danger, #dc2626)",
                            }}
                          >
                            {m.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ padding: "6px 12px", fontSize: "11px", color: "var(--muted)", borderTop: "1px solid var(--border)" }}>Most recent 100 shown.</div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  )
}
