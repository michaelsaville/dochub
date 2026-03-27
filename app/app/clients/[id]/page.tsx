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
  contacts: { id: string; name: string; role: string | null; email: string | null; phone: string | null; mobile: string | null; notes: string | null }[]
}

type Asset = {
  id: string
  name: string
  category: string
  make: string | null
  model: string | null
  serial: string | null
  macAddress: string | null
  status: string
  managementUrl: string | null
  warrantyExpiry: string | null
  notes: string | null
}

const tabs = ["Overview", "Locations", "Users", "Assets", "Contacts", "Credentials", "Licenses", "Activity"]

const categoryLabel: Record<string, string> = {
  COMPUTER: "Desktop",
  LAPTOP: "Laptop",
  SERVER: "Server",
  NAS: "NAS",
  NETWORK_GEAR: "Network",
  WIRELESS: "Wireless",
  PRINTER: "Printer",
  TABLET: "Tablet",
  PHONE_SYSTEM: "Phone System",
  PHONE_ENDPOINT: "Phone",
  WEBSITE: "Website",
  VPN: "VPN",
  OTHER: "Other",
}

const statusColor: Record<string, string> = {
  ACTIVE: "#22c55e",
  RETIRING: "#f59e0b",
  SUNSET: "#94a3b8",
}

