"use client"

import AppShell from "@/components/AppShell"
import Sheet from "@/components/Sheet"
import DataCards, { type DataColumn } from "@/components/DataCards"
import { useCallback, useEffect, useState } from "react"

type Facet = { value: string; count: number }

type FieldRow = {
  id: string
  changedAt: string
  entityType: string
  entityId: string
  field: string
  oldValue: string | null
  newValue: string | null
  changedBy: string | null
  isReveal: boolean
}

type ActivityRow = {
  id: string
  createdAt: string
  eventType: string
  title: string
  body: string | null
  clientId: string
  clientName: string | null
  staff: string | null
  visibleToClient: boolean
}

type ApiResponse = {
  view: "field" | "activity"
  rows: (FieldRow | ActivityRow)[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
  facets: {
    entityTypes?: Facet[]
    fields?: Facet[]
    sources?: Facet[]
    eventTypes?: Facet[]
  }
}

const thStyle: React.CSSProperties = {
  padding: "8px 12px",
  fontSize: "11px",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--muted)",
  fontWeight: 600,
}
const tdStyle: React.CSSProperties = { padding: "8px 12px", fontSize: "13px", verticalAlign: "top" }
const labelStyle: React.CSSProperties = { fontSize: "12px" }
const inputStyle: React.CSSProperties = {
  padding: "6px 10px",
  fontSize: "13px",
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--text)",
  borderRadius: "6px",
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString()
}

function Mono({ children }: { children: React.ReactNode }) {
  return <code style={{ fontSize: "11px", color: "var(--muted)", fontFamily: "var(--mono)" }}>{children}</code>
}

function SourceBadge({ source }: { source: string | null }) {
  const s = source ?? "unknown"
  const danger = s === "vendor-portal" || s === "share" || s === "api-key"
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: "10px",
        fontSize: "11px",
        fontWeight: 500,
        background: danger ? "rgba(255,77,109,0.12)" : "rgba(61,111,255,0.12)",
        color: danger ? "var(--danger)" : "var(--accent)",
      }}
    >
      {s}
    </span>
  )
}

type AuditTab = "field" | "activity" | "secure"

