"use client"

import { useEffect, useState } from "react"

interface StatusPayload {
  ok: boolean
  appConfigured?: boolean
  clientFound?: boolean
  connected?: boolean
  tenantId?: string | null
  consentedAt?: string | null
  lastSyncAt?: string | null
  contactCount?: number
  mappedCount?: number
  error?: string
}

interface SyncResult {
  ok: boolean
  reason?: string
  fetched?: number
  matched?: number
  unmatched?: number
}

/**
 * Client-header tile for the per-client Microsoft 365 Identity feature.
 * Mounts on the People tab and shows: connection status, Connect O365
 * (admin-consent URL), Sync now, and the latest mapped/unmapped counts.
 *
 * This is Slice 1 — read-only sync only. Destructive icons (reset
 * password / wipe MFA / revoke sessions) wire up in Slice 2 against
 * the same `clientName` axis used here.
 */
export default function IdentityPanel({ clientName, role }: { clientName: string; role: string | null | undefined }) {
  const [status, setStatus] = useState<StatusPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<null | "connect" | "sync">(null)
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null)

  const isAdmin = role === "ADMIN"

  async function refreshStatus() {
    setLoading(true)
    try {
      const res = await fetch("/api/identity/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientName }),
      })
      const data = (await res.json()) as StatusPayload
      setStatus(data)
    } catch (e) {
      setStatus({ ok: false, error: e instanceof Error ? e.message : "fetch failed" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refreshStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientName])

  async function handleConnect() {
    setBusy("connect")
    setToast(null)
    try {
      const res = await fetch("/api/identity/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientName }),
      })
      const data = (await res.json()) as { ok: boolean; url?: string; error?: string }
      if (!data.ok || !data.url) {
        setToast({ kind: "err", msg: data.error ?? "Could not get consent URL" })
        return
      }
      window.open(data.url, "_blank", "noopener,noreferrer")
      setToast({
        kind: "ok",
        msg: "Consent link opened. Send it to the client's global admin if it didn't open in your browser.",
      })
    } finally {
      setBusy(null)
    }
  }

  async function handleSync() {
    setBusy("sync")
    setToast(null)
    try {
      const res = await fetch("/api/identity/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientName }),
      })
      const data = (await res.json()) as SyncResult & { error?: string }
      if (!data.ok) {
        setToast({ kind: "err", msg: data.reason ?? data.error ?? "Sync failed" })
        return
      }
      setToast({
        kind: "ok",
        msg: `Synced — ${data.matched ?? 0} mapped, ${data.unmatched ?? 0} unmapped (out of ${data.fetched ?? 0} Entra users).`,
      })
      await refreshStatus()
    } finally {
      setBusy(null)
    }
  }

  // ─── Render states ───────────────────────────────────────────────────

  const wrap: React.CSSProperties = {
    background: "var(--color-background-primary)",
    border: "0.5px solid var(--color-border-tertiary)",
    borderRadius: "8px",
    padding: "12px 14px",
    marginBottom: "16px",
  }
  const headRow: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "6px",
  }
  const label: React.CSSProperties = {
    fontSize: "11px",
    fontWeight: 600,
    color: "var(--color-text-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.07em",
  }
  const btn = (variant: "primary" | "secondary"): React.CSSProperties => ({
    fontSize: "11px",
    fontWeight: 500,
    padding: "4px 10px",
    borderRadius: "5px",
    border: variant === "primary" ? "none" : "0.5px solid var(--color-border-secondary)",
    background: variant === "primary" ? "var(--color-text-primary)" : "transparent",
    color: variant === "primary" ? "var(--color-background-primary)" : "var(--color-text-secondary)",
    cursor: "pointer",
  })
  const chip = (kind: "ok" | "warn" | "muted"): React.CSSProperties => {
    const colors = {
      ok:    { bg: "rgba(22,163,74,0.10)",  fg: "#16a34a" },
      warn:  { bg: "rgba(202,138,4,0.10)",  fg: "#ca8a04" },
      muted: { bg: "rgba(100,116,139,0.10)", fg: "#64748b" },
    }[kind]
    return {
      display: "inline-flex",
      alignItems: "center",
      gap: "4px",
      fontSize: "11px",
      fontWeight: 500,
      padding: "1px 8px",
      borderRadius: "999px",
      background: colors.bg,
      color: colors.fg,
    }
  }

  if (loading) {
    return (
      <div style={wrap}>
        <div style={label}>Identity (M365)</div>
        <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "4px" }}>Loading…</div>
      </div>
    )
  }

  if (!status?.ok) {
    return (
      <div style={wrap}>
        <div style={headRow}>
          <div style={label}>Identity (M365)</div>
          <span style={chip("warn")}>Error</span>
        </div>
        <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
          {status?.error ?? "Could not load identity status."}
        </div>
      </div>
    )
  }

  if (!status.appConfigured) {
    return (
      <div style={wrap}>
        <div style={headRow}>
          <div style={label}>Identity (M365)</div>
          <span style={chip("muted")}>Not configured</span>
        </div>
        <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
          The Entra Identity app isn't set up on TicketHub yet. See <code>IDENTITY-SETUP.md</code> in the tickethub repo for the one-time Azure setup.
        </div>
      </div>
    )
  }

  if (!status.clientFound) {
    return (
      <div style={wrap}>
        <div style={headRow}>
          <div style={label}>Identity (M365)</div>
          <span style={chip("muted")}>No TH client</span>
        </div>
        <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
          No TicketHub client matches <strong>{clientName}</strong>. Identity actions need a TH client of the same name.
        </div>
      </div>
    )
  }

  if (!status.connected) {
    return (
      <div style={wrap}>
        <div style={headRow}>
          <div style={label}>Identity (M365)</div>
          <span style={chip("muted")}>Not connected</span>
        </div>
        <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginBottom: "8px" }}>
          Connect this client's Microsoft 365 tenant to enable user sync, password reset, and MFA management.
        </div>
        <button onClick={handleConnect} disabled={busy !== null || !isAdmin} style={{ ...btn("primary"), opacity: busy || !isAdmin ? 0.5 : 1 }}>
          {busy === "connect" ? "Opening…" : "Connect O365"}
        </button>
        {!isAdmin && (
          <span style={{ fontSize: "10px", color: "var(--color-text-muted)", marginLeft: "8px" }}>
            Admin role required to initiate.
          </span>
        )}
        {toast && (
          <div style={{ fontSize: "11px", color: toast.kind === "ok" ? "#16a34a" : "#dc2626", marginTop: "6px" }}>
            {toast.msg}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={wrap}>
      <div style={headRow}>
        <div style={label}>Identity (M365)</div>
        <span style={chip("ok")}>Connected</span>
      </div>
      <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginBottom: "8px" }}>
        {status.mappedCount ?? 0} of {status.contactCount ?? 0} contacts linked to Entra users.
        {status.lastSyncAt && (
          <> Last synced {new Date(status.lastSyncAt).toLocaleString()}.</>
        )}
        {!status.lastSyncAt && (
          <> Never synced — click <strong>Sync now</strong> to populate links.</>
        )}
      </div>
      <button onClick={handleSync} disabled={busy !== null} style={{ ...btn("secondary"), opacity: busy ? 0.5 : 1 }}>
        {busy === "sync" ? "Syncing…" : "Sync now"}
      </button>
      {toast && (
        <div style={{ fontSize: "11px", color: toast.kind === "ok" ? "#16a34a" : "#dc2626", marginTop: "6px" }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