export default function ClientDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const [client, setClient] = useState<Client | null>(null)
  const [assets, setAssets] = useState<Asset[]>([])
  const [loadingClient, setLoadingClient] = useState(true)
  const [loadingAssets, setLoadingAssets] = useState(false)
  const [activeTab, setActiveTab] = useState("Overview")
  const [credentials, setCredentials] = useState<any[]>([])
  const [loadingCreds, setLoadingCreds] = useState(false)
  const [showAddCred, setShowAddCred] = useState(false)
  const [credForm, setCredForm] = useState({ label: "", username: "", password: "", url: "", notes: "" })
  const [savingCred, setSavingCred] = useState(false)
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, string>>({})

  useEffect(() => {
    if (id) fetchClient()
  }, [id])

  useEffect(() => {
    if (activeTab === "Assets" && assets.length === 0) fetchAssets()
    if (activeTab === "Credentials" && credentials.length === 0) fetchCredentials()
  }, [activeTab])

  async function fetchClient() {
    try {
      const res = await fetch("/api/clients/" + id)
      if (!res.ok) { router.push("/clients"); return }
      setClient(await res.json())
    } catch { router.push("/clients") }
    finally { setLoadingClient(false) }
  }

  async function fetchCredentials() {
    setLoadingCreds(true)
    try {
      const res = await fetch(`/api/clients/${id}/credentials`)
      setCredentials(await res.json())
    } catch {}
    finally { setLoadingCreds(false) }
  }

  async function revealPassword(credId: string) {
    if (revealedPasswords[credId]) {
      setRevealedPasswords(p => { const n = {...p}; delete n[credId]; return n })
      return
    }
    try {
      const res = await fetch(`/api/credentials/${credId}/reveal`)
      const data = await res.json()
      setRevealedPasswords(p => ({ ...p, [credId]: data.password }))
    } catch {}
  }

  async function saveCred() {
    if (!credForm.label.trim() || !credForm.password.trim()) return
    setSavingCred(true)
    try {
      const res = await fetch(`/api/clients/${id}/credentials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credForm),
      })
      if (res.ok) {
        const newCred = await res.json()
        setCredentials(c => [...c, newCred])
        setCredForm({ label: "", username: "", password: "", url: "", notes: "" })
        setShowAddCred(false)
      }
    } catch {}
    finally { setSavingCred(false) }
  }

  async function deleteCred(credId: string) {
    if (!confirm("Retire this credential?")) return
    try {
      await fetch(`/api/credentials/${credId}`, { method: "DELETE" })
      setCredentials(c => c.filter(x => x.id !== credId))
    } catch {}
  }

  async function fetchAssets() {
    setLoadingAssets(true)
    try {
      const res = await fetch(`/api/clients/${id}/assets`)
      setAssets(await res.json())
    } catch {}
    finally { setLoadingAssets(false) }
  }

  // Group assets by category
  const assetsByCategory = assets.reduce((acc, asset) => {
    const cat = asset.category
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(asset)
    return acc
  }, {} as Record<string, Asset[]>)

  const categoryOrder = ["NETWORK_GEAR", "WIRELESS", "SERVER", "NAS", "COMPUTER", "LAPTOP", "TABLET", "PRINTER", "PHONE_SYSTEM", "PHONE_ENDPOINT", "WEBSITE", "VPN", "OTHER"]

  if (loadingClient) return (
    <AppShell>
      <div style={{ padding: "32px", color: "var(--color-text-secondary)", fontSize: "14px" }}>Loading...</div>
    </AppShell>
  )

  if (!client) return null

  return (
    <AppShell>
      <div style={{ padding: "32px" }}>
        <div style={{ marginBottom: "4px" }}>
          <span onClick={() => router.push("/clients")} style={{ fontSize: "13px", color: "var(--color-text-secondary)", cursor: "pointer" }}>Clients</span>
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
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              fontSize: "14px", padding: "8px 14px", background: "none", border: "none", cursor: "pointer",
              color: activeTab === tab ? "var(--color-text-primary)" : "var(--color-text-secondary)",
              fontWeight: activeTab === tab ? 500 : 400,
              borderBottom: activeTab === tab ? "2px solid var(--color-text-primary)" : "2px solid transparent",
              marginBottom: "-0.5px",
            }}>
              {tab}{tab === "Assets" && assets.length > 0 ? ` (${assets.length})` : ""}
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
              <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: "12px" }}>Details</div>
              {[
                { label: "Type", value: client.type === "BUSINESS" ? "Business" : "Residential" },
                { label: "Syncro ID", value: client.syncroId ?? "Not linked" },
                { label: "Status", value: client.isActive ? "Active" : "Inactive" },
                { label: "Locations", value: String(client.locations.length) },
                { label: "Users", value: String(client.users.length) },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                  <span style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>{label}</span>
                  <span style={{ fontSize: "13px" }}>{value}</span>
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
                <div style={{ fontSize: "14px", lineHeight: "1.6" }}>{client.notes}</div>
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

        {activeTab === "Assets" && (
          <div style={{ maxWidth: "900px" }}>
            {loadingAssets ? (
              <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>Loading assets...</div>
            ) : assets.length === 0 ? (
              <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>No assets found.</div>
            ) : (
              categoryOrder
                .filter(cat => assetsByCategory[cat])
                .map(cat => (
                  <div key={cat} style={{ marginBottom: "24px" }}>
                    <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      {categoryLabel[cat] ?? cat} ({assetsByCategory[cat].length})
                    </div>
                    <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "10px", overflow: "hidden" }}>
                      <div style={{
                        display: "grid", gridTemplateColumns: "1fr 160px 120px 100px 80px",
                        padding: "8px 16px", background: "var(--color-background-secondary)",
                        borderBottom: "0.5px solid var(--color-border-tertiary)",
                      }}>
                        {["Name", "Make / Model", "Serial", "MAC", "Status"].map(h => (
                          <div key={h} style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-secondary)" }}>{h}</div>
                        ))}
                      </div>
                      {assetsByCategory[cat].map((asset, i) => (
                        <div key={asset.id} style={{
                          display: "grid", gridTemplateColumns: "1fr 160px 120px 100px 80px",
                          padding: "10px 16px", background: "var(--color-background-primary)",
                          borderBottom: i < assetsByCategory[cat].length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none",
                          cursor: "pointer",
                        }}
                          onClick={() => router.push("/assets/" + asset.id)}
                          onMouseEnter={e => (e.currentTarget.style.background = "var(--color-background-secondary)")}
                          onMouseLeave={e => (e.currentTarget.style.background = "var(--color-background-primary)")}
                        >
                          <div>
                            <div style={{ fontSize: "14px", fontWeight: 500 }}>{asset.name}</div>
                            {asset.notes && <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "2px" }}>{asset.notes}</div>}
                          </div>
                          <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>
                            {[asset.make, asset.model].filter(Boolean).join(" ") || "—"}
                          </div>
                          <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", fontFamily: "monospace" }}>
                            {asset.serial || "—"}
                          </div>
                          <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", fontFamily: "monospace" }}>
                            {asset.macAddress || "—"}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: statusColor[asset.status] ?? "#94a3b8", flexShrink: 0 }} />
                            <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
                              {asset.status.charAt(0) + asset.status.slice(1).toLowerCase()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
            )}
          </div>
        )}

        {activeTab === "Contacts" && (
          <div style={{ maxWidth: "700px" }}>
            {client.contacts.length === 0 ? (
              <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>No contacts yet.</div>
            ) : client.contacts.map((contact) => (
              <div key={contact.id} style={{
                background: "var(--color-background-secondary)",
                border: "0.5px solid var(--color-border-tertiary)",
                borderRadius: "10px", padding: "16px", marginBottom: "10px",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: "14px", fontWeight: 500 }}>{contact.name}</div>
                    {contact.role && <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginTop: "2px" }}>{contact.role}</div>}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    {contact.email && <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>{contact.email}</div>}
                    {contact.phone && <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginTop: "2px" }}>{contact.phone}</div>}
                  </div>
                </div>
                {contact.notes && <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginTop: "8px", borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: "8px" }}>{contact.notes}</div>}
              </div>
            ))}
          </div>
        )}

        {activeTab === "Contacts" && (
          <div style={{ maxWidth: "700px" }}>
            {client.contacts.length === 0 ? (
              <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>No contacts yet.</div>
            ) : client.contacts.map((contact) => (
              <div key={contact.id} style={{
                background: "var(--color-background-secondary)",
                border: "0.5px solid var(--color-border-tertiary)",
                borderRadius: "10px", padding: "16px", marginBottom: "10px",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: "14px", fontWeight: 500 }}>{contact.name}</div>
                    {contact.role && <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginTop: "2px" }}>{contact.role}</div>}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    {contact.email && <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>{contact.email}</div>}
                    {contact.phone && <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginTop: "2px" }}>{contact.phone}</div>}
                  </div>
                </div>
                {contact.notes && <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginTop: "8px", borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: "8px" }}>{contact.notes}</div>}
              </div>
            ))}
          </div>
        )}

        {activeTab === "Credentials" && (
          <div style={{ maxWidth: "700px" }}>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px" }}>
              <button onClick={() => setShowAddCred(true)} style={{
                fontSize: "14px", fontWeight: 500, padding: "8px 16px",
                borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)",
                background: "var(--color-background-primary)", cursor: "pointer",
              }}>Add credential</button>
            </div>

            {showAddCred && (
              <div style={{
                background: "var(--color-background-secondary)",
                border: "0.5px solid var(--color-border-secondary)",
                borderRadius: "10px", padding: "20px", marginBottom: "16px",
              }}>
                <div style={{ fontSize: "15px", fontWeight: 500, marginBottom: "16px" }}>New credential</div>
                {[
                  { key: "label", label: "Label", placeholder: "e.g. Router admin, Office WiFi" },
                  { key: "username", label: "Username", placeholder: "" },
                  { key: "password", label: "Password", placeholder: "" },
                  { key: "url", label: "URL", placeholder: "https://" },
                  { key: "notes", label: "Notes", placeholder: "" },
                ].map(({ key, label, placeholder }) => (
                  <div key={key} style={{ marginBottom: "12px" }}>
                    <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>{label}</label>
                    <input
                      type={key === "password" ? "password" : "text"}
                      value={credForm[key as keyof typeof credForm]}
                      onChange={e => setCredForm(f => ({ ...f, [key]: e.target.value }))}
                      placeholder={placeholder}
                      style={{
                        width: "100%", padding: "8px 12px", fontSize: "14px",
                        border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px",
                        background: "var(--color-background-primary)", color: "var(--color-text-primary)",
                      }}
                    />
                  </div>
                ))}
                <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                  <button onClick={saveCred} disabled={savingCred} style={{
                    fontSize: "14px", fontWeight: 500, padding: "8px 16px", borderRadius: "8px",
                    border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer",
                  }}>{savingCred ? "Saving..." : "Save"}</button>
                  <button onClick={() => setShowAddCred(false)} style={{
                    fontSize: "14px", padding: "8px 16px", borderRadius: "8px",
                    border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer",
                    color: "var(--color-text-secondary)",
                  }}>Cancel</button>
                </div>
              </div>
            )}

            {loadingCreds ? (
              <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>Loading...</div>
            ) : credentials.length === 0 && !showAddCred ? (
              <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>No credentials yet.</div>
            ) : credentials.map(cred => (
              <div key={cred.id} style={{
                background: "var(--color-background-secondary)",
                border: "0.5px solid var(--color-border-tertiary)",
                borderRadius: "10px", padding: "16px", marginBottom: "10px",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                  <div style={{ fontSize: "14px", fontWeight: 500 }}>{cred.label}</div>
                  <button onClick={() => deleteCred(cred.id)} style={{
                    fontSize: "12px", color: "var(--color-text-secondary)", background: "none",
                    border: "none", cursor: "pointer", padding: 0,
                  }}>Retire</button>
                </div>
                {cred.username && (
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "4px" }}>
                    <span style={{ fontSize: "12px", color: "var(--color-text-secondary)", width: "80px" }}>Username</span>
                    <span style={{ fontSize: "13px", fontFamily: "monospace" }}>{cred.username}</span>
                  </div>
                )}
                {cred.hasPassword && (
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "4px" }}>
                    <span style={{ fontSize: "12px", color: "var(--color-text-secondary)", width: "80px" }}>Password</span>
                    <span style={{ fontSize: "13px", fontFamily: "monospace" }}>
                      {revealedPasswords[cred.id] ?? "••••••••••••"}
                    </span>
                    <button onClick={() => revealPassword(cred.id)} style={{
                      fontSize: "12px", color: "var(--color-text-secondary)", background: "none",
                      border: "none", cursor: "pointer", padding: 0,
                    }}>{revealedPasswords[cred.id] ? "Hide" : "Show"}</button>
                  </div>
                )}
                {cred.url && (
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "4px" }}>
                    <span style={{ fontSize: "12px", color: "var(--color-text-secondary)", width: "80px" }}>URL</span>
                    <a href={cred.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "13px", color: "var(--color-text-primary)" }}>{cred.url}</a>
                  </div>
                )}
                {cred.notes && (
                  <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginTop: "8px", borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: "8px" }}>{cred.notes}</div>
                )}
              </div>
            ))}
          </div>
        )}

        {["Licenses", "Activity"].includes(activeTab) && (
          <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>{activeTab} coming soon.</div>
        )}
      </div>
    </AppShell>
  )
}