export default function AuditLogPage() {
  const [tab, setTab] = useState<AuditTab>("field")
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(0)

  // shared filters
  const [search, setSearch] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  // field-view filters
  const [entityType, setEntityType] = useState("")
  const [fieldName, setFieldName] = useState("")
  const [source, setSource] = useState("")
  const [revealsOnly, setRevealsOnly] = useState(false)
  // activity-view filters
  const [eventType, setEventType] = useState("")

  const load = useCallback(
    async (toPage = page) => {
      setLoading(true)
      setError(null)
      try {
        const qs = new URLSearchParams()
        qs.set("view", tab)
        qs.set("page", String(toPage))
        if (search) qs.set("q", search)
        if (from) qs.set("from", from)
        if (to) qs.set("to", to)
        if (tab === "field") {
          if (entityType) qs.set("entityType", entityType)
          if (fieldName) qs.set("field", fieldName)
          if (source) qs.set("source", source)
          if (revealsOnly) qs.set("revealsOnly", "1")
        } else {
          if (eventType) qs.set("eventType", eventType)
        }
        const res = await fetch(`/api/admin/audit?${qs.toString()}`)
        if (res.status === 401 || res.status === 403) {
          setError("You need to be signed in as an ADMIN to view the audit log.")
          setData(null)
          return
        }
        if (!res.ok) {
          setError(`Failed to load (HTTP ${res.status})`)
          return
        }
        setData((await res.json()) as ApiResponse)
        setPage(toPage)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tab, search, from, to, entityType, fieldName, source, revealsOnly, eventType, page]
  )

  // reload from page 0 whenever the tab changes (the Secure Log tab loads
  // itself via the module-scope <SecureLogTab> component).
  useEffect(() => {
    if (tab !== "secure") load(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  function applyFilters(e: React.FormEvent) {
    e.preventDefault()
    load(0)
  }

  function clearFilters() {
    setSearch("")
    setFrom("")
    setTo("")
    setEntityType("")
    setFieldName("")
    setSource("")
    setRevealsOnly(false)
    setEventType("")
    setTimeout(() => load(0), 0)
  }

  const facets = data?.facets ?? {}
  const fieldRows = tab === "field" ? ((data?.rows as FieldRow[]) ?? []) : []
  const activityRows = tab === "activity" ? ((data?.rows as ActivityRow[]) ?? []) : []

  return (
    <AppShell>
      <div style={{ padding: "32px", maxWidth: "1200px" }}>
        <div style={{ marginBottom: "24px" }}>
          <h1 style={{ fontSize: "22px", fontWeight: 500, marginBottom: "4px" }}>Audit Log</h1>
          <p style={{ fontSize: "14px", color: "var(--muted)" }}>
            {tab === "secure"
              ? "Secure Log is append-only and cryptographically verified; Field/Activity are the legacy live views."
              : loading
                ? "Loading…"
                : data
                  ? `${data.total.toLocaleString()} ${tab === "field" ? "field-history entries" : "activity events"} · showing page ${data.page + 1}`
                  : "—"}
          </p>
        </div>

        {error && (
          <div
            style={{
              marginBottom: "16px",
              padding: "12px 16px",
              border: "1px solid var(--danger)",
              background: "rgba(255,77,109,0.05)",
              color: "var(--danger)",
              borderRadius: "8px",
              fontSize: "13px",
            }}
          >
            {error}
          </div>
        )}

        {/* tabs */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
          {(["field", "activity", "secure"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "6px 14px",
                fontSize: "13px",
                borderRadius: "6px",
                border: "1px solid var(--border)",
                background: tab === t ? "var(--text)" : "var(--surface)",
                color: tab === t ? "var(--surface)" : "var(--text)",
                cursor: "pointer",
              }}
            >
              {t === "field" ? "Field history & reveals" : t === "activity" ? "Activity events" : "Secure Log"}
            </button>
          ))}
        </div>

        {tab === "secure" && <SecureLogTab />}

        {/* filters */}
        {tab !== "secure" && (
        <form
          onSubmit={applyFilters}
          style={{ display: "flex", gap: "8px", alignItems: "flex-end", marginBottom: "12px", flexWrap: "wrap" }}
        >
          <label style={labelStyle}>
            <div style={{ color: "var(--muted)", marginBottom: "4px" }}>Search</div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tab === "field" ? "actor / id / value" : "title / body / client"}
              style={inputStyle}
            />
          </label>

          {tab === "field" ? (
            <>
              <label style={labelStyle}>
                <div style={{ color: "var(--muted)", marginBottom: "4px" }}>Entity</div>
                <select value={entityType} onChange={(e) => setEntityType(e.target.value)} style={inputStyle}>
                  <option value="">any</option>
                  {facets.entityTypes?.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.value} ({f.count})
                    </option>
                  ))}
                </select>
              </label>
              <label style={labelStyle}>
                <div style={{ color: "var(--muted)", marginBottom: "4px" }}>Field</div>
                <select
                  value={fieldName}
                  onChange={(e) => setFieldName(e.target.value)}
                  disabled={revealsOnly || !!source}
                  style={{ ...inputStyle, opacity: revealsOnly || source ? 0.5 : 1 }}
                >
                  <option value="">any</option>
                  {facets.fields?.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.value} ({f.count})
                    </option>
                  ))}
                </select>
              </label>
              <label style={labelStyle}>
                <div style={{ color: "var(--muted)", marginBottom: "4px" }}>Reveal source</div>
                <select value={source} onChange={(e) => setSource(e.target.value)} style={inputStyle}>
                  <option value="">any</option>
                  {facets.sources?.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.value} ({f.count})
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: "6px", paddingBottom: "7px" }}>
                <input type="checkbox" checked={revealsOnly} onChange={(e) => setRevealsOnly(e.target.checked)} />
                <span style={{ color: "var(--muted)" }}>Reveals only</span>
              </label>
            </>
          ) : (
            <label style={labelStyle}>
              <div style={{ color: "var(--muted)", marginBottom: "4px" }}>Event type</div>
              <select value={eventType} onChange={(e) => setEventType(e.target.value)} style={inputStyle}>
                <option value="">any</option>
                {facets.eventTypes?.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.value} ({f.count})
                  </option>
                ))}
              </select>
            </label>
          )}

          <label style={labelStyle}>
            <div style={{ color: "var(--muted)", marginBottom: "4px" }}>From</div>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inputStyle} />
          </label>
          <label style={labelStyle}>
            <div style={{ color: "var(--muted)", marginBottom: "4px" }}>To</div>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inputStyle} />
          </label>

          <button
            type="submit"
            style={{ padding: "6px 14px", fontSize: "13px", background: "var(--text)", color: "var(--surface)", border: "none", borderRadius: "6px", cursor: "pointer" }}
          >
            Filter
          </button>
          <button
            type="button"
            onClick={clearFilters}
            style={{ padding: "6px 10px", fontSize: "12px", background: "transparent", color: "var(--muted)", border: "none", cursor: "pointer" }}
          >
            clear
          </button>
        </form>
        )}

        {/* table */}
        {tab !== "secure" && (loading && !data ? (
          <div style={{ padding: "40px", textAlign: "center", color: "var(--muted)", fontSize: "13px" }}>Loading…</div>
        ) : !data || data.rows.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", border: "1px dashed var(--border)", borderRadius: "8px", color: "var(--muted)", fontSize: "13px" }}>
            No entries match.
          </div>
        ) : (
          <div style={{ border: "1px solid var(--border)", borderRadius: "8px", background: "var(--surface)", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "var(--bg)", textAlign: "left" }}>
                  <th style={{ ...thStyle, width: "160px" }}>When</th>
                  {tab === "field" ? (
                    <>
                      <th style={thStyle}>Entity</th>
                      <th style={thStyle}>Change</th>
                      <th style={{ ...thStyle, width: "220px" }}>Actor</th>
                    </>
                  ) : (
                    <>
                      <th style={{ ...thStyle, width: "150px" }}>Type</th>
                      <th style={thStyle}>Event</th>
                      <th style={{ ...thStyle, width: "200px" }}>Client / Staff</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {tab === "field"
                  ? fieldRows.map((r) => (
                      <tr key={r.id} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ ...tdStyle, color: "var(--muted)", whiteSpace: "nowrap", fontSize: "12px" }}>{formatWhen(r.changedAt)}</td>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 500 }}>{r.entityType}</div>
                          <Mono>{r.entityId}</Mono>
                        </td>
                        <td style={tdStyle}>
                          {r.isReveal ? (
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <span style={{ fontWeight: 600, color: "var(--warn)" }}>REVEAL</span>
                              <SourceBadge source={r.newValue} />
                            </div>
                          ) : (
                            <div>
                              <span style={{ fontWeight: 500 }}>{r.field}</span>
                              <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "2px" }}>
                                {r.oldValue === null && r.newValue === null ? (
                                  <span style={{ fontStyle: "italic" }}>(value not logged)</span>
                                ) : (
                                  <>
                                    <span style={{ color: "var(--danger)" }}>{r.oldValue ?? "∅"}</span>
                                    {" → "}
                                    <span style={{ color: "var(--accent2)" }}>{r.newValue ?? "∅"}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          )}
                        </td>
                        <td style={tdStyle}>{r.changedBy ?? <span style={{ color: "var(--muted)" }}>unknown</span>}</td>
                      </tr>
                    ))
                  : activityRows.map((r) => (
                      <tr key={r.id} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ ...tdStyle, color: "var(--muted)", whiteSpace: "nowrap", fontSize: "12px" }}>{formatWhen(r.createdAt)}</td>
                        <td style={tdStyle}>
                          <Mono>{r.eventType}</Mono>
                        </td>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 500 }}>{r.title}</div>
                          {r.body && <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "2px" }}>{r.body}</div>}
                          {r.visibleToClient && (
                            <span style={{ fontSize: "10px", color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.06em" }}>client-visible</span>
                          )}
                        </td>
                        <td style={tdStyle}>
                          {r.clientName && (
                            <a href={`/clients/${r.clientId}`} style={{ color: "var(--accent)", textDecoration: "none" }}>
                              {r.clientName}
                            </a>
                          )}
                          {r.staff && <div style={{ fontSize: "12px", color: "var(--muted)" }}>{r.staff}</div>}
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>

            {/* pager */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderTop: "1px solid var(--border)", fontSize: "12px", color: "var(--muted)" }}>
              <span>
                {data.total.toLocaleString()} total · {data.pageSize} per page
              </span>
              <span style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <button
                  onClick={() => load(page - 1)}
                  disabled={page === 0 || loading}
                  style={{ padding: "4px 10px", fontSize: "12px", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--surface)", color: page === 0 ? "var(--muted)" : "var(--text)", cursor: page === 0 ? "default" : "pointer" }}
                >
                  ← Prev
                </button>
                <span>Page {page + 1}</span>
                <button
                  onClick={() => load(page + 1)}
                  disabled={!data.hasMore || loading}
                  style={{ padding: "4px 10px", fontSize: "12px", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--surface)", color: !data.hasMore ? "var(--muted)" : "var(--text)", cursor: !data.hasMore ? "default" : "pointer" }}
                >
                  Next →
                </button>
              </span>
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  )
}

// ─── Secure Log (tamper-evident AuditLog) ─────────────────────────────────────
// Kept at module scope (NOT inline in AuditLogPage) so its inputs don't remount
// and lose focus on every parent render.

type SecureRow = {
  seq: string
  id: string
  at: string
  actorType: string
  actorId: string | null
  actorLabel: string
  action: string
  entityType: string | null
  entityId: string | null
  clientId: string | null
  metadata: unknown
  summary: string
  ip: string | null
  userAgent: string | null
  prevHash: string
  hash: string
}

type VerifyResult = {
  ok: boolean
  checked: number
  brokenAt: string | null
  brokenSeq: string | null
  latestSeq: string | null
  headHash: string | null
  headPointerMatches: boolean
  keyed: boolean
  generatedAt: string
}

type SecureResponse = {
  rows: SecureRow[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
  facets: { actions: Facet[]; actorTypes: Facet[] }
}

function ActionBadge({ action }: { action: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: "10px",
        fontSize: "11px",
        fontWeight: 600,
        fontFamily: "var(--mono)",
        background: "rgba(61,111,255,0.12)",
        color: "var(--accent)",
      }}
    >
      {action}
    </span>
  )
}

