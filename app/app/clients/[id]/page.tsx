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

const tabs = ["Overview", "Locations", "Users", "Assets", "Contacts", "Credentials", "Licenses", "Applications", "Activity"]

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
  const [editingClient, setEditingClient] = useState(false)
  const [clientForm, setClientForm] = useState({ name: "", type: "BUSINESS", notes: "" })
  const [savingClient, setSavingClient] = useState(false)
  const [editingLocation, setEditingLocation] = useState<string | null>(null)
  const [locationForm, setLocationForm] = useState({ name: "", address: "", city: "", state: "", zip: "", ispName: "", wanIp: "", notes: "" })
  const [showAddLocation, setShowAddLocation] = useState(false)
  const [addLocationForm, setAddLocationForm] = useState({ name: "", address: "", city: "", state: "", zip: "" })
  const [savingLocation, setSavingLocation] = useState(false)
  const [licenses, setLicenses] = useState<any[]>([])
  const [loadingLicenses, setLoadingLicenses] = useState(false)
  const [showAddLicense, setShowAddLicense] = useState(false)
  const [licenseForm, setLicenseForm] = useState({ name: "", vendor: "", seats: "", expiryDate: "", renewalDate: "", cost: "", notes: "" })
  const [savingLicense, setSavingLicense] = useState(false)
  const [editingLicense, setEditingLicense] = useState<string | null>(null)
  const [licenseEditForm, setLicenseEditForm] = useState<any>({})
  const [applications, setApplications] = useState<any[]>([])
  const [loadingApps, setLoadingApps] = useState(false)
  const [showAddApp, setShowAddApp] = useState(false)
  const [appForm, setAppForm] = useState({ name: "", vendor: "", version: "", supportUrl: "", notes: "" })
  const [savingApp, setSavingApp] = useState(false)
  const [editingApp, setEditingApp] = useState<string | null>(null)
  const [appEditForm, setAppEditForm] = useState<any>({})
  const [activityEvents, setActivityEvents] = useState<any[]>([])
  const [loadingActivity, setLoadingActivity] = useState(false)
  const [showAddEvent, setShowAddEvent] = useState(false)
  const [eventForm, setEventForm] = useState({ eventType: "TECH_NOTE", title: "", bodyText: "" })
  const [savingEvent, setSavingEvent] = useState(false)

  useEffect(() => {
    if (id) fetchClient()
  }, [id])

  useEffect(() => {
    if (activeTab === "Assets" && assets.length === 0) fetchAssets()
    if (activeTab === "Credentials" && credentials.length === 0) fetchCredentials()
    if (activeTab === "Licenses" && licenses.length === 0) fetchLicenses()
    if (activeTab === "Applications" && applications.length === 0) fetchApplications()
    if (activeTab === "Activity" && activityEvents.length === 0) fetchActivity()
  }, [activeTab])

  async function fetchClient() {
    try {
      const res = await fetch("/api/clients/" + id)
      if (!res.ok) { router.push("/clients"); return }
      setClient(await res.json())
    } catch { router.push("/clients") }
    finally { setLoadingClient(false) }
  }

  async function saveClient() {
    setSavingClient(true)
    try {
      const res = await fetch(`/api/clients/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(clientForm),
      })
      if (res.ok) {
        const updated = await res.json()
        setClient(c => c ? { ...c, name: updated.name, type: updated.type, notes: updated.notes } : c)
        setEditingClient(false)
      }
    } catch {}
    finally { setSavingClient(false) }
  }

  async function saveLocation(locationId: string) {
    setSavingLocation(true)
    try {
      const res = await fetch(`/api/locations/${locationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(locationForm),
      })
      if (res.ok) {
        const updated = await res.json()
        setClient(c => c ? { ...c, locations: c.locations.map(l => l.id === locationId ? { ...l, ...updated } : l) } : c)
        setEditingLocation(null)
      }
    } catch {}
    finally { setSavingLocation(false) }
  }

  async function addLocation() {
    setSavingLocation(true)
    try {
      const res = await fetch(`/api/clients/${id}/locations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addLocationForm),
      })
      if (res.ok) {
        const newLoc = await res.json()
        setClient(c => c ? { ...c, locations: [...c.locations, newLoc] } : c)
        setAddLocationForm({ name: "", address: "", city: "", state: "", zip: "" })
        setShowAddLocation(false)
      }
    } catch {}
    finally { setSavingLocation(false) }
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

  async function fetchLicenses() {
    setLoadingLicenses(true)
    try {
      const res = await fetch(`/api/clients/${id}/licenses`)
      setLicenses(await res.json())
    } catch {}
    finally { setLoadingLicenses(false) }
  }

  async function fetchApplications() {
    setLoadingApps(true)
    try {
      const res = await fetch(`/api/clients/${id}/applications`)
      setApplications(await res.json())
    } catch {}
    finally { setLoadingApps(false) }
  }

  async function saveLicense() {
    if (!licenseForm.name.trim()) return
    setSavingLicense(true)
    try {
      const res = await fetch(`/api/clients/${id}/licenses`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(licenseForm),
      })
      if (res.ok) {
        const newLicense = await res.json()
        setLicenses(l => [...l, newLicense])
        setLicenseForm({ name: "", vendor: "", seats: "", expiryDate: "", renewalDate: "", cost: "", notes: "" })
        setShowAddLicense(false)
      }
    } catch {}
    finally { setSavingLicense(false) }
  }

  async function updateLicense(licenseId: string) {
    try {
      const res = await fetch(`/api/clients/${id}/licenses/${licenseId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(licenseEditForm),
      })
      if (res.ok) {
        const updated = await res.json()
        setLicenses(l => l.map(x => x.id === licenseId ? updated : x))
        setEditingLicense(null)
      }
    } catch {}
  }

  async function deleteLicense(licenseId: string) {
    if (!confirm("Remove this license?")) return
    try {
      await fetch(`/api/clients/${id}/licenses/${licenseId}`, { method: "DELETE" })
      setLicenses(l => l.filter(x => x.id !== licenseId))
    } catch {}
  }

  async function saveApp() {
    if (!appForm.name.trim()) return
    setSavingApp(true)
    try {
      const res = await fetch(`/api/clients/${id}/applications`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(appForm),
      })
      if (res.ok) {
        const newApp = await res.json()
        setApplications(a => [...a, newApp])
        setAppForm({ name: "", vendor: "", version: "", supportUrl: "", notes: "" })
        setShowAddApp(false)
      }
    } catch {}
    finally { setSavingApp(false) }
  }

  async function updateApp(appId: string) {
    try {
      const res = await fetch(`/api/clients/${id}/applications/${appId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(appEditForm),
      })
      if (res.ok) {
        const updated = await res.json()
        setApplications(a => a.map(x => x.id === appId ? updated : x))
        setEditingApp(null)
      }
    } catch {}
  }

  async function deleteApp(appId: string) {
    if (!confirm("Remove this application?")) return
    try {
      await fetch(`/api/clients/${id}/applications/${appId}`, { method: "DELETE" })
      setApplications(a => a.filter(x => x.id !== appId))
    } catch {}
  }

  async function fetchActivity() {
    setLoadingActivity(true)
    try {
      const res = await fetch(`/api/clients/${id}/activity`)
      setActivityEvents(await res.json())
    } catch {}
    finally { setLoadingActivity(false) }
  }

  async function saveEvent() {
    if (!eventForm.title.trim()) return
    setSavingEvent(true)
    try {
      const res = await fetch(`/api/clients/${id}/activity`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(eventForm),
      })
      if (res.ok) {
        setActivityEvents(await res.json())
        setEventForm({ eventType: "TECH_NOTE", title: "", bodyText: "" })
        setShowAddEvent(false)
      }
    } catch {}
    finally { setSavingEvent(false) }
  }

  async function togglePin(eventId: string, isPinned: boolean) {
    try {
      const res = await fetch(`/api/clients/${id}/activity/${eventId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPinned: !isPinned }),
      })
      if (res.ok) {
        const updated = await res.json()
        setActivityEvents(e => e.map(x => x.id === eventId ? updated : x)
          .sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
      }
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
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px" }}>
              <button onClick={() => setShowAddLocation(true)} style={{
                fontSize: "14px", fontWeight: 500, padding: "8px 16px", borderRadius: "8px",
                border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: "pointer",
              }}>Add location</button>
            </div>

            {showAddLocation && (
              <div style={{ background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: "10px", padding: "20px", marginBottom: "16px" }}>
                <div style={{ fontSize: "15px", fontWeight: 500, marginBottom: "16px" }}>New location</div>
                {[
                  { key: "name", label: "Name", placeholder: "e.g. Main Office" },
                  { key: "address", label: "Address", placeholder: "" },
                  { key: "city", label: "City", placeholder: "" },
                  { key: "state", label: "State", placeholder: "" },
                  { key: "zip", label: "ZIP", placeholder: "" },
                ].map(({ key, label, placeholder }) => (
                  <div key={key} style={{ marginBottom: "10px" }}>
                    <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>{label}</label>
                    <input value={addLocationForm[key as keyof typeof addLocationForm]} onChange={e => setAddLocationForm(f => ({ ...f, [key]: e.target.value }))} placeholder={placeholder}
                      style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }} />
                  </div>
                ))}
                <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                  <button onClick={addLocation} disabled={savingLocation} style={{ fontSize: "14px", fontWeight: 500, padding: "8px 16px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>
                    {savingLocation ? "Saving..." : "Add"}
                  </button>
                  <button onClick={() => setShowAddLocation(false)} style={{ fontSize: "14px", padding: "8px 16px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>Cancel</button>
                </div>
              </div>
            )}

            {client.locations.length === 0 ? (
              <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>No locations yet.</div>
            ) : client.locations.map((loc) => (
              <div key={loc.id} style={{ background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "10px", padding: "16px", marginBottom: "10px" }}>
                {editingLocation === loc.id ? (
                  <div>
                    {[
                      { key: "name", label: "Name" },
                      { key: "address", label: "Address" },
                      { key: "city", label: "City" },
                      { key: "state", label: "State" },
                      { key: "zip", label: "ZIP" },
                      { key: "ispName", label: "ISP" },
                      { key: "wanIp", label: "WAN IP" },
                      { key: "notes", label: "Notes" },
                    ].map(({ key, label }) => (
                      <div key={key} style={{ marginBottom: "10px" }}>
                        <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>{label}</label>
                        <input value={locationForm[key as keyof typeof locationForm]} onChange={e => setLocationForm(f => ({ ...f, [key]: e.target.value }))}
                          style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }} />
                      </div>
                    ))}
                    <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                      <button onClick={() => saveLocation(loc.id)} disabled={savingLocation} style={{ fontSize: "14px", fontWeight: 500, padding: "8px 16px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>
                        {savingLocation ? "Saving..." : "Save"}
                      </button>
                      <button onClick={() => setEditingLocation(null)} style={{ fontSize: "14px", padding: "8px 16px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ fontSize: "14px", fontWeight: 500 }}>{loc.name}</div>
                      <button onClick={() => { setEditingLocation(loc.id); setLocationForm({ name: loc.name, address: loc.address ?? "", city: loc.city ?? "", state: loc.state ?? "", zip: (loc as any).zip ?? "", ispName: (loc as any).ispName ?? "", wanIp: (loc as any).wanIp ?? "", notes: (loc as any).notes ?? "" }) }} style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Edit</button>
                    </div>
                    {(loc.address || loc.city) && (
                      <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginTop: "4px" }}>
                        {[loc.address, loc.city, loc.state].filter(Boolean).join(", ")}
                      </div>
                    )}
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

        {activeTab === "Licenses" && (
          <div style={{ maxWidth: "800px" }}>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px" }}>
              <button onClick={() => setShowAddLicense(true)} style={{ fontSize: "14px", fontWeight: 500, padding: "8px 16px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: "pointer" }}>Add license</button>
            </div>
            {showAddLicense && (
              <div style={{ background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: "10px", padding: "20px", marginBottom: "16px" }}>
                <div style={{ fontSize: "15px", fontWeight: 500, marginBottom: "16px" }}>New license</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                  {[
                    { key: "name", label: "Name *", placeholder: "e.g. Microsoft 365 Business" },
                    { key: "vendor", label: "Vendor", placeholder: "e.g. Microsoft" },
                    { key: "seats", label: "Seats", placeholder: "Number of seats" },
                    { key: "cost", label: "Cost ($/mo)", placeholder: "" },
                    { key: "expiryDate", label: "Expiry date", placeholder: "", type: "date" },
                    { key: "renewalDate", label: "Renewal date", placeholder: "", type: "date" },
                    { key: "notes", label: "Notes", placeholder: "" },
                  ].map(({ key, label, placeholder, type }) => (
                    <div key={key} style={key === "notes" ? { gridColumn: "1 / -1" } : {}}>
                      <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>{label}</label>
                      <input type={type ?? "text"} value={licenseForm[key as keyof typeof licenseForm]} onChange={e => setLicenseForm(f => ({ ...f, [key]: e.target.value }))} placeholder={placeholder}
                        style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" }} />
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button onClick={saveLicense} disabled={savingLicense} style={{ fontSize: "14px", fontWeight: 500, padding: "8px 16px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>{savingLicense ? "Saving..." : "Save"}</button>
                  <button onClick={() => setShowAddLicense(false)} style={{ fontSize: "14px", padding: "8px 16px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>Cancel</button>
                </div>
              </div>
            )}
            {loadingLicenses ? (
              <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>Loading...</div>
            ) : licenses.length === 0 && !showAddLicense ? (
              <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>No licenses yet.</div>
            ) : (
              <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "10px", overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 60px 120px 120px 80px", padding: "10px 16px", background: "var(--color-background-secondary)", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                  {["Name", "Vendor", "Seats", "Expiry", "Renewal", ""].map(h => (
                    <div key={h} style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-secondary)" }}>{h}</div>
                  ))}
                </div>
                {licenses.map((lic, i) => editingLicense === lic.id ? (
                  <div key={lic.id} style={{ padding: "14px 16px", borderBottom: i < licenses.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none", background: "var(--color-background-primary)" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
                      {[
                        { key: "name", label: "Name" }, { key: "vendor", label: "Vendor" },
                        { key: "seats", label: "Seats" }, { key: "cost", label: "Cost ($/mo)" },
                        { key: "expiryDate", label: "Expiry", type: "date" }, { key: "renewalDate", label: "Renewal", type: "date" },
                        { key: "notes", label: "Notes" },
                      ].map(({ key, label, type }) => (
                        <div key={key} style={key === "notes" ? { gridColumn: "1 / -1" } : {}}>
                          <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>{label}</label>
                          <input type={type ?? "text"} value={licenseEditForm[key] ?? ""} onChange={e => setLicenseEditForm((f: any) => ({ ...f, [key]: e.target.value }))}
                            style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }} />
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button onClick={() => updateLicense(lic.id)} style={{ fontSize: "13px", fontWeight: 500, padding: "6px 14px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>Save</button>
                      <button onClick={() => setEditingLicense(null)} style={{ fontSize: "13px", padding: "6px 14px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div key={lic.id} style={{ display: "grid", gridTemplateColumns: "1fr 140px 60px 120px 120px 80px", padding: "12px 16px", borderBottom: i < licenses.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none", background: "var(--color-background-primary)", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: "14px", fontWeight: 500 }}>{lic.name}</div>
                      {lic.notes && <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "2px" }}>{lic.notes}</div>}
                    </div>
                    <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>{lic.vendor ?? "—"}</div>
                    <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>{lic.seats ?? "—"}</div>
                    <div style={{ fontSize: "13px", color: lic.expiryDate && new Date(lic.expiryDate) < new Date() ? "var(--color-text-danger)" : "var(--color-text-secondary)" }}>
                      {lic.expiryDate ? new Date(lic.expiryDate).toLocaleDateString() : "—"}
                    </div>
                    <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>{lic.renewalDate ? new Date(lic.renewalDate).toLocaleDateString() : "—"}</div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button onClick={() => { setEditingLicense(lic.id); setLicenseEditForm({ ...lic, expiryDate: lic.expiryDate ? lic.expiryDate.slice(0, 10) : "", renewalDate: lic.renewalDate ? lic.renewalDate.slice(0, 10) : "" }) }} style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Edit</button>
                      <button onClick={() => deleteLicense(lic.id)} style={{ fontSize: "12px", color: "var(--color-text-danger)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "Applications" && (
          <div style={{ maxWidth: "800px" }}>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px" }}>
              <button onClick={() => setShowAddApp(true)} style={{ fontSize: "14px", fontWeight: 500, padding: "8px 16px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: "pointer" }}>Add application</button>
            </div>
            {showAddApp && (
              <div style={{ background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: "10px", padding: "20px", marginBottom: "16px" }}>
                <div style={{ fontSize: "15px", fontWeight: 500, marginBottom: "16px" }}>New application</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                  {[
                    { key: "name", label: "Name *", placeholder: "e.g. AutoCAD" },
                    { key: "vendor", label: "Vendor", placeholder: "e.g. Autodesk" },
                    { key: "version", label: "Version", placeholder: "" },
                    { key: "supportUrl", label: "Support URL", placeholder: "https://" },
                    { key: "notes", label: "Notes", placeholder: "" },
                  ].map(({ key, label, placeholder }) => (
                    <div key={key} style={key === "notes" || key === "supportUrl" ? { gridColumn: "1 / -1" } : {}}>
                      <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>{label}</label>
                      <input value={appForm[key as keyof typeof appForm]} onChange={e => setAppForm(f => ({ ...f, [key]: e.target.value }))} placeholder={placeholder}
                        style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" }} />
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button onClick={saveApp} disabled={savingApp} style={{ fontSize: "14px", fontWeight: 500, padding: "8px 16px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>{savingApp ? "Saving..." : "Save"}</button>
                  <button onClick={() => setShowAddApp(false)} style={{ fontSize: "14px", padding: "8px 16px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>Cancel</button>
                </div>
              </div>
            )}
            {loadingApps ? (
              <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>Loading...</div>
            ) : applications.length === 0 && !showAddApp ? (
              <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>No applications yet.</div>
            ) : (
              <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "10px", overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 100px 1fr 80px", padding: "10px 16px", background: "var(--color-background-secondary)", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                  {["Name", "Vendor", "Version", "Support", ""].map(h => (
                    <div key={h} style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-secondary)" }}>{h}</div>
                  ))}
                </div>
                {applications.map((app, i) => editingApp === app.id ? (
                  <div key={app.id} style={{ padding: "14px 16px", borderBottom: i < applications.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none", background: "var(--color-background-primary)" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
                      {[
                        { key: "name", label: "Name" }, { key: "vendor", label: "Vendor" },
                        { key: "version", label: "Version" }, { key: "supportUrl", label: "Support URL" },
                        { key: "notes", label: "Notes" },
                      ].map(({ key, label }) => (
                        <div key={key} style={key === "notes" || key === "supportUrl" ? { gridColumn: "1 / -1" } : {}}>
                          <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>{label}</label>
                          <input value={appEditForm[key] ?? ""} onChange={e => setAppEditForm((f: any) => ({ ...f, [key]: e.target.value }))}
                            style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }} />
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button onClick={() => updateApp(app.id)} style={{ fontSize: "13px", fontWeight: 500, padding: "6px 14px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>Save</button>
                      <button onClick={() => setEditingApp(null)} style={{ fontSize: "13px", padding: "6px 14px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div key={app.id} style={{ display: "grid", gridTemplateColumns: "1fr 140px 100px 1fr 80px", padding: "12px 16px", borderBottom: i < applications.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none", background: "var(--color-background-primary)", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: "14px", fontWeight: 500 }}>{app.name}</div>
                      {app.notes && <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "2px" }}>{app.notes}</div>}
                    </div>
                    <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>{app.vendor ?? "—"}</div>
                    <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", fontFamily: "monospace" }}>{app.version ?? "—"}</div>
                    <div style={{ fontSize: "13px" }}>
                      {app.supportUrl ? <a href={app.supportUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-text-secondary)" }}>{app.supportUrl}</a> : "—"}
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button onClick={() => { setEditingApp(app.id); setAppEditForm({ ...app }) }} style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Edit</button>
                      <button onClick={() => deleteApp(app.id)} style={{ fontSize: "12px", color: "var(--color-text-danger)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "Activity" && (
          <div style={{ maxWidth: "680px" }}>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "20px" }}>
              <button onClick={() => setShowAddEvent(true)} style={{ fontSize: "14px", fontWeight: 500, padding: "8px 16px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: "pointer" }}>Add note</button>
            </div>

            {showAddEvent && (
              <div style={{ background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: "10px", padding: "20px", marginBottom: "20px" }}>
                <div style={{ fontSize: "15px", fontWeight: 500, marginBottom: "16px" }}>New event</div>
                <div style={{ marginBottom: "12px" }}>
                  <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>Type</label>
                  <select value={eventForm.eventType} onChange={e => setEventForm(f => ({ ...f, eventType: e.target.value }))}
                    style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}>
                    <option value="TECH_NOTE">Tech note</option>
                    <option value="SITE_VISIT">Site visit</option>
                    <option value="KNOWN_ISSUE">Known issue</option>
                    <option value="PLANNED_MAINTENANCE">Planned maintenance</option>
                  </select>
                </div>
                <div style={{ marginBottom: "12px" }}>
                  <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>Title *</label>
                  <input autoFocus value={eventForm.title} onChange={e => setEventForm(f => ({ ...f, title: e.target.value }))}
                    style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" }} />
                </div>
                <div style={{ marginBottom: "16px" }}>
                  <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>Details</label>
                  <textarea value={eventForm.bodyText} onChange={e => setEventForm(f => ({ ...f, bodyText: e.target.value }))} rows={3}
                    style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", resize: "vertical", boxSizing: "border-box" }} />
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button onClick={saveEvent} disabled={savingEvent} style={{ fontSize: "14px", fontWeight: 500, padding: "8px 16px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>{savingEvent ? "Saving..." : "Save"}</button>
                  <button onClick={() => setShowAddEvent(false)} style={{ fontSize: "14px", padding: "8px 16px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>Cancel</button>
                </div>
              </div>
            )}

            {loadingActivity ? (
              <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>Loading...</div>
            ) : activityEvents.length === 0 ? (
              <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>No activity yet.</div>
            ) : activityEvents.map((event) => {
              const typeConfig: Record<string, { label: string; color: string }> = {
                TECH_NOTE:           { label: "Tech note",    color: "#6366f1" },
                SITE_VISIT:          { label: "Site visit",   color: "#0ea5e9" },
                KNOWN_ISSUE:         { label: "Known issue",  color: "#f59e0b" },
                PLANNED_MAINTENANCE: { label: "Maintenance",  color: "#8b5cf6" },
                CREDENTIAL_ROTATED:  { label: "Credential",   color: "#10b981" },
                LICENSE_CHANGED:     { label: "License",      color: "#10b981" },
                ASSET_ADDED:         { label: "Asset added",  color: "#10b981" },
                ASSET_RETIRED:       { label: "Asset retired",color: "#94a3b8" },
                ASSET_UPDATED:       { label: "Asset update", color: "#94a3b8" },
                API_SYNC:            { label: "Sync",         color: "#94a3b8" },
                ALARM_TRIGGERED:     { label: "Alarm",        color: "#ef4444" },
                USER_ADDED:          { label: "User added",   color: "#10b981" },
                USER_REMOVED:        { label: "User removed", color: "#94a3b8" },
              }
              const cfg = typeConfig[event.eventType] ?? { label: event.eventType, color: "#94a3b8" }
              return (
                <div key={event.id} style={{
                  display: "flex", gap: "14px", marginBottom: "12px",
                  opacity: event.dismissedAt ? 0.5 : 1,
                }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: "4px" }}>
                    <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: cfg.color, flexShrink: 0 }} />
                    <div style={{ width: "1px", flex: 1, background: "var(--color-border-tertiary)", marginTop: "4px" }} />
                  </div>
                  <div style={{
                    flex: 1, background: event.isPinned ? "var(--color-background-secondary)" : "transparent",
                    border: event.isPinned ? "0.5px solid var(--color-border-secondary)" : "0.5px solid transparent",
                    borderRadius: "10px", padding: event.isPinned ? "12px 14px" : "0 0 12px 0",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "4px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "11px", fontWeight: 500, color: cfg.color, textTransform: "uppercase", letterSpacing: "0.04em" }}>{cfg.label}</span>
                        {event.isPinned && <span style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>pinned</span>}
                      </div>
                      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                        <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
                          {new Date(event.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                        <button onClick={() => togglePin(event.id, event.isPinned)} style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                          {event.isPinned ? "Unpin" : "Pin"}
                        </button>
                      </div>
                    </div>
                    <div style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-text-primary)", marginBottom: event.body ? "4px" : 0 }}>{event.title}</div>
                    {event.body && <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: "1.5", whiteSpace: "pre-wrap" }}>{event.body}</div>}
                    {event.staffUser && (
                      <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "6px" }}>
                        {event.staffUser.name ?? event.staffUser.email}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </AppShell>
  )
}
