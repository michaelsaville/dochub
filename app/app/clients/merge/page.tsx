/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import AppShell from "@/components/AppShell"
import { useSession } from "next-auth/react"
import { useEffect, useMemo, useState } from "react"

type Client = { id: string; name: string; isActive?: boolean }

const inp: React.CSSProperties = { width: "100%", padding: "7px 9px", fontSize: 13, fontFamily: "var(--sans)", background: "var(--color-background-primary)", color: "var(--text)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 5 }
const lbl: React.CSSProperties = { fontSize: 10.5, color: "var(--muted)", fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 3, display: "block" }

export default function MergeClientsPage() {
  const { data: session } = useSession()
  const isAdmin = (session?.user as any)?.role === "ADMIN"
  const [clients, setClients] = useState<Client[]>([])
  const [srcName, setSrcName] = useState(""); const [tgtName, setTgtName] = useState("")
  const [preview, setPreview] = useState<any>(null); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null)
  const [confirmText, setConfirmText] = useState("")

  useEffect(() => {
    let alive = true
    ;(async () => { const r = await fetch("/api/clients?includeArchived=true"); const d = await r.json().catch(() => ({})); if (!alive) return; setClients((d.clients ?? d ?? []).map((c: any) => ({ id: c.id, name: c.name, isActive: c.isActive }))) })()
    return () => { alive = false }
  }, [])

  const byName = useMemo(() => Object.fromEntries(clients.map((c) => [c.name.toLowerCase(), c.id])), [clients])
  const srcId = byName[srcName.trim().toLowerCase()]
  const tgtId = byName[tgtName.trim().toLowerCase()]

  async function run(confirm?: boolean) {
    if (!srcId || !tgtId) { setMsg("Pick both clients from the list"); return }
    if (srcId === tgtId) { setMsg("Pick two different clients"); return }
    setBusy(true); setMsg(null)
    const r = await fetch("/api/clients/merge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceId: srcId, targetId: tgtId, ...(confirm ? { confirm: "MERGE" } : {}) }) })
    const d = await r.json().catch(() => ({})); setBusy(false)
    if (!r.ok) { setMsg(d.error || "Failed"); return }
    if (d.dryRun) { setPreview(d); setMsg(null) }
    else { setPreview(null); setSrcName(""); setTgtName(""); setConfirmText(""); setMsg(`✓ Merged — ${d.moved} records reassigned into ${d.target.name}. Source deactivated.`) }
  }

  if (!isAdmin) return <AppShell><div style={{ padding: 40, color: "var(--muted)" }}>Merging clients is ADMIN-only.</div></AppShell>

  return (
    <AppShell>
      <div style={{ padding: "24px 24px", maxWidth: 720, margin: "0 auto" }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>Merge clients</h1>
        <p style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 20 }}>Reassign every record (locations, assets, credentials, phone, notes, …) from a duplicate client into the one you&apos;re keeping, then deactivate the duplicate. Records are moved, never deleted; a backup is taken and the whole move is one transaction that rolls back if anything conflicts.</p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
          <div><label style={lbl}>Merge this (duplicate) …</label><input list="clist" value={srcName} onChange={(e) => { setSrcName(e.target.value); setPreview(null) }} placeholder="e.g. Piedmont Housing" style={inp} /></div>
          <div><label style={lbl}>… into this (keep)</label><input list="clist" value={tgtName} onChange={(e) => { setTgtName(e.target.value); setPreview(null) }} placeholder="e.g. Piedmont Housing Authority" style={inp} /></div>
        </div>
        <datalist id="clist">{clients.map((c) => <option key={c.id} value={c.name} />)}</datalist>

        <button onClick={() => run(false)} disabled={busy || !srcId || !tgtId} style={{ padding: "8px 16px", fontSize: 12.5, fontWeight: 600, borderRadius: 6, border: "0.5px solid var(--color-border-tertiary)", background: "transparent", color: "var(--text)", cursor: "pointer", opacity: !srcId || !tgtId ? 0.5 : 1 }}>Preview what moves</button>
        {msg && <div style={{ marginTop: 14, fontSize: 12.5, color: msg.startsWith("✓") ? "var(--color-text-success)" : "var(--color-text-danger)" }}>{msg}</div>}

        {preview && (
          <div style={{ marginTop: 20, border: "0.5px solid var(--color-border-tertiary)", borderRadius: 10, padding: 16, background: "var(--color-background-secondary)" }}>
            <div style={{ fontSize: 13, color: "var(--text)", marginBottom: 10 }}>Moving <b>{preview.source.name}</b> → <b>{preview.target.name}</b></div>
            {Object.keys(preview.wouldMove).length === 0 ? <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Nothing to move — the source client has no records.</div> : (
              <table style={{ width: "100%", fontSize: 12, fontFamily: "var(--mono)", borderCollapse: "collapse" }}><tbody>
                {Object.entries(preview.wouldMove).map(([t, n]: any) => (<tr key={t} style={{ borderBottom: "0.5px solid var(--color-border-tertiary)" }}><td style={{ padding: "4px 0", color: "var(--muted)" }}>{t}</td><td style={{ padding: "4px 0", textAlign: "right", color: "var(--text)" }}>{n}</td></tr>))}
              </tbody></table>
            )}
            <div style={{ marginTop: 16, borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: 14 }}>
              <label style={lbl}>Type MERGE to confirm</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="MERGE" style={{ ...inp, fontFamily: "var(--mono)", maxWidth: 160 }} />
                <button onClick={() => run(true)} disabled={busy || confirmText !== "MERGE"} style={{ padding: "8px 16px", fontSize: 12.5, fontWeight: 600, borderRadius: 6, border: "none", cursor: confirmText === "MERGE" ? "pointer" : "default", background: confirmText === "MERGE" ? "var(--color-text-danger)" : "var(--color-border-tertiary)", color: "#fff" }}>Merge &amp; deactivate source</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
