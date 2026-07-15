"use client"

import { signIn } from "next-auth/react"

export default function LoginPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
        padding: 24,
      }}
    >
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 40,
          width: "100%",
          maxWidth: 400,
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div
            style={{
              fontFamily: "var(--mono)",
              fontSize: 11,
              fontWeight: 600,
              color: "var(--accent)",
              letterSpacing: "0.08em",
              marginBottom: 16,
            }}
          >
            PCC<span style={{ color: "var(--muted)", fontWeight: 400 }}> // </span>DOCHUB
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--text)" }}>DocHub</h1>
          <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
            PCC2K Documentation Platform
          </p>
        </div>
        <button
          onClick={() => signIn("azure-ad", { callbackUrl: "/dashboard" })}
          className="btn btn-primary"
          style={{ width: "100%", justifyContent: "center", minHeight: 44, fontSize: 13 }}
        >
          Sign in with Microsoft
        </button>
      </div>
    </div>
  )
}
