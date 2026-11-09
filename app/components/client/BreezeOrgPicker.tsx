"use client"

import { useEffect, useState } from "react"

/** Client settings → link this client to its Breeze organization (ADMIN). */
export default function BreezeOrgPicker({ clientId }: { clientId: string }) {
  const [orgs, setOrgs] = useState<{ id: string; name: string; clientId: string | null; clientName: string | null; suggestedClientId: string | null }[] | null>(null)
  const [state, setState] = useState<{ configured: boolean; error?: string } | null>(null)
  const [value, setValue] = useState("")
  const [saved, setSaved] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch("/api/integrations/breeze/status").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!d) return
      setState({ configured: d.configured, error: d.error })
      setOrgs(d.orgs)
      const mine = d.orgs.find((o: { clientId: string | null }) => o.clientId === clientId)
      const suggested = d.orgs.find((o: { clientId: string | null; suggestedClientId: string | null }) => !o.clientId && o.suggestedClientId === clientId)
      setSaved(mine?.id ?? "")
      setValue(mine?.id ?? suggested?.id ?? "")
    }).catch(() => {})
  }, [clientId])

  async function save() {
    setBusy(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/breeze-org`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orgId: value || null }) })
      if (res.ok) setSaved(value)
    } finally { setBusy(false) }
  }

  return (
    <section className="dh-card">
      <div className="dh-card-head"><span className="dh-card-title">Breeze RMM</span></div>
      {!state ? (
        <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Loading…</div>
      ) : !state.configured ? (
        <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>Breeze isn&apos;t connected yet — see Settings → Breeze RMM.</div>
      ) : state.error ? (
        <div style={{ fontSize: 13, color: "var(--danger)" }}>{state.error}</div>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select value={value} onChange={(e) => setValue(e.target.value)}
            style={{ flex: "1 1 260px", padding: "8px 10px", fontSize: 14, borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}>
            <option value="">— not linked —</option>
            {orgs?.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}{o.clientId && o.clientId !== clientId ? ` (linked to ${o.clientName})` : ""}
              </option>
            ))}
          </select>
          <button type="button" onClick={save} disabled={busy || value === saved}
            style={{ fontSize: 13, padding: "8px 14px", borderRadius: 6, border: "none", background: value === saved ? "var(--color-background-primary)" : "var(--accent)", color: value === saved ? "var(--color-text-muted)" : "#fff", cursor: "pointer" }}>
            {busy ? "Saving…" : value === saved ? (saved ? "Linked" : "Not linked") : "Save"}
          </button>
          <div style={{ flexBasis: "100%", fontSize: 12, color: "var(--color-text-muted)" }}>
            Agent-managed devices in this org sync into Assets nightly (or Settings → Breeze RMM → Sync now).
          </div>
        </div>
      )}
    </section>
  )
}
