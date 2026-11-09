"use client"

import { useCallback, useEffect, useState } from "react"

type Org = { id: string; name: string; clientId: string | null; clientName: string | null; suggestedClientId: string | null }
type SyncResult = {
  at?: string; success: boolean; dryRun: boolean; orgs: number; mappedOrgs: number; devices: number
  created: number; updated: number; claimed: number; unchanged: number; retired: number
  newlyMapped: { org: string; client: string }[]; unmappedOrgs: { id: string; name: string; devices: number }[]
  skippedNoLocation: string[]; errors: string[]; error?: string; skipped?: string
  plan?: { client: string; device: string; action: string; asset?: string; assetSource?: string }[]
}
type Status = {
  configured: boolean; breezeUrl: string; lastSync: SyncResult | null; syncroAssetsDisabled: boolean
  clients: { id: string; name: string }[]; orgs: Org[]; error?: string
}

const card: React.CSSProperties = {
  background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)",
  borderRadius: 10, padding: "18px 20px", marginBottom: 16,
}
const btn: React.CSSProperties = {
  fontSize: 13, padding: "8px 14px", borderRadius: 6, cursor: "pointer",
  border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)",
}

function Summary({ r }: { r: SyncResult }) {
  if (r.error || r.skipped) return <div style={{ fontSize: 13, color: "var(--danger)" }}>{r.error ?? r.skipped}</div>
  return (
    <div style={{ fontSize: 13, lineHeight: 1.7 }}>
      <div>
        {r.dryRun && <strong style={{ color: "var(--warn)" }}>Preview — nothing written. </strong>}
        {r.devices} devices across {r.mappedOrgs}/{r.orgs} mapped orgs:{" "}
        <strong>{r.created}</strong> new · <strong>{r.claimed}</strong> linked to existing assets ·{" "}
        <strong>{r.updated}</strong> updated · {r.unchanged} unchanged · {r.retired} retired
      </div>
      {r.newlyMapped.length > 0 && (
        <div style={{ color: "var(--color-text-secondary)" }}>
          Auto-matched by name: {r.newlyMapped.map((m) => `${m.org} → ${m.client}`).join(", ")}
        </div>
      )}
      {r.skippedNoLocation.length > 0 && (
        <div style={{ color: "var(--warn)" }}>Skipped (client has no location): {r.skippedNoLocation.join(", ")}</div>
      )}
      {r.errors.length > 0 && (
        <div style={{ color: "var(--danger)" }}>{r.errors.length} error(s): {r.errors.slice(0, 3).join(" · ")}</div>
      )}
      {r.plan && r.plan.length > 0 && (
        <details style={{ marginTop: 8 }} open={r.plan.length <= 40}>
          <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--accent)" }}>What would happen to each device ({r.plan.length})</summary>
          <div style={{ maxHeight: 360, overflowY: "auto", marginTop: 6 }}>
            {r.plan.map((p, i) => (
              <div key={i} className="dh-row" style={{ fontSize: 12, gap: 10 }}>
                <span style={{ width: 54, fontFamily: "var(--mono)", fontSize: 10, color: p.action === "create" ? "var(--accent2)" : p.action === "link" ? "var(--accent)" : p.action === "retire" ? "var(--warn)" : "var(--color-text-muted)" }}>{p.action.toUpperCase()}</span>
                <span style={{ flex: "1 1 160px", minWidth: 0 }}>{p.device}</span>
                <span style={{ flex: "1 1 200px", minWidth: 0, color: "var(--color-text-secondary)" }}>
                  {p.asset ? <>→ {p.asset} <span style={{ color: "var(--color-text-muted)" }}>({p.assetSource})</span></> : p.action === "create" ? "new asset" : ""}
                </span>
                <span style={{ flex: "0 1 160px", color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.client}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

export default function BreezeSettings() {
  const [st, setSt] = useState<Status | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [run, setRun] = useState<SyncResult | null>(null)
  const [pick, setPick] = useState<Record<string, string>>({})
  const [filter, setFilter] = useState("")

  const load = useCallback(() => {
    fetch("/api/integrations/breeze/status").then((r) => (r.ok ? r.json() : null)).then((d: Status | null) => {
      if (!d) return
      setSt(d)
      setPick(Object.fromEntries(d.orgs.map((o) => [o.id, o.clientId ?? o.suggestedClientId ?? ""])))
    }).catch(() => {})
  }, [])
  useEffect(load, [load])

  async function sync(dryRun: boolean) {
    setBusy(dryRun ? "preview" : "sync"); setRun(null)
    try {
      const res = await fetch(`/api/integrations/breeze/sync${dryRun ? "?dryRun=1" : ""}`, { method: "POST" })
      setRun(await res.json())
      if (!dryRun) load()
    } catch {
      setRun({ success: false, error: "Request failed" } as SyncResult)
    } finally { setBusy(null) }
  }

  async function link(org: Org) {
    const clientId = pick[org.id]
    setBusy(org.id)
    try {
      if (org.clientId && org.clientId !== clientId) {
        await fetch(`/api/clients/${org.clientId}/breeze-org`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orgId: null }) })
      }
      if (clientId) {
        await fetch(`/api/clients/${clientId}/breeze-org`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orgId: org.id }) })
      }
      load()
    } finally { setBusy(null) }
  }

  async function toggleSyncro(v: boolean) {
    setBusy("syncro")
    try {
      await fetch("/api/integrations/breeze/status", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ syncroAssetsDisabled: v }) })
      load()
    } finally { setBusy(null) }
  }

  if (!st) return <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Loading…</div>

  const mapped = st.orgs.filter((o) => o.clientId).length
  const orgs = st.orgs.filter((o) => !filter || o.name.toLowerCase().includes(filter.toLowerCase()) || (o.clientName ?? "").toLowerCase().includes(filter.toLowerCase()))

  return (
    <div style={{ maxWidth: 860 }}>
      <h2 style={{ fontSize: 18, fontWeight: 500, marginBottom: 4 }}>Breeze RMM</h2>
      <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 18 }}>
        Breeze is the device source of truth: every agent-managed machine becomes (or updates) an asset nightly, and network gear Breeze discovers shows up under a client&apos;s Assets for confirmation.
      </p>

      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: st.configured && !st.error ? "var(--accent2)" : "var(--warn)" }} />
          <strong style={{ fontSize: 14 }}>{st.configured ? (st.error ? "Key set, but Breeze answered with an error" : "Connected") : "Not connected"}</strong>
        </div>
        {!st.configured ? (
          <ol style={{ fontSize: 13, lineHeight: 1.8, paddingLeft: 18, color: "var(--color-text-secondary)" }}>
            <li>In Breeze open <a href={`${st.breezeUrl}/settings/partner-service-principals`} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>Settings → Partner service principals</a> and create one named “DocHub”.</li>
            <li>Scopes: <code>organizations:read</code>, <code>devices:read</code>, <code>device-status:read</code>, <code>inventory:read</code>.</li>
            <li>Put the <code>brz_sp_…</code> key in <code>~/dochub/.env</code> as <code>BREEZE_API_KEY=…</code> and recreate the app container.</li>
          </ol>
        ) : st.error ? (
          <div style={{ fontSize: 13, color: "var(--danger)" }}>{st.error}</div>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" style={btn} disabled={!!busy} onClick={() => sync(true)}>{busy === "preview" ? "Previewing…" : "Preview sync"}</button>
            <button type="button" style={{ ...btn, background: "var(--accent)", color: "#fff", border: "none" }} disabled={!!busy} onClick={() => sync(false)}>{busy === "sync" ? "Syncing…" : "Sync now"}</button>
            <span style={{ fontSize: 12, color: "var(--color-text-muted)", alignSelf: "center" }}>Runs nightly with the other integrations.</span>
          </div>
        )}
        {(run || st.lastSync) && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "0.5px solid var(--color-border-tertiary)" }}>
            <div style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--color-text-muted)", marginBottom: 4 }}>
              {run ? "THIS RUN" : `LAST SYNC · ${st.lastSync?.at ? new Date(st.lastSync.at).toLocaleString() : ""}`}
            </div>
            <Summary r={(run ?? st.lastSync)!} />
          </div>
        )}
      </div>

      <div style={card}>
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
          <input type="checkbox" checked={st.syncroAssetsDisabled} disabled={busy === "syncro"} onChange={(e) => toggleSyncro(e.target.checked)} style={{ marginTop: 3 }} />
          <span>
            <strong style={{ fontSize: 14 }}>Breeze owns assets — stop the Syncro asset sync</strong>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4, lineHeight: 1.5 }}>
              Syncro keeps syncing the client roster only. Existing Syncro-created assets are kept; the Breeze sync links them to their Breeze device by serial / MAC / hostname instead of duplicating them. Turn on after a successful Breeze sync.
            </div>
          </span>
        </label>
      </div>

      {st.configured && !st.error && (
        <div style={card}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <strong style={{ fontSize: 14 }}>Organizations → clients <span style={{ fontWeight: 400, color: "var(--color-text-muted)" }}>· {mapped}/{st.orgs.length} linked</span></strong>
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter…" className="filter-input" style={{ width: 200 }} />
          </div>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 10 }}>
            Exact name matches link themselves on the next sync. Pick the client for the rest — unlinked orgs are skipped, never turned into new clients.
          </div>
          {orgs.map((o) => {
            const dirty = (pick[o.id] ?? "") !== (o.clientId ?? "")
            return (
              <div key={o.id} className="dh-row" style={{ flexWrap: "wrap" }}>
                <span style={{ flex: "1 1 200px", fontSize: 13, fontWeight: 500, minWidth: 0 }}>
                  <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", marginRight: 8, background: o.clientId ? "var(--accent2)" : "var(--color-text-muted)" }} />
                  {o.name}
                </span>
                <select value={pick[o.id] ?? ""} onChange={(e) => setPick((p) => ({ ...p, [o.id]: e.target.value }))}
                  style={{ flex: "1 1 220px", padding: "6px 8px", fontSize: 13, borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}>
                  <option value="">— not linked —</option>
                  {st.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button type="button" style={{ ...btn, padding: "6px 12px", opacity: dirty ? 1 : 0.45 }} disabled={!dirty || busy === o.id} onClick={() => link(o)}>
                  {busy === o.id ? "Saving…" : !o.clientId && o.suggestedClientId && pick[o.id] === o.suggestedClientId ? "Link (suggested)" : "Save"}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
