"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export default function PortalLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const res = await fetch("/api/portal/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
      if (res.ok) {
        router.push("/portal/dashboard")
      } else {
        const d = await res.json()
        setError(d.error || "Login failed")
      }
    } finally { setLoading(false) }
  }

  const inp: React.CSSProperties = {
    width: "100%", padding: "10px 14px", fontSize: "14px",
    border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px",
    background: "var(--color-background-secondary)", color: "var(--color-text-primary)",
    boxSizing: "border-box",
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--color-background-primary)", padding: "24px",
    }}>
      <div style={{ width: "100%", maxWidth: "380px" }}>
        {/* Logo / brand */}
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: "13px", fontWeight: 600, color: "var(--accent)", letterSpacing: "0.08em", marginBottom: "8px" }}>
            CLIENT PORTAL
          </div>
          <div style={{ fontSize: "22px", fontWeight: 500, color: "var(--color-text-primary)" }}>Sign in</div>
          <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginTop: "4px" }}>
            Use the credentials provided by your IT support team.
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "6px" }}>Email address</label>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={inp}
              placeholder="you@company.com"
            />
          </div>
          <div>
            <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "6px" }}>Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={inp}
            />
          </div>

          {error && (
            <div style={{ fontSize: "13px", color: "var(--color-text-danger)", padding: "10px 14px", background: "rgba(239,68,68,0.08)", borderRadius: "8px", border: "0.5px solid rgba(239,68,68,0.3)" }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "11px", borderRadius: "8px", border: "none",
              background: "var(--accent)", color: "#fff",
              fontSize: "14px", fontWeight: 500, cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1, marginTop: "4px",
            }}
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div style={{ marginTop: "24px", textAlign: "center", fontSize: "12px", color: "var(--color-text-muted)" }}>
          Password not working? Contact your IT support team.
        </div>
      </div>
    </div>
  )
}
