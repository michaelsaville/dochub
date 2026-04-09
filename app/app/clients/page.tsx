"use client"

import AppShell from "@/components/AppShell"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"

type Client = {
  id: string
  name: string
  type: "BUSINESS" | "RESIDENTIAL"
  isActive: boolean
  assetCount: number
  _count: { locations: number; users: number; alarms: number }
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState("")
  const [newType, setNewType] = useState<"BUSINESS" | "RESIDENTIAL">("BUSINESS")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const router = useRouter()

  useEffect(() => {
    fetchClients()
  }, [])

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
            style={{
              fontSize: "14px", fontWeight: 500, padding: "8px 16px",
              borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)",
              background: "var(--color-background-primary)", cursor: "pointer",
              color: "var(--color-text-primary)",
            }}
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
                style={{
                  fontSize: "14px", fontWeight: 500, padding: "8px 16px",
                  borderRadius: "8px", border: "none", background: "var(--color-text-primary)",
                  color: "var(--color-background-primary)", cursor: "pointer",
                }}
              >
                {saving ? "Saving..." : "Create client"}
              </button>
              <button
                onClick={() => { setShowAdd(false); setError(""); setNewName("") }}
                style={{
                  fontSize: "14px", padding: "8px 16px", borderRadius: "8px",
                  border: "0.5px solid var(--color-border-secondary)",
                  background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div style={{ marginBottom: "16px", maxWidth: "400px" }}>
          <input
            type="text"
            placeholder="Search clients..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%", padding: "8px 12px", fontSize: "14px",
              border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px",
              background: "var(--color-background-primary)", color: "var(--color-text-primary)",
            }}
          />
        </div>

        <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "10px", overflow: "hidden" }}>
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 120px 60px 60px 60px 70px",
            padding: "10px 16px", borderBottom: "0.5px solid var(--color-border-tertiary)",
            background: "var(--color-background-secondary)",
          }}>
            {["Client name", "Type", "Sites", "Users", "Assets", "Alarms"].map((h) => (
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
                onClick={() => router.push("/clients/" + client.id)}
                style={{
                  display: "grid", gridTemplateColumns: "1fr 120px 60px 60px 60px 70px",
                  padding: "12px 16px", cursor: "pointer",
                  borderBottom: i < filtered.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none",
                  background: "var(--color-background-primary)",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-background-secondary)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "var(--color-background-primary)")}
              >
                <div style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-text-primary)" }}>
                  {client.name}
                </div>
                <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>
                  {client.type === "BUSINESS" ? "Business" : "Residential"}
                </div>
                <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>
                  {client._count.locations}
                </div>
                <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>
                  {client._count.users}
                </div>
                <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>
                  {client.assetCount}
                </div>
                <div>
                  {client._count.alarms > 0 ? (
                    <span style={{
                      display: "inline-block", fontSize: "11px", fontWeight: 600,
                      padding: "2px 7px", borderRadius: "10px",
                      background: "rgba(239,68,68,0.12)", color: "#ef4444",
                    }}>
                      {client._count.alarms}
                    </span>
                  ) : (
                    <span style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>—</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </AppShell>
  )
}
