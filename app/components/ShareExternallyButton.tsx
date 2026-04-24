"use client"

import { useState } from "react"

interface Props {
  resourceType: "credential" | "document"
  resourceId: string
  /** Small style variant tucks the button inline; default is a block button. */
  compact?: boolean
  /** Custom label (defaults to "Share externally"). */
  label?: string
}

/**
 * Creates a time-limited, view-limited signed share link for a credential
 * or document. The resulting URL can be sent to someone without a DocHub
 * account — they'll be able to reveal the payload once (or up to N times),
 * optionally gated by a passphrase, until it expires.
 *
 * Relies on the existing /api/share POST endpoint; view consumption happens
 * at /shared/[id].
 */
export default function ShareExternallyButton({ resourceType, resourceId, compact, label }: Props) {
  const [open, setOpen] = useState(false)
  const [hours, setHours] = useState(24)
  const [maxViews, setMaxViews] = useState(1)
  const [passphrase, setPassphrase] = useState("")
  const [creating, setCreating] = useState(false)
  const [result, setResult] = useState<{ url: string; expiresAt: string } | null>(null)
  const [err, setErr] = useState("")
  const [copied, setCopied] = useState(false)

  async function createLink() {
    setCreating(true)
    setErr("")
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resourceType,
          resourceId,
          expiresInHours: hours,
          maxViews,
          passphrase: passphrase.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErr(data.error || "Failed to create share link")
        return
      }
      setResult({ url: data.url, expiresAt: data.expiresAt })
    } catch (e) {
      setErr("Network error")
    } finally {
      setCreating(false)
    }
  }

  async function copy() {
    if (!result) return
    await navigator.clipboard.writeText(result.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  function close() {
    setOpen(false)
    setResult(null)
    setErr("")
    setPassphrase("")
    setHours(24)
    setMaxViews(1)
    setCopied(false)
  }

  const buttonStyle: React.CSSProperties = compact
    ? {
        fontSize: 11, color: "var(--color-text-secondary)",
        background: "none", border: "none", cursor: "pointer", padding: 0,
      }
    : {
        fontSize: 12, fontWeight: 500, padding: "6px 12px",
        background: "var(--color-background-secondary)",
        border: "0.5px solid var(--color-border-secondary)",
        borderRadius: 6, cursor: "pointer",
        color: "var(--color-text-primary)",
      }

  return (
    <>
      <button onClick={() => setOpen(true)} style={buttonStyle} title="Create a time-limited share link">
        {label ?? "Share externally"}
      </button>

      {open && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 1000,
        }}
        onClick={close}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--color-background-primary)",
              border: "0.5px solid var(--color-border-secondary)",
              borderRadius: 12, padding: 24, width: "100%", maxWidth: 440,
            }}
          >
            <h2 style={{ fontSize: 16, fontWeight: 500, marginBottom: 4 }}>
              Share {resourceType} externally
            </h2>
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 20 }}>
              Creates a one-time signed URL. Revoke by deleting the resource or letting the link expire.
            </p>

            {!result ? (
              <>
                <Row label="Expires in">
                  <select
                    value={hours}
                    onChange={e => setHours(parseInt(e.target.value))}
                    style={selectStyle}
                  >
                    <option value={1}>1 hour</option>
                    <option value={4}>4 hours</option>
                    <option value={24}>24 hours</option>
                    <option value={72}>3 days</option>
                    <option value={168}>7 days</option>
                  </select>
                </Row>
                <Row label="Max views">
                  <select
                    value={maxViews}
                    onChange={e => setMaxViews(parseInt(e.target.value))}
                    style={selectStyle}
                  >
                    <option value={1}>1 view (burn on read)</option>
                    <option value={3}>3 views</option>
                    <option value={10}>10 views</option>
                  </select>
                </Row>
                <Row label="Passphrase (optional)">
                  <input
                    type="text"
                    value={passphrase}
                    onChange={e => setPassphrase(e.target.value)}
                    placeholder="Share this out-of-band"
                    style={inputStyle}
                  />
                </Row>

                {err && <div style={{ fontSize: 13, color: "#dc2626", marginTop: 8 }}>{err}</div>}

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
                  <button onClick={close} style={ghostStyle}>Cancel</button>
                  <button onClick={createLink} disabled={creating} style={primaryStyle}>
                    {creating ? "Creating..." : "Create link"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <Row label="Share URL">
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <code style={{
                      flex: 1, padding: "8px 10px", background: "var(--color-background-secondary)",
                      borderRadius: 6, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis",
                      whiteSpace: "nowrap", color: "var(--color-text-primary)",
                    }}>
                      {result.url}
                    </code>
                    <button
                      onClick={copy}
                      style={{
                        ...primaryStyle,
                        background: copied ? "#16a34a" : undefined,
                        minWidth: 80,
                      }}
                    >
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </Row>
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 8 }}>
                  Expires {new Date(result.expiresAt).toLocaleString()}. Anyone with this URL can reveal the {resourceType} until it expires or is consumed.
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
                  <button onClick={close} style={primaryStyle}>Done</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 12px", fontSize: 14,
  border: "0.5px solid var(--color-border-secondary)",
  borderRadius: 6, background: "var(--color-background-primary)",
  color: "var(--color-text-primary)",
}

const selectStyle: React.CSSProperties = { ...inputStyle }

const primaryStyle: React.CSSProperties = {
  fontSize: 13, fontWeight: 500, padding: "8px 16px",
  background: "#3b82f6", color: "#fff",
  border: "none", borderRadius: 6, cursor: "pointer",
}

const ghostStyle: React.CSSProperties = {
  fontSize: 13, fontWeight: 500, padding: "8px 16px",
  background: "var(--color-background-primary)",
  color: "var(--color-text-primary)",
  border: "0.5px solid var(--color-border-secondary)",
  borderRadius: 6, cursor: "pointer",
}
