"use client"

import AppShell from "@/components/AppShell"
import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"

type Client = {
  id: string
  name: string
  type: "BUSINESS" | "RESIDENTIAL"
  notes: string | null
  isActive: boolean
  syncroId: string | null
  createdAt: string
  locations: { id: string; name: string; address: string | null; city: string | null; state: string | null }[]
  users: { id: string; name: string; email: string | null; jobTitle: string | null }[]
  contacts: { id: string; name: string; role: string | null; email: string | null; phone: string | null }[]
}

const tabs = ["Overview", "Locations", "Users", "Assets", "Credentials", "Licenses", "Activity"]

export default function ClientDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("Overview")

  useEffect(() => {
    if (id) fetchClient()
  }, [id])

  async function fetchClient() {
    try {
      const res = await fetch("/api/clients/" + id)
      if (!res.ok) { router.push("/clients"); return }
      const data = await res.json()
      setClient(data)
    } catch (e) {
      router.push("/clients")
    } finally {
      setLoading(false)
    }
  }

  if (loading) return (
    <AppShell>
      <div style={{ padding: "32px", color: "var(--color-text-secondary)", fontSize: "14px" }}>Loading...</div>
    </AppShell>
  )

  if (!client) return null

  return (
    <AppShell>
      <div style={{ padding: "32px" }}>
        <div style={{ marginBottom: "4px" }}>
          <span
            onClick={() => router.push("/clients")}
            style={{ fontSize: "13px", color: "var(--color-text-secondary)", cursor: "pointer" }}
          >
            Clients
          </span>
          <span style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}> / </span>
          <span style={{ fontSize: "13px", color: "var(--color-text-primary)" }}>{client.name}</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px", marginTop: "8px" }}>
          <h1 style={{ fontSize: "22px", fontWeight: 500 }}>{client.name}</h1>
          <span style={{
            fontSize: "12px", padding: "3px 8px", borderRadius: "6px",
            background: "var(--color-background-secondary)",
            border: "0.5px solid var(--color-border-tertiary)",
            color: "var(--color-text-secondary)",
          }}>
            {client.type === "BUSINESS" ? "Business" : "Residential"}
          </span>
        </div>

        <div style={{ display: "flex", gap: "4px", marginBottom: "24px", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                fontSize: "14px", padding: "8px 14px",
                background: "none", border: "none", cursor: "pointer",
                color: activeTab === tab ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                fontWeight: activeTab === tab ? 500 : 400,
                borderBottom: activeTab === tab ? "2px solid var(--color-text-primary)" : "2px solid transparent",
                marginBottom: "-0.5px",
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === "Overview" && (
          <div style={{ maxWidth: "600px" }}>
            <div style={{
              background: "var(--color-background-secondary)",
              border: "0.5px solid var(--color-border-tertiary)",
              borderRadius: "10px", padding: "20px", marginBottom: "16px",
            }}>
              <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: "12px" }}>
                Details
              </div>
              {[
                { label: "Type", value: client.type === "BUSINESS" ? "Business" : "Residential" },
                { label: "Syncro ID", value: client.syncroId ?? "Not linked" },
                { label: "Status", value: client.isActive ? "Active" : "Inactive" },
                { label: "Locations", value: String(client.locations.length) },
                { label: "Users", value: String(client.users.length) },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                  <span style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>{label}</span>
                  <span style={{ fontSize: "13px", color: "var(--color-text-primary)" }}>{value}</span>
                </div>
              ))}
            </div>

            {client.notes && (
              <div style={{
                background: "var(--color-background-secondary)",
                border: "0.5px solid var(--color-border-tertiary)",
                borderRadius: "10px", padding: "20px",
              }}>
                <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: "8px" }}>Notes</div>
                <div style={{ fontSize: "14px", color: "var(--color-text-primary)", lineHeight: "1.6" }}>{client.notes}</div>
              </div>
            )}
          </div>
        )}

        {activeTab === "Locations" && (
          <div style={{ maxWidth: "700px" }}>
            {client.locations.length === 0 ? (
              <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>No locations yet.</div>
            ) : client.locations.map((loc) => (
              <div key={loc.id} style={{
                background: "var(--color-background-secondary)",
                border: "0.5px solid var(--color-border-tertiary)",
                borderRadius: "10px", padding: "16px", marginBottom: "10px",
              }}>
                <div style={{ fontSize: "14px", fontWeight: 500 }}>{loc.name}</div>
                {(loc.address || loc.city) && (
                  <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginTop: "4px" }}>
                    {[loc.address, loc.city, loc.state].filter(Boolean).join(", ")}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === "Users" && (
          <div style={{ maxWidth: "700px" }}>
            {client.users.length === 0 ? (
              <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>No users yet.</div>
            ) : client.users.map((user) => (
              <div key={user.id} style={{
                background: "var(--color-background-secondary)",
                border: "0.5px solid var(--color-border-tertiary)",
                borderRadius: "10px", padding: "16px", marginBottom: "10px",
                display: "flex", justifyContent: "space-between",
              }}>
                <div>
                  <div style={{ fontSize: "14px", fontWeight: 500 }}>{user.name}</div>
                  {user.jobTitle && <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginTop: "2px" }}>{user.jobTitle}</div>}
                </div>
                {user.email && <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>{user.email}</div>}
              </div>
            ))}
          </div>
        )}

        {["Assets", "Credentials", "Licenses", "Activity"].includes(activeTab) && (
          <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>
            {activeTab} coming soon.
          </div>
        )}
      </div>
    </AppShell>
  )
}