function SecureLogTab() {
  const [data, setData] = useState<SecureResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [page, setPage] = useState(0)

  const [verify, setVerify] = useState<VerifyResult | null>(null)
  const [verifying, setVerifying] = useState(true)

  const [selected, setSelected] = useState<SecureRow | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  // filters
  const [q, setQ] = useState("")
  const [action, setAction] = useState("")
  const [actorType, setActorType] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")

  const loadVerify = useCallback(async () => {
    setVerifying(true)
    try {
      const res = await fetch("/api/admin/audit/verify")
      if (res.ok) setVerify((await res.json()) as VerifyResult)
      else setVerify(null)
    } catch {
      setVerify(null)
    } finally {
      setVerifying(false)
    }
  }, [])

  const loadLogs = useCallback(
    async (toPage: number) => {
      setLoading(true)
      setErr(null)
      try {
        const qs = new URLSearchParams()
        qs.set("page", String(toPage))
        if (q) qs.set("q", q)
        if (action) qs.set("action", action)
        if (actorType) qs.set("actorType", actorType)
        if (from) qs.set("from", from)
        if (to) qs.set("to", to)
        const res = await fetch(`/api/admin/audit/logs?${qs.toString()}`)
        if (res.status === 401 || res.status === 403) {
          setErr("ADMIN role required to view the Secure Log.")
          setData(null)
          return
        }
        if (!res.ok) {
          setErr(`Failed to load (HTTP ${res.status})`)
          return
        }
        setData((await res.json()) as SecureResponse)
        setPage(toPage)
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    },
    [q, action, actorType, from, to],
  )

  useEffect(() => {
    loadVerify()
    loadLogs(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function copy(text: string) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(text)
      setTimeout(() => setCopied(null), 1500)
    })
  }

  const banner = (() => {
    if (verifying && !verify) {
      return { bg: "var(--card)", border: "var(--border)", color: "var(--muted)", glyph: "…", text: "Verifying chain…" }
    }
    if (!verify) {
      return { bg: "var(--card)", border: "var(--border)", color: "var(--muted)", glyph: "?", text: "Verification unavailable." }
    }
    if (verify.ok) {
      return {
        bg: "rgba(0,212,170,0.08)",
        border: "rgba(0,212,170,0.4)",
        color: "var(--accent2)",
        glyph: "✓",
        text:
          `Chain verified — ${verify.checked.toLocaleString()} entries` +
          (verify.latestSeq ? `, seq 1…${verify.latestSeq}` : ""),
      }
    }
    return {
      bg: "rgba(255,77,109,0.08)",
      border: "var(--danger)",
      color: "var(--danger)",
      glyph: "✗",
      text: `Chain BROKEN at seq ${verify.brokenSeq ?? "?"} — a row was altered, deleted, or reordered.`,
    }
  })()

  const columns: DataColumn<SecureRow>[] = [
    { key: "action", label: "Action", primary: true, render: (r) => <ActionBadge action={r.action} /> },
    { key: "seq", label: "Seq", mono: true, render: (r) => r.seq },
    { key: "at", label: "When", render: (r) => formatWhen(r.at) },
    {
      key: "actor",
      label: "Actor",
      render: (r) => (
        <span>
          {r.actorLabel} <span style={{ color: "var(--muted)", fontSize: "11px" }}>({r.actorType})</span>
        </span>
      ),
    },
    {
      key: "entity",
      label: "Entity",
      render: (r) => (r.entityType ? `${r.entityType}${r.entityId ? " · " + r.entityId.slice(0, 8) : ""}` : "—"),
    },
    { key: "summary", label: "Summary", render: (r) => r.summary },
  ]

  return (
    <div>
      {/* verify banner */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 5,
          marginBottom: "16px",
          padding: "14px 16px",
          border: `1px solid ${banner.border}`,
          background: banner.bg,
          borderRadius: "10px",
          display: "flex",
          alignItems: "center",
          gap: "14px",
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: "26px", lineHeight: 1, color: banner.color, fontWeight: 700 }}>{banner.glyph}</span>
        <div style={{ flex: 1, minWidth: "200px" }}>
          <div style={{ fontSize: "14px", fontWeight: 600, color: banner.color }}>{banner.text}</div>
          <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "2px" }}>
            {verify && !verify.keyed && (
              <span style={{ color: "var(--warn)" }}>Unkeyed (dev fallback HMAC key) · </span>
            )}
            {verify && !verify.headPointerMatches && (
              <span style={{ color: "var(--warn)" }}>Head pointer drift · </span>
            )}
            Tamper-EVIDENT (HMAC hash-chain), not tamper-proof.
            {verify && ` Checked ${new Date(verify.generatedAt).toLocaleString()}.`}
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button className="btn btn-secondary" onClick={loadVerify} disabled={verifying}>
            {verifying ? "Verifying…" : "Re-verify"}
          </button>
          <a className="btn btn-primary" href="/api/admin/audit/export" download>
            Export evidence
          </a>
          <a className="btn btn-ghost" href="/api/admin/audit/export?format=csv" download>
            CSV
          </a>
        </div>
      </div>

      {err && (
        <div
          style={{
            marginBottom: "16px",
            padding: "12px 16px",
            border: "1px solid var(--danger)",
            background: "rgba(255,77,109,0.05)",
            color: "var(--danger)",
            borderRadius: "8px",
            fontSize: "13px",
          }}
        >
          {err}
        </div>
      )}

      {/* filters */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          loadLogs(0)
        }}
        style={{ display: "flex", gap: "8px", alignItems: "flex-end", marginBottom: "12px", flexWrap: "wrap" }}
      >
        <label style={labelStyle}>
          <div style={{ color: "var(--muted)", marginBottom: "4px" }}>Search</div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="actor / action / summary / id" style={inputStyle} />
        </label>
        <label style={labelStyle}>
          <div style={{ color: "var(--muted)", marginBottom: "4px" }}>Action</div>
          <select value={action} onChange={(e) => setAction(e.target.value)} style={inputStyle}>
            <option value="">any</option>
            {data?.facets.actions.map((f) => (
              <option key={f.value} value={f.value}>
                {f.value} ({f.count})
              </option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          <div style={{ color: "var(--muted)", marginBottom: "4px" }}>Actor type</div>
          <select value={actorType} onChange={(e) => setActorType(e.target.value)} style={inputStyle}>
            <option value="">any</option>
            {data?.facets.actorTypes.map((f) => (
              <option key={f.value} value={f.value}>
                {f.value} ({f.count})
              </option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          <div style={{ color: "var(--muted)", marginBottom: "4px" }}>From</div>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          <div style={{ color: "var(--muted)", marginBottom: "4px" }}>To</div>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inputStyle} />
        </label>
        <button type="submit" className="btn btn-primary">
          Filter
        </button>
      </form>

      {loading && !data ? (
        <div style={{ padding: "40px", textAlign: "center", color: "var(--muted)", fontSize: "13px" }}>Loading…</div>
      ) : (
        <>
          <DataCards<SecureRow> columns={columns} rows={data?.rows ?? []} rowKey={(r) => r.id} onRowClick={(r) => setSelected(r)} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 2px", fontSize: "12px", color: "var(--muted)" }}>
            <span>{(data?.total ?? 0).toLocaleString()} total · {data?.pageSize ?? 50} per page</span>
            <span style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <button className="btn btn-secondary btn-sm" onClick={() => loadLogs(page - 1)} disabled={page === 0 || loading}>
                ← Prev
              </button>
              <span>Page {page + 1}</span>
              <button className="btn btn-secondary btn-sm" onClick={() => loadLogs(page + 1)} disabled={!data?.hasMore || loading}>
                Next →
              </button>
            </span>
          </div>
        </>
      )}

      {/* per-row hash detail */}
      <Sheet open={!!selected} onClose={() => setSelected(null)} title={selected?.action}>
        {selected && (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px", fontSize: "13px" }}>
            <div>
              <div style={{ fontWeight: 600, marginBottom: "4px" }}>{selected.summary}</div>
              <div style={{ color: "var(--muted)", fontSize: "12px" }}>{formatWhen(selected.at)}</div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 14px" }}>
              <span style={{ color: "var(--muted)" }}>Actor</span>
              <span>{selected.actorLabel} <Mono>({selected.actorType}{selected.actorId ? " · " + selected.actorId : ""})</Mono></span>
              <span style={{ color: "var(--muted)" }}>Entity</span>
              <span>{selected.entityType ?? "—"}{selected.entityId ? <> · <Mono>{selected.entityId}</Mono></> : null}</span>
              {selected.clientId && (<><span style={{ color: "var(--muted)" }}>Client</span><span><Mono>{selected.clientId}</Mono></span></>)}
              <span style={{ color: "var(--muted)" }}>IP</span>
              <span><Mono>{selected.ip ?? "—"}</Mono></span>
              <span style={{ color: "var(--muted)" }}>Agent</span>
              <span style={{ wordBreak: "break-word", fontSize: "12px", color: "var(--muted)" }}>{selected.userAgent ?? "—"}</span>
            </div>

            <div>
              <div style={{ color: "var(--muted)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>Metadata</div>
              <pre style={{ margin: 0, padding: "10px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "12px", fontFamily: "var(--mono)", overflowX: "auto" }}>
                {JSON.stringify(selected.metadata ?? {}, null, 2)}
              </pre>
            </div>

            <div>
              <div style={{ color: "var(--muted)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>
                Chain crypto
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <HashLine label="seq" value={selected.seq} onCopy={copy} copied={copied} />
                <HashLine label="hash" value={selected.hash} onCopy={copy} copied={copied} />
                <HashLine label="prevHash" value={selected.prevHash} onCopy={copy} copied={copied} />
              </div>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  )
}

function HashLine({
  label,
  value,
  onCopy,
  copied,
}: {
  label: string
  value: string
  onCopy: (v: string) => void
  copied: string | null
}) {
  return (
    <div>
      <div style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "2px" }}>{label}</div>
      <div style={{ display: "flex", gap: "8px", alignItems: "stretch" }}>
        <code style={{ flex: 1, minWidth: 0, padding: "8px 10px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "6px", fontFamily: "var(--mono)", fontSize: "12px", overflowX: "auto", whiteSpace: "nowrap" }}>
          {value}
        </code>
        <button type="button" className="btn btn-secondary btn-sm" style={{ flexShrink: 0 }} onClick={() => onCopy(value)}>
          {copied === value ? "✓" : "Copy"}
        </button>
      </div>
    </div>
  )
}
