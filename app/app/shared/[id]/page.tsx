"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"

type CredPayload = {
  type: "credential"
  data: {
    label: string
    username: string | null
    password: string
    url: string | null
    notes: string | null
  }
}

type DocPayload = {
  type: "document"
  data: {
    title: string
    content: string | null
    category: string | null
  }
}

type Payload = CredPayload | DocPayload

export default function SharedResourcePage() {
  const { id } = useParams()
  const [status, setStatus] = useState<"loading" | "needs-passphrase" | "revealed" | "expired" | "error">("loading")
  const [payload, setPayload] = useState<Payload | null>(null)
  const [meta, setMeta] = useState<{ resourceType: string; viewsRemaining: number; hasPassphrase: boolean } | null>(null)
  const [passphrase, setPassphrase] = useState("")
  const [error, setError] = useState("")
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    ;(async () => {
      try {
        const res = await fetch(`/api/share/${id}`)
        const data = await res.json()
        if (!data.valid) { setStatus("expired"); return }
        setMeta(data)
        if (data.hasPassphrase) {
          setStatus("needs-passphrase")
        } else {
          reveal("")
        }
      } catch {
        setStatus("error")
      }
    })()
  }, [id])

  async function reveal(pp: string) {
    try {
      const res = await fetch(`/api/share/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase: pp }),
      })
      const data = await res.json()
      if (res.status === 403 && data.needsPassphrase) {
        setError(data.error || "Passphrase required")
        setStatus("needs-passphrase")
        return
      }
      if (!res.ok) {
        setStatus("expired")
        return
      }
      setPayload(data)
      setStatus("revealed")
    } catch {
      setStatus("error")
    }
  }

  async function copy(field: string, value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(field)
      setTimeout(() => setCopied(null), 1500)
    } catch {}
  }

  const frame: React.CSSProperties = {
    maxWidth: 560,
    margin: "48px auto",
    padding: 32,
    border: "0.5px solid var(--color-border-secondary, #e2e8f0)",
    borderRadius: 12,
    background: "var(--color-background-primary, #fff)",
  }

  if (status === "loading") {
    return <div style={frame}><p style={{ color: "#64748b" }}>Loading…</p></div>
  }

  if (status === "expired") {
    return (
      <div style={frame}>
        <h1 style={{ fontSize: 20, fontWeight: 500 }}>Link expired</h1>
        <p style={{ color: "#64748b", marginTop: 8 }}>
          This link has either reached its view limit, expired, or was never valid.
          Ask the person who shared it to generate a new one.
        </p>
      </div>
    )
  }

  if (status === "error") {
    return (
      <div style={frame}>
        <h1 style={{ fontSize: 20, fontWeight: 500 }}>Something went wrong</h1>
        <p style={{ color: "#64748b", marginTop: 8 }}>Try again in a moment.</p>
      </div>
    )
  }

  if (status === "needs-passphrase") {
    return (
      <div style={frame}>
        <h1 style={{ fontSize: 20, fontWeight: 500 }}>Enter passphrase</h1>
        <p style={{ color: "#64748b", marginTop: 8, marginBottom: 16, fontSize: 14 }}>
          This {meta?.resourceType ?? "resource"} is passphrase-protected.
        </p>
        <input
          type="password"
          autoFocus
          value={passphrase}
          onChange={e => setPassphrase(e.target.value)}
          onKeyDown={e => e.key === "Enter" && reveal(passphrase)}
          placeholder="Passphrase"
          style={{
            width: "100%", padding: "10px 12px", fontSize: 14,
            border: "0.5px solid #cbd5e1", borderRadius: 8,
          }}
        />
        {error && <p style={{ color: "#dc2626", fontSize: 13, marginTop: 8 }}>{error}</p>}
        <button
          onClick={() => reveal(passphrase)}
          style={{
            marginTop: 12, padding: "10px 20px", fontSize: 14, fontWeight: 500,
            background: "#3d6fff", color: "#fff", border: "none", borderRadius: 8,
            cursor: "pointer",
          }}
        >
          Unlock
        </button>
      </div>
    )
  }

  if (payload?.type === "credential") {
    const d = payload.data
    return (
      <div style={frame}>
        <div style={{ marginBottom: 4, fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 }}>
          Shared credential · one-time reveal
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 500, marginBottom: 20 }}>{d.label}</h1>
        {d.url && (
          <Row label="URL">
            <a href={d.url} target="_blank" rel="noreferrer" style={{ color: "#3d6fff", textDecoration: "none", wordBreak: "break-all" }}>
              {d.url}
            </a>
          </Row>
        )}
        {d.username && <Row label="Username">
          <CopyField value={d.username} copied={copied === "u"} onCopy={() => copy("u", d.username!)} />
        </Row>}
        <Row label="Password">
          <CopyField value={d.password} copied={copied === "p"} onCopy={() => copy("p", d.password)} mono />
        </Row>
        {d.notes && <Row label="Notes">
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13, color: "#334155", margin: 0 }}>{d.notes}</pre>
        </Row>}
        <div style={{ marginTop: 24, fontSize: 12, color: "#94a3b8" }}>
          For your eyes only. This page won't work again after you close it.
        </div>
      </div>
    )
  }

  if (payload?.type === "document") {
    const d = payload.data
    return (
      <div style={frame}>
        <div style={{ marginBottom: 4, fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 }}>
          Shared document · one-time view
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 500, marginBottom: 16 }}>{d.title}</h1>
        {d.category && <div style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>{d.category}</div>}
        <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 14, color: "#334155", lineHeight: 1.6, margin: 0 }}>
          {d.content || "(empty)"}
        </pre>
      </div>
    )
  }

  return null
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: "8px 0", borderBottom: "0.5px solid #e2e8f0" }}>
      <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, color: "#0f172a" }}>{children}</div>
    </div>
  )
}

function CopyField({ value, copied, onCopy, mono }: { value: string; copied: boolean; onCopy: () => void; mono?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <code style={{ fontFamily: mono ? "ui-monospace, monospace" : "inherit", background: "#f1f5f9", padding: "4px 8px", borderRadius: 6, flex: 1, wordBreak: "break-all" }}>
        {value}
      </code>
      <button
        onClick={onCopy}
        style={{
          fontSize: 12, padding: "4px 10px",
          background: copied ? "#16a34a" : "#e2e8f0",
          color: copied ? "#fff" : "#0f172a",
          border: "none", borderRadius: 6, cursor: "pointer",
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  )
}
