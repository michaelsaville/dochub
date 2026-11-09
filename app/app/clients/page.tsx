"use client"

import AppShell from "@/components/AppShell"
import { useState, useEffect, Suspense } from "react"
import Link from "next/link"
import { getRecentClients, RECENTS_EVENT } from "@/lib/recents"
import { useRouter, useSearchParams } from "next/navigation"
import CastButton from "@/components/CastButton"

type Client = {
  id: string
  name: string
  type: "BUSINESS" | "RESIDENTIAL"
  isActive: boolean
  assetCount: number
  lastSyncedAt: string | null
  _count: { locations: number; people: number; alarms: number }
}

function relativeTime(iso: string | null): string {
  if (!iso) return "—"
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60) return "just now"
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function healthPillStyle(score: number | undefined): React.CSSProperties {
  if (score === undefined) {
    return { background: "rgba(148,163,184,0.14)", color: "var(--muted)" }
  }
  if (score >= 80) return { background: "rgba(0,212,170,0.14)", color: "var(--accent2)" }
  if (score >= 50) return { background: "rgba(255,179,71,0.14)", color: "var(--warn)" }
  return { background: "rgba(255,77,109,0.14)", color: "var(--danger)" }
}

// Inner component holds the useSearchParams() call — Next.js requires
// the consumer to live inside a <Suspense> boundary so the static
// prerender doesn't bail out. Default export below wraps it.
function ClientsPageInner() {
  const [clients, setClients] = useState<Client[]>([])
  // /api/clients/completeness returns id → score, or id → { score, nextAction }.
  const [scores, setScores] = useState<Record<string, number>>({})
  const [nextActions, setNextActions] = useState<Record<string, string>>({})
  const [pinned, setPinned] = useState<{ id: string; name: string }[]>([])
  const [recent, setRecent] = useState<{ id: string; name: string }[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState("")
  const [newType, setNewType] = useState<"BUSINESS" | "RESIDENTIAL">("BUSINESS")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    fetchClients()
    fetchScores()
    fetch("/api/me/pinned-clients").then((r) => (r.ok ? r.json() : null)).then((d) => d && setPinned(d.pinned ?? [])).catch(() => {})
    const load = () => setRecent(getRecentClients(8))
    load()
    window.addEventListener(RECENTS_EVENT, load)
    return () => window.removeEventListener(RECENTS_EVENT, load)
  }, [])

  async function togglePin(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    const isPinned = pinned.some((p) => p.id === id)
    const res = await fetch("/api/me/pinned-clients", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: id, pinned: !isPinned }),
    }).catch(() => null)
    if (res?.ok) {
      const d = await res.json()
      setPinned(d.pinned ?? [])
      window.dispatchEvent(new Event("dochub:pins-changed"))
    }
  }

  useEffect(() => {
    if (searchParams?.get("new") === "1") setShowAdd(true)
  }, [searchParams])

  async function fetchClients() {
    setLoading(true)
    try {
      const res = await fetch("/api/clients")
      const data = await res.json()
      setClients(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function fetchScores() {
    try {
      const res = await fetch("/api/clients/completeness")
      if (!res.ok) return
      const data = await res.json()
      const sc: Record<string, number> = {}
      const na: Record<string, string> = {}
      for (const [id, v] of Object.entries(data ?? {})) {
        if (typeof v === "number") sc[id] = v
        else if (v && typeof v === "object") {
          const o = v as { score?: number; nextAction?: string | null }
          if (typeof o.score === "number") sc[id] = o.score
          if (o.nextAction) na[id] = o.nextAction
        }
      }
      setScores(sc)
      setNextActions(na)
    } catch (e) {
      console.error(e)
    }
  }

  async function addClient() {
    if (!newName.trim()) { setError("Name is required"); return }
    setSaving(true)
    setError("")
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, type: newType }),
      })
      if (!res.ok) { setError("Failed to create client"); return }
      const client = await res.json()
      setNewName("")
      setNewType("BUSINESS")
      setShowAdd(false)
      await fetchClients()
      router.push("/clients/" + client.id)
    } catch (e) {
      setError("Failed to create client")
    } finally {
      setSaving(false)
    }
  }

  const filtered = clients.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <AppShell>
      <div style={{ padding: "32px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }}>
          <div>
            <h1 style={{ fontSize: "22px", fontWeight: 500, marginBottom: "4px" }}>Clients</h1>
            <p style={{ fontSize: "14px", color: "var(--color-text-secondary)" }}>
              {loading ? "Loading..." : `${clients.length} clients`}
            </p>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="btn btn-secondary"
          >
            Add client
          </button>
        </div>

        {showAdd && (
          <div style={{
            background: "var(--color-background-secondary)",
            border: "0.5px solid var(--color-border-secondary)",
            borderRadius: "10px", padding: "20px", marginBottom: "20px", maxWidth: "480px",
          }}>
            <div style={{ fontSize: "15px", fontWeight: 500, marginBottom: "16px" }}>New client</div>
            <div style={{ marginBottom: "12px" }}>
              <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>
                Client name
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addClient()}
                placeholder="e.g. Acme Corporation"
                autoFocus
                style={{
                  width: "100%", padding: "8px 12px", fontSize: "14px",
                  border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px",
                  background: "var(--color-background-primary)", color: "var(--color-text-primary)",
                }}
              />
            </div>
            <div style={{ marginBottom: "16px" }}>
              <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>
                Type
              </label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as "BUSINESS" | "RESIDENTIAL")}
                style={{
                  width: "100%", padding: "8px 12px", fontSize: "14px",
                  border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px",
                  background: "var(--color-background-primary)", color: "var(--color-text-primary)",
                }}
              >
                <option value="BUSINESS">Business</option>
                <option value="RESIDENTIAL">Residential</option>
              </select>
            </div>
            {error && <div style={{ fontSize: "13px", color: "var(--color-text-danger)", marginBottom: "12px" }}>{error}</div>}
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={addClient}
                disabled={saving}
                className="btn btn-primary"
              >
                {saving ? "Saving..." : "Create client"}
              </button>
              <button
                onClick={() => { setShowAdd(false); setError(""); setNewName("") }}
                className="btn btn-ghost"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {(pinned.length > 0 || recent.length > 0) && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
            {[{ title: "Pinned", list: pinned, star: true }, { title: "Recent", list: recent.filter((r) => !pinned.some((p) => p.id === r.id)), star: false }]
              .filter((g) => g.list.length > 0)
              .map((g) => (
                <div key={g.title} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10, fontFamily: "var(--mono)", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-text-muted)", width: 56 }}>{g.title}</span>
                  {g.list.map((c) => (
                    <Link key={c.id} href={`/clients/${c.id}`} className="dh-client-chip">
                      {g.star && <span style={{ color: "#f5b301" }}>★</span>}{c.name}
                    </Link>
                  ))}
                </div>
              ))}
          </div>
        )}

        <div style={{ marginBottom: "16px", maxWidth: "400px" }}>
          <input
            type="text"
            placeholder="Search clients..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && filtered[0]) router.push("/clients/" + filtered[0].id) }}
            autoFocus
            aria-label="Filter clients (Enter opens the first match)"
            className="filter-input"
            style={{ width: "100%" }}
          />
        </div>

        <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "10px", overflow: "hidden" }}>
          <div className="dh-clients-grid" style={{
            display: "grid", gridTemplateColumns: "28px 1fr 120px 60px 60px 60px 70px 70px 80px",
            padding: "10px 16px", borderBottom: "0.5px solid var(--color-border-tertiary)",
            background: "var(--color-background-secondary)",
          }}>
            {["", "Client name", "Type", "Sites", "People", "Assets", "Alarms", "Health", "Last sync"].map((h) => (
              <div key={h} style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-secondary)" }}>{h}</div>
            ))}
          </div>

          {loading ? (
            <div style={{ padding: "48px 16px", textAlign: "center", color: "var(--color-text-secondary)", fontSize: "14px" }}>
              Loading clients...
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: "48px 16px", textAlign: "center", color: "var(--color-text-secondary)", fontSize: "14px" }}>
              {search ? "No clients match your search." : "No clients yet. Add your first client to get started."}
            </div>
          ) : (
            filtered.map((client, i) => (
              <div
                key={client.id}
                className="dh-clients-grid"
                onClick={() => router.push("/clients/" + client.id)}
                style={{
                  display: "grid", gridTemplateColumns: "28px 1fr 120px 60px 60px 60px 70px 70px 80px",
                  padding: "12px 16px", cursor: "pointer",
                  borderBottom: i < filtered.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none",
                  background: "var(--color-background-primary)",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-background-secondary)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "var(--color-background-primary)")}
              >
                <button
                  type="button"
                  onClick={(e) => togglePin(e, client.id)}
                  aria-label={pinned.some((p) => p.id === client.id) ? `Unpin ${client.name}` : `Pin ${client.name}`}
                  title={pinned.some((p) => p.id === client.id) ? "Unpin" : "Pin to sidebar"}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 14, color: pinned.some((p) => p.id === client.id) ? "#f5b301" : "var(--color-text-muted)", opacity: pinned.some((p) => p.id === client.id) ? 1 : 0.5 }}
                >★</button>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {client.name}
                  </span>
                  <CastButton url={`/clients/${client.id}`} label={client.name} clientId={client.id} size={22} />
                </div>
                <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>
                  {client.type === "BUSINESS" ? "Business" : "Residential"}
                </div>
                <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>
                  {client._count.locations}
                </div>
                <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>
                  {client._count.people}
                </div>
                <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>
                  {client.assetCount}
                </div>
                <div>
                  {client._count.alarms > 0 ? (
                    <span style={{
                      display: "inline-block", fontSize: "11px", fontWeight: 600,
                      padding: "2px 7px", borderRadius: "10px",
                      background: "rgba(255,77,109,0.12)", color: "var(--danger)",
                    }}>
                      {client._count.alarms}
                    </span>
                  ) : (
                    <span style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>—</span>
                  )}
                </div>
                <div>
                  <span
                    title={nextActions[client.id] ? `Next: ${nextActions[client.id]}` : "Documentation completeness"}
                    style={{
                      display: "inline-block", fontSize: "11px", fontWeight: 600,
                      padding: "2px 7px", borderRadius: "10px",
                      ...healthPillStyle(scores[client.id]),
                    }}
                  >
                    {scores[client.id] === undefined ? "…" : `${scores[client.id]}%`}
                  </span>
                </div>
                <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
                  {relativeTime(client.lastSyncedAt)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </AppShell>
  )
}

export default function ClientsPage() {
  return (
    <Suspense fallback={null}>
      <ClientsPageInner />
    </Suspense>
  )
}
