"use client"

import AppShell from "@/components/AppShell"
import { useState } from "react"

export default function SettingsPage() {
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState<any>(null)

  async function runSync() {
    setSyncing(true)
    setResult(null)
    try {
      const res = await fetch("/api/sync/syncro", { method: "POST" })
      const data = await res.json()
      setResult(data)
    } catch (e) {
      setResult({ success: false, error: "Network error" })
    } finally {
      setSyncing(false)
    }
  }

  return (
    <AppShell>
      <div style={{ padding: "32px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 500, marginBottom: "4px" }}>Settings</h1>
        <p style={{ fontSize: "14px", color: "var(--color-text-secondary)", marginBottom: "32px" }}>
          Platform configuration and integrations
        </p>

        <div style={{ maxWidth: "600px" }}>
          <div style={{
            background: "var(--color-background-secondary)",
            border: "0.5px solid var(--color-border-tertiary)",
            borderRadius: "10px", padding: "20px", marginBottom: "16px",
          }}>
            <div style={{ fontSize: "15px", fontWeight: 500, marginBottom: "4px" }}>SyncroMSP</div>
            <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginBottom: "16px" }}>
              Import all customers and assets from Syncro. Existing records will be updated.
            </div>

            <button
              onClick={runSync}
              disabled={syncing}
              style={{
                fontSize: "14px", fontWeight: 500, padding: "8px 16px",
                borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)",
                background: "var(--color-background-primary)", cursor: syncing ? "not-allowed" : "pointer",
                color: "var(--color-text-primary)", opacity: syncing ? 0.6 : 1,
              }}
            >
              {syncing ? "Syncing... this may take a minute" : "Run Syncro sync"}
            </button>

            {result && (
              <div style={{
                marginTop: "16px", padding: "12px 16px", borderRadius: "8px",
                background: result.success ? "var(--color-background-success)" : "var(--color-background-danger)",
                border: `0.5px solid ${result.success ? "var(--color-border-success)" : "var(--color-border-danger)"}`,
                fontSize: "13px",
              }}>
                {result.success ? (
                  <div>
                    <div style={{ fontWeight: 500, color: "var(--color-text-success)", marginBottom: "4px" }}>
                      Sync complete
                    </div>
                    <div style={{ color: "var(--color-text-success)" }}>
                      {result.clients} clients · {result.assets} assets synced
                    </div>
                    {result.errors?.length > 0 && (
                      <div style={{ marginTop: "8px", color: "var(--color-text-warning)", fontSize: "12px" }}>
                        {result.errors.length} errors — check logs
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ color: "var(--color-text-danger)" }}>
                    Error: {result.error}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
