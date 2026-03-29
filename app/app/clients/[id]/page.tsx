"use client"

import AppShell from "@/components/AppShell"
import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"

type ClientUser = {
  id: string
  name: string
  email: string | null
  phone: string | null
  m365Upn: string | null
  jobTitle: string | null
  isActive: boolean
}

type UserSummary = {
  assets: { id: string; name: string; status: string; make: string | null; model: string | null; assetType: { name: string } | null }[]
  credentials: { id: string; label: string; username: string | null; url: string | null }[]
  licenses: { id: string; name: string; vendor: string | null }[]
  applications: { id: string; name: string; vendor: string | null }[]
}

type ContactSummary = {
  assets: { id: string; name: string; status: string; make: string | null; model: string | null; assetType: { name: string } | null }[]
  credentials: { id: string; label: string; username: string | null; url: string | null }[]
  licenses: { id: string; name: string; vendor: string | null }[]
  applications: { id: string; name: string; vendor: string | null }[]
}

type Client = {
  id: string
  name: string
  type: "BUSINESS" | "RESIDENTIAL"
  notes: string | null
  isActive: boolean
  syncroId: string | null
  createdAt: string
  locations: { id: string; name: string; address: string | null; city: string | null; state: string | null }[]
  users: ClientUser[]
  contacts: { id: string; name: string; role: string | null; email: string | null; phone: string | null; mobile: string | null; notes: string | null; isPrimary: boolean; isBilling: boolean; isEscalation: boolean }[]
}

type Asset = {
  id: string
  name: string
  category: string
  assetTypeId: string | null
  assetType: { id: string; name: string } | null
  primaryUserId: string | null
  primaryUser: { id: string; name: string } | null
  contactId: string | null
  contact: { id: string; name: string } | null
  make: string | null
  model: string | null
  serial: string | null
  ipAddress: string | null
  macAddress: string | null
  status: string
  managementUrl: string | null
  warrantyExpiry: string | null
  notes: string | null
}

type AssetType = { id: string; name: string }

const tabs = ["Overview", "Locations", "Users", "Assets", "Contacts", "Credentials", "Licenses", "Applications", "Websites", "Activity"]

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
  const [credForm, setCredForm] = useState({ label: "", username: "", password: "", url: "", notes: "", userId: "", contactId: "" })
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
  const [licenseForm, setLicenseForm] = useState({ name: "", vendor: "", seats: "", expiryDate: "", renewalDate: "", cost: "", notes: "", assignedUserId: "", contactId: "" })
  const [savingLicense, setSavingLicense] = useState(false)
  const [editingLicense, setEditingLicense] = useState<string | null>(null)
  const [licenseEditForm, setLicenseEditForm] = useState<any>({})
  const [applications, setApplications] = useState<any[]>([])
  const [loadingApps, setLoadingApps] = useState(false)
  const [showAddApp, setShowAddApp] = useState(false)
  const [appForm, setAppForm] = useState({ name: "", vendor: "", version: "", supportUrl: "", notes: "", assignedUserId: "", contactId: "", vendorId: "" })
  const [savingApp, setSavingApp] = useState(false)
  const [editingApp, setEditingApp] = useState<string | null>(null)
  const [appEditForm, setAppEditForm] = useState<any>({})
  const [activityEvents, setActivityEvents] = useState<any[]>([])
  const [loadingActivity, setLoadingActivity] = useState(false)
  const [showAddEvent, setShowAddEvent] = useState(false)
  const [eventForm, setEventForm] = useState({ eventType: "TECH_NOTE", title: "", bodyText: "" })
  const [savingEvent, setSavingEvent] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [userSummary, setUserSummary] = useState<UserSummary | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [assetTypes, setAssetTypes] = useState<AssetType[]>([])
  const [showAddAsset, setShowAddAsset] = useState(false)
  const [assetForm, setAssetForm] = useState({ locationId: "", assetTypeId: "", name: "", make: "", model: "", serial: "", ipAddress: "", macAddress: "", managementUrl: "", purchaseDate: "", warrantyExpiry: "", primaryUserId: "", contactId: "", notes: "" })
  const [savingAsset, setSavingAsset] = useState(false)
  const [editingAsset, setEditingAsset] = useState<string | null>(null)
  const [assetEditForm, setAssetEditForm] = useState<any>({})
  const [savingAssetEdit, setSavingAssetEdit] = useState(false)
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)
  const [contactSummary, setContactSummary] = useState<ContactSummary | null>(null)
  const [loadingContactSummary, setLoadingContactSummary] = useState(false)
  const [showAddContact, setShowAddContact] = useState(false)
  const [contactForm, setContactForm] = useState({ name: "", role: "", email: "", phone: "", mobile: "", notes: "", isPrimary: false, isBilling: false, isEscalation: false })
  const [savingNewContact, setSavingNewContact] = useState(false)
  const [editingContactId, setEditingContactId] = useState<string | null>(null)
  const [contactEditForm, setContactEditForm] = useState<any>({})
  const [savingContact, setSavingContact] = useState(false)
  const [websites, setWebsites] = useState<any[]>([])
  const [loadingWebsites, setLoadingWebsites] = useState(false)
  const [showAddWebsite, setShowAddWebsite] = useState(false)
  const [websiteForm, setWebsiteForm] = useState({ domain: "", label: "" })
  const [savingWebsite, setSavingWebsite] = useState(false)
  const [checkingWebsite, setCheckingWebsite] = useState<string | null>(null)
  const [expandedDns, setExpandedDns] = useState<Record<string, boolean>>({})
  const [domainThreshold, setDomainThreshold] = useState(30)

  useEffect(() => {
    if (id) fetchClient()
  }, [id])

  useEffect(() => {
    if (activeTab === "Assets" && assets.length === 0) { fetchAssets(); if (assetTypes.length === 0) fetchAssetTypes() }
    if (activeTab === "Credentials" && credentials.length === 0) fetchCredentials()
    if (activeTab === "Licenses" && licenses.length === 0) fetchLicenses()
    if (activeTab === "Applications" && applications.length === 0) fetchApplications()
    if (activeTab === "Websites" && websites.length === 0) { fetchWebsites(); fetchDomainThreshold() }
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
        setCredForm({ label: "", username: "", password: "", url: "", notes: "", userId: "", contactId: "" })
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
        setLicenseForm({ name: "", vendor: "", seats: "", expiryDate: "", renewalDate: "", cost: "", notes: "", assignedUserId: "", contactId: "" })
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
        setAppForm({ name: "", vendor: "", version: "", supportUrl: "", notes: "", assignedUserId: "", contactId: "", vendorId: "" })
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

  async function selectUser(userId: string) {
    if (selectedUserId === userId) { setSelectedUserId(null); setUserSummary(null); return }
    setSelectedUserId(userId)
    setUserSummary(null)
    setLoadingSummary(true)
    try {
      const res = await fetch(`/api/clients/${id}/users/${userId}/summary`)
      setUserSummary(await res.json())
    } catch {}
    finally { setLoadingSummary(false) }
  }

  async function fetchAssetTypes() {
    try {
      const res = await fetch("/api/asset-types")
      setAssetTypes(await res.json())
    } catch {}
  }

  async function saveAsset() {
    if (!assetForm.locationId || !assetForm.name.trim()) return
    setSavingAsset(true)
    try {
      const res = await fetch(`/api/clients/${id}/assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(assetForm),
      })
      if (res.ok) {
        const newAsset = await res.json()
        setAssets(a => [...a, newAsset])
        setAssetForm({ locationId: "", assetTypeId: "", name: "", make: "", model: "", serial: "", ipAddress: "", macAddress: "", managementUrl: "", purchaseDate: "", warrantyExpiry: "", primaryUserId: "", contactId: "", notes: "" })
        setShowAddAsset(false)
      }
    } catch {}
    finally { setSavingAsset(false) }
  }

  async function updateAsset(assetId: string) {
    setSavingAssetEdit(true)
    try {
      const res = await fetch(`/api/assets/${assetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(assetEditForm),
      })
      if (res.ok) {
        const updated = await res.json()
        setAssets(a => a.map(x => x.id === assetId ? { ...x, ...updated } : x))
        setEditingAsset(null)
      }
    } catch {}
    finally { setSavingAssetEdit(false) }
  }

  async function selectContact(contactId: string) {
    if (selectedContactId === contactId) { setSelectedContactId(null); setContactSummary(null); return }
    setSelectedContactId(contactId)
    setContactSummary(null)
    setLoadingContactSummary(true)
    try {
      const res = await fetch(`/api/clients/${id}/contacts/${contactId}/summary`)
      setContactSummary(await res.json())
    } catch {}
    finally { setLoadingContactSummary(false) }
  }

  async function createContact() {
    if (!contactForm.name.trim()) return
    setSavingNewContact(true)
    try {
      const res = await fetch(`/api/clients/${id}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contactForm),
      })
      if (res.ok) {
        const newContact = await res.json()
        setClient(c => c ? { ...c, contacts: [...c.contacts, newContact] } : c)
        setContactForm({ name: "", role: "", email: "", phone: "", mobile: "", notes: "", isPrimary: false, isBilling: false, isEscalation: false })
        setShowAddContact(false)
      }
    } catch {}
    finally { setSavingNewContact(false) }
  }

  async function updateContact(contactId: string) {
    setSavingContact(true)
    try {
      const res = await fetch(`/api/clients/${id}/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contactEditForm),
      })
      if (res.ok) {
        const updated = await res.json()
        setClient(c => c ? { ...c, contacts: c.contacts.map(x => x.id === contactId ? { ...x, ...updated } : x) } : c)
        setEditingContactId(null)
      }
    } catch {}
    finally { setSavingContact(false) }
  }

  // Group assets by type (custom AssetType takes precedence over legacy category enum)
  const getTypeLabel = (asset: Asset) => asset.assetType?.name ?? categoryLabel[asset.category] ?? asset.category
  const getTypeKey = (asset: Asset) => asset.assetTypeId ?? asset.category

  const assetsByType = assets.reduce((acc, asset) => {
    const key = getTypeKey(asset)
    if (!acc[key]) acc[key] = []
    acc[key].push(asset)
    return acc
  }, {} as Record<string, Asset[]>)

  const typeKeys = Object.keys(assetsByType).sort((a, b) => {
    const labelA = assetsByType[a][0] ? getTypeLabel(assetsByType[a][0]) : a
    const labelB = assetsByType[b][0] ? getTypeLabel(assetsByType[b][0]) : b
    return labelA.localeCompare(labelB)
  })

  if (loadingClient) return (
    <AppShell>
      <div style={{ padding: "32px", color: "var(--color-text-secondary)", fontSize: "14px" }}>Loading...</div>
    </AppShell>
  )

  async function fetchWebsites() {
    setLoadingWebsites(true)
    try {
      const res = await fetch(`/api/clients/${id}/websites`)
      setWebsites(await res.json())
    } catch {}
    finally { setLoadingWebsites(false) }
  }

  async function fetchDomainThreshold() {
    try {
      const res = await fetch("/api/settings/domain-threshold")
      const data = await res.json()
      setDomainThreshold(data.days)
    } catch {}
  }

  async function addWebsite() {
    if (!websiteForm.domain.trim()) return
    setSavingWebsite(true)
    try {
      const res = await fetch(`/api/clients/${id}/websites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(websiteForm),
      })
      if (res.ok) {
        const site = await res.json()
        setWebsites(w => [...w, site])
        setWebsiteForm({ domain: "", label: "" })
        setShowAddWebsite(false)
      }
    } catch {}
    finally { setSavingWebsite(false) }
  }

  async function deleteWebsite(websiteId: string) {
    if (!confirm("Remove this website?")) return
    try {
      await fetch(`/api/clients/${id}/websites/${websiteId}`, { method: "DELETE" })
      setWebsites(w => w.filter(s => s.id !== websiteId))
    } catch {}
  }

  async function checkWebsite(websiteId: string) {
    setCheckingWebsite(websiteId)
    try {
      const res = await fetch(`/api/clients/${id}/websites/${websiteId}/check`, { method: "POST" })
      if (res.ok) {
        const updated = await res.json()
        setWebsites(w => w.map(s => s.id === websiteId ? updated : s))
      }
    } catch {}
    finally { setCheckingWebsite(null) }
  }

  function expiryBadge(expiresAt: string | null) {
    if (!expiresAt) return { label: "Not checked", color: "var(--color-text-muted)", bg: "var(--color-background-hover)" }
    const days = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 86400000)
    if (days < 0) return { label: "Expired", color: "var(--color-text-danger)", bg: "var(--color-background-danger)" }
    if (days <= 7) return { label: `${days}d left`, color: "var(--color-text-danger)", bg: "var(--color-background-danger)" }
    if (days <= domainThreshold) return { label: `${days}d left`, color: "var(--color-text-warning)", bg: "var(--color-background-warning)" }
    return { label: `${days}d left`, color: "var(--color-text-success)", bg: "var(--color-background-success)" }
  }

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
          <div style={{ display: "flex", gap: "20px", alignItems: "flex-start" }}>
            {/* User list */}
            <div style={{ width: "240px", flexShrink: 0 }}>
              {client.users.length === 0 ? (
                <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>No users yet.</div>
              ) : client.users.map((user) => (
                <div key={user.id} onClick={() => selectUser(user.id)} style={{
                  background: selectedUserId === user.id ? "var(--color-background-secondary)" : "transparent",
                  border: selectedUserId === user.id ? "0.5px solid var(--color-border-secondary)" : "0.5px solid transparent",
                  borderLeft: selectedUserId === user.id ? "2px solid var(--color-text-primary)" : "2px solid transparent",
                  borderRadius: "8px", padding: "10px 12px", marginBottom: "6px",
                  cursor: "pointer",
                }}
                  onMouseEnter={e => { if (selectedUserId !== user.id) e.currentTarget.style.background = "var(--color-background-secondary)" }}
                  onMouseLeave={e => { if (selectedUserId !== user.id) e.currentTarget.style.background = "transparent" }}
                >
                  <div style={{ fontSize: "14px", fontWeight: selectedUserId === user.id ? 500 : 400 }}>{user.name}</div>
                  {user.jobTitle && <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "1px" }}>{user.jobTitle}</div>}
                  {user.email && <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "1px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email}</div>}
                </div>
              ))}
            </div>

            {/* Context panel */}
            {selectedUserId && (() => {
              const user = client.users.find(u => u.id === selectedUserId)!
              return (
                <div style={{ flex: 1, minWidth: 0, position: "sticky", top: "32px" }}>
                  {/* User header */}
                  <div style={{ background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "10px", padding: "16px 20px", marginBottom: "12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontSize: "16px", fontWeight: 500 }}>{user.name}</div>
                        {user.jobTitle && <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginTop: "2px" }}>{user.jobTitle}</div>}
                      </div>
                      <button onClick={() => { setSelectedUserId(null); setUserSummary(null) }} style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: "2px" }}>✕</button>
                    </div>
                    {(user.email || user.phone || user.m365Upn) && (
                      <div style={{ marginTop: "10px", display: "flex", flexWrap: "wrap", gap: "12px" }}>
                        {user.email && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{user.email}</span>}
                        {user.phone && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{user.phone}</span>}
                        {user.m365Upn && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)", fontFamily: "monospace" }}>{user.m365Upn}</span>}
                      </div>
                    )}
                  </div>

                  {loadingSummary ? (
                    <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", padding: "12px 0" }}>Loading...</div>
                  ) : userSummary && (() => {
                    const sections = [
                      {
                        label: "Devices", count: userSummary.assets.length,
                        items: userSummary.assets.map(a => ({
                          primary: a.name,
                          secondary: [a.assetType?.name, [a.make, a.model].filter(Boolean).join(" ")].filter(Boolean).join(" · "),
                          badge: a.status !== "ACTIVE" ? a.status.charAt(0) + a.status.slice(1).toLowerCase() : null,
                          onClick: () => { setActiveTab("Assets"); if (assets.length === 0) fetchAssets() },
                        })),
                      },
                      {
                        label: "Credentials", count: userSummary.credentials.length,
                        items: userSummary.credentials.map(c => ({
                          primary: c.label,
                          secondary: c.username ?? null,
                          badge: null,
                          onClick: () => setActiveTab("Credentials"),
                        })),
                      },
                      {
                        label: "Licenses", count: userSummary.licenses.length,
                        items: userSummary.licenses.map(l => ({
                          primary: l.name,
                          secondary: l.vendor ?? null,
                          badge: null,
                          onClick: () => setActiveTab("Licenses"),
                        })),
                      },
                      {
                        label: "Applications", count: userSummary.applications.length,
                        items: userSummary.applications.map(a => ({
                          primary: a.name,
                          secondary: a.vendor ?? null,
                          badge: null,
                          onClick: () => setActiveTab("Applications"),
                        })),
                      },
                    ]
                    return (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                        {sections.map(section => (
                          <div key={section.label} style={{ background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "10px", overflow: "hidden" }}>
                            <div style={{ padding: "10px 14px", borderBottom: "0.5px solid var(--color-border-tertiary)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{section.label}</span>
                              <span style={{ fontSize: "12px", fontWeight: 500, color: section.count > 0 ? "var(--color-text-primary)" : "var(--color-text-secondary)", background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "10px", padding: "1px 7px" }}>{section.count}</span>
                            </div>
                            {section.items.length === 0 ? (
                              <div style={{ padding: "10px 14px", fontSize: "12px", color: "var(--color-text-secondary)" }}>None</div>
                            ) : section.items.map((item, i) => (
                              <div key={i} onClick={item.onClick} style={{ padding: "8px 14px", borderBottom: i < section.items.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                                onMouseEnter={e => (e.currentTarget.style.background = "var(--color-background-primary)")}
                                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                              >
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontSize: "13px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.primary}</div>
                                  {item.secondary && <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", marginTop: "1px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.secondary}</div>}
                                </div>
                                {item.badge && <span style={{ fontSize: "10px", color: "var(--color-text-secondary)", background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: "4px", padding: "1px 5px", marginLeft: "8px", flexShrink: 0 }}>{item.badge}</span>}
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>
              )
            })()}
          </div>
        )}

        {activeTab === "Assets" && (
          <div style={{ maxWidth: "960px" }}>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px" }}>
              <button onClick={() => { setShowAddAsset(true); if (assetTypes.length === 0) fetchAssetTypes() }} style={{ fontSize: "14px", fontWeight: 500, padding: "8px 16px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: "pointer" }}>
                New asset
              </button>
            </div>

            {showAddAsset && (
              <div style={{ background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: "10px", padding: "20px", marginBottom: "20px" }}>
                <div style={{ fontSize: "15px", fontWeight: 500, marginBottom: "16px" }}>New asset</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                  <div>
                    <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>Location *</label>
                    <select value={assetForm.locationId} onChange={e => setAssetForm(f => ({ ...f, locationId: e.target.value }))} style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }}>
                      <option value="">Select location...</option>
                      {client.locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>Type</label>
                    <select value={assetForm.assetTypeId} onChange={e => setAssetForm(f => ({ ...f, assetTypeId: e.target.value }))} style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }}>
                      <option value="">Select type...</option>
                      {assetTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>Name *</label>
                    <input value={assetForm.name} onChange={e => setAssetForm(f => ({ ...f, name: e.target.value }))} style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }} placeholder="e.g. HP LaserJet Pro M404dn" />
                  </div>
                  {[
                    { key: "make", label: "Make", placeholder: "e.g. HP" },
                    { key: "model", label: "Model", placeholder: "e.g. LaserJet Pro M404dn" },
                    { key: "serial", label: "Serial", placeholder: "" },
                    { key: "ipAddress", label: "IP Address", placeholder: "" },
                    { key: "macAddress", label: "MAC Address", placeholder: "" },
                    { key: "managementUrl", label: "Management URL", placeholder: "https://" },
                    { key: "purchaseDate", label: "Purchase Date", type: "date", placeholder: "" },
                    { key: "warrantyExpiry", label: "Warranty Expiry", type: "date", placeholder: "" },
                  ].map(({ key, label, placeholder, type }) => (
                    <div key={key}>
                      <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>{label}</label>
                      <input type={type ?? "text"} value={assetForm[key as keyof typeof assetForm]} onChange={e => setAssetForm(f => ({ ...f, [key]: e.target.value }))} placeholder={placeholder}
                        style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }} />
                    </div>
                  ))}
                  <div>
                    <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>Primary User</label>
                    <select value={assetForm.primaryUserId} onChange={e => setAssetForm(f => ({ ...f, primaryUserId: e.target.value }))} style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }}>
                      <option value="">Unassigned</option>
                      {client.users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>Contact</label>
                    <select value={assetForm.contactId} onChange={e => setAssetForm(f => ({ ...f, contactId: e.target.value }))} style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }}>
                      <option value="">None</option>
                      {client.contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>Notes</label>
                    <textarea rows={2} value={assetForm.notes} onChange={e => setAssetForm(f => ({ ...f, notes: e.target.value }))} style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", resize: "vertical", boxSizing: "border-box" as const }} />
                  </div>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button onClick={saveAsset} disabled={savingAsset} style={{ fontSize: "14px", fontWeight: 500, padding: "8px 16px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>
                    {savingAsset ? "Saving..." : "Create asset"}
                  </button>
                  <button onClick={() => setShowAddAsset(false)} style={{ fontSize: "14px", padding: "8px 16px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>Cancel</button>
                </div>
              </div>
            )}

            {loadingAssets ? (
              <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>Loading assets...</div>
            ) : assets.length === 0 && !showAddAsset ? (
              <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>No assets found.</div>
            ) : (
              typeKeys.map(key => (
                <div key={key} style={{ marginBottom: "24px" }}>
                  <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {getTypeLabel(assetsByType[key][0])} ({assetsByType[key].length})
                  </div>
                  <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "10px", overflow: "hidden" }}>
                    <div style={{
                      display: "grid", gridTemplateColumns: "1fr 160px 120px 120px 80px 60px",
                      padding: "8px 16px", background: "var(--color-background-secondary)",
                      borderBottom: "0.5px solid var(--color-border-tertiary)",
                    }}>
                      {["Name", "Make / Model", "Serial", "User", "Status", ""].map(h => (
                        <div key={h} style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-secondary)" }}>{h}</div>
                      ))}
                    </div>
                    {assetsByType[key].map((asset, i) => editingAsset === asset.id ? (
                      <div key={asset.id} style={{ padding: "14px 16px", borderBottom: i < assetsByType[key].length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none", background: "var(--color-background-primary)" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
                          {[
                            { key: "name", label: "Name" }, { key: "make", label: "Make" },
                            { key: "model", label: "Model" }, { key: "serial", label: "Serial" },
                            { key: "ipAddress", label: "IP Address" }, { key: "macAddress", label: "MAC Address" },
                            { key: "managementUrl", label: "Management URL" }, { key: "notes", label: "Notes" },
                          ].map(({ key, label }) => (
                            <div key={key} style={key === "notes" || key === "managementUrl" ? { gridColumn: "1 / -1" } : {}}>
                              <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>{label}</label>
                              <input value={assetEditForm[key] ?? ""} onChange={e => setAssetEditForm((f: any) => ({ ...f, [key]: e.target.value }))}
                                style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }} />
                            </div>
                          ))}
                          <div>
                            <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>Type</label>
                            <select value={assetEditForm.assetTypeId ?? ""} onChange={e => setAssetEditForm((f: any) => ({ ...f, assetTypeId: e.target.value }))} style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }}>
                              <option value="">No type</option>
                              {assetTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>Status</label>
                            <select value={assetEditForm.status ?? "ACTIVE"} onChange={e => setAssetEditForm((f: any) => ({ ...f, status: e.target.value }))} style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }}>
                              <option value="ACTIVE">Active</option>
                              <option value="RETIRING">Retiring</option>
                              <option value="SUNSET">Sunset</option>
                            </select>
                          </div>
                          <div>
                            <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>Primary User</label>
                            <select value={assetEditForm.primaryUserId ?? ""} onChange={e => setAssetEditForm((f: any) => ({ ...f, primaryUserId: e.target.value }))} style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }}>
                              <option value="">Unassigned</option>
                              {client.users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>Contact</label>
                            <select value={assetEditForm.contactId ?? ""} onChange={e => setAssetEditForm((f: any) => ({ ...f, contactId: e.target.value }))} style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }}>
                              <option value="">None</option>
                              {client.contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: "8px" }}>
                          <button onClick={() => updateAsset(asset.id)} disabled={savingAssetEdit} style={{ fontSize: "13px", fontWeight: 500, padding: "6px 14px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>{savingAssetEdit ? "Saving..." : "Save"}</button>
                          <button onClick={() => setEditingAsset(null)} style={{ fontSize: "13px", padding: "6px 14px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div key={asset.id} style={{
                        display: "grid", gridTemplateColumns: "1fr 160px 120px 120px 80px 60px",
                        padding: "10px 16px", background: "var(--color-background-primary)",
                        borderBottom: i < assetsByType[key].length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none",
                        alignItems: "center",
                      }}>
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
                        <div>
                          {asset.primaryUser ? (
                            <span
                              onClick={() => { setActiveTab("Users"); selectUser(asset.primaryUser!.id) }}
                              style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: "5px", padding: "2px 7px", cursor: "pointer", display: "inline-block" }}
                            >
                              {asset.primaryUser.name}
                            </span>
                          ) : <span style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>—</span>}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: statusColor[asset.status] ?? "#94a3b8", flexShrink: 0 }} />
                          <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
                            {asset.status.charAt(0) + asset.status.slice(1).toLowerCase()}
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: "8px" }}>
                          <button onClick={() => { setEditingAsset(asset.id); if (assetTypes.length === 0) fetchAssetTypes(); setAssetEditForm({ name: asset.name, make: asset.make ?? "", model: asset.model ?? "", serial: asset.serial ?? "", ipAddress: asset.ipAddress ?? "", macAddress: asset.macAddress ?? "", managementUrl: asset.managementUrl ?? "", notes: asset.notes ?? "", assetTypeId: asset.assetTypeId ?? "", status: asset.status, primaryUserId: asset.primaryUserId ?? "", contactId: asset.contactId ?? "" }) }} style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Edit</button>
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
          <div style={{ display: "flex", gap: "20px", alignItems: "flex-start" }}>
            {/* Contact list */}
            <div style={{ width: "260px", flexShrink: 0 }}>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "10px" }}>
                <button onClick={() => setShowAddContact(v => !v)} style={{ fontSize: "13px", fontWeight: 500, padding: "6px 12px", borderRadius: "7px", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: "pointer" }}>
                  {showAddContact ? "Cancel" : "Add contact"}
                </button>
              </div>
              {showAddContact && (
                <div style={{ background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: "10px", padding: "16px", marginBottom: "12px" }}>
                  <div style={{ fontSize: "14px", fontWeight: 500, marginBottom: "12px" }}>New contact</div>
                  {[
                    { key: "name", label: "Name *", placeholder: "" },
                    { key: "role", label: "Role", placeholder: "e.g. IT Manager" },
                    { key: "email", label: "Email", placeholder: "" },
                    { key: "phone", label: "Phone", placeholder: "" },
                    { key: "mobile", label: "Mobile", placeholder: "" },
                    { key: "notes", label: "Notes", placeholder: "" },
                  ].map(({ key, label, placeholder }) => (
                    <div key={key} style={{ marginBottom: "8px" }}>
                      <label style={{ fontSize: "12px", color: "var(--color-text-secondary)", display: "block", marginBottom: "3px" }}>{label}</label>
                      <input value={(contactForm as any)[key]} onChange={e => setContactForm(f => ({ ...f, [key]: e.target.value }))} placeholder={placeholder}
                        style={{ width: "100%", padding: "6px 10px", fontSize: "13px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "7px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }} />
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: "12px", marginBottom: "10px", marginTop: "4px" }}>
                    {[["isPrimary", "Primary"], ["isBilling", "Billing"], ["isEscalation", "Escalation"]].map(([key, label]) => (
                      <label key={key} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", cursor: "pointer" }}>
                        <input type="checkbox" checked={(contactForm as any)[key]} onChange={e => setContactForm(f => ({ ...f, [key]: e.target.checked }))} />
                        {label}
                      </label>
                    ))}
                  </div>
                  <button onClick={createContact} disabled={savingNewContact} style={{ fontSize: "13px", fontWeight: 500, padding: "6px 14px", borderRadius: "7px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>
                    {savingNewContact ? "Saving..." : "Create"}
                  </button>
                </div>
              )}
              {client.contacts.length === 0 && !showAddContact ? (
                <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>No contacts yet.</div>
              ) : client.contacts.map((contact) => (
                <div key={contact.id} onClick={() => { setEditingContactId(null); selectContact(contact.id) }} style={{
                  background: selectedContactId === contact.id ? "var(--color-background-secondary)" : "transparent",
                  border: selectedContactId === contact.id ? "0.5px solid var(--color-border-secondary)" : "0.5px solid transparent",
                  borderLeft: selectedContactId === contact.id ? "2px solid var(--color-text-primary)" : "2px solid transparent",
                  borderRadius: "8px", padding: "10px 12px", marginBottom: "6px", cursor: "pointer",
                }}
                  onMouseEnter={e => { if (selectedContactId !== contact.id) e.currentTarget.style.background = "var(--color-background-secondary)" }}
                  onMouseLeave={e => { if (selectedContactId !== contact.id) e.currentTarget.style.background = "transparent" }}
                >
                  <div style={{ fontSize: "14px", fontWeight: selectedContactId === contact.id ? 500 : 400 }}>{contact.name}</div>
                  {contact.role && <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "1px" }}>{contact.role}</div>}
                  <div style={{ display: "flex", gap: "4px", marginTop: "4px", flexWrap: "wrap" }}>
                    {contact.isPrimary && <span style={{ fontSize: "10px", padding: "1px 5px", borderRadius: "4px", background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-secondary)", color: "var(--color-text-secondary)" }}>Primary</span>}
                    {contact.isBilling && <span style={{ fontSize: "10px", padding: "1px 5px", borderRadius: "4px", background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-secondary)", color: "var(--color-text-secondary)" }}>Billing</span>}
                    {contact.isEscalation && <span style={{ fontSize: "10px", padding: "1px 5px", borderRadius: "4px", background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-secondary)", color: "var(--color-text-secondary)" }}>Escalation</span>}
                  </div>
                </div>
              ))}
            </div>

            {/* Contact context panel */}
            {selectedContactId && (() => {
              const contact = client.contacts.find(c => c.id === selectedContactId)!
              return (
                <div style={{ flex: 1, minWidth: 0, position: "sticky", top: "32px" }}>
                  <div style={{ background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "10px", padding: "16px 20px", marginBottom: "12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontSize: "16px", fontWeight: 500 }}>{contact.name}</div>
                        {contact.role && <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginTop: "2px" }}>{contact.role}</div>}
                      </div>
                      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                        <button onClick={() => { setEditingContactId(contact.id); setContactEditForm({ name: contact.name, role: contact.role ?? "", email: contact.email ?? "", phone: contact.phone ?? "", mobile: contact.mobile ?? "", notes: contact.notes ?? "", isPrimary: contact.isPrimary, isBilling: contact.isBilling, isEscalation: contact.isEscalation }) }} style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Edit</button>
                        <button onClick={() => { setSelectedContactId(null); setContactSummary(null) }} style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>✕</button>
                      </div>
                    </div>
                    {(contact.email || contact.phone || contact.mobile) && (
                      <div style={{ marginTop: "10px", display: "flex", flexWrap: "wrap", gap: "12px" }}>
                        {contact.email && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{contact.email}</span>}
                        {contact.phone && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{contact.phone}</span>}
                        {contact.mobile && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{contact.mobile}</span>}
                      </div>
                    )}
                    {contact.notes && <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "8px", borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: "8px" }}>{contact.notes}</div>}
                  </div>

                  {editingContactId === contact.id && (
                    <div style={{ background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: "10px", padding: "16px 20px", marginBottom: "12px" }}>
                      <div style={{ fontSize: "14px", fontWeight: 500, marginBottom: "12px" }}>Edit contact</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
                        {[
                          { key: "name", label: "Name" }, { key: "role", label: "Role" },
                          { key: "email", label: "Email" }, { key: "phone", label: "Phone" },
                          { key: "mobile", label: "Mobile" }, { key: "notes", label: "Notes" },
                        ].map(({ key, label }) => (
                          <div key={key} style={key === "notes" ? { gridColumn: "1 / -1" } : {}}>
                            <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>{label}</label>
                            <input value={contactEditForm[key] ?? ""} onChange={e => setContactEditForm((f: any) => ({ ...f, [key]: e.target.value }))}
                              style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }} />
                          </div>
                        ))}
                        <div style={{ gridColumn: "1 / -1", display: "flex", gap: "16px" }}>
                          {[["isPrimary", "Primary"], ["isBilling", "Billing"], ["isEscalation", "Escalation"]].map(([key, label]) => (
                            <label key={key} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", cursor: "pointer" }}>
                              <input type="checkbox" checked={!!contactEditForm[key]} onChange={e => setContactEditForm((f: any) => ({ ...f, [key]: e.target.checked }))} />
                              {label}
                            </label>
                          ))}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button onClick={() => updateContact(contact.id)} disabled={savingContact} style={{ fontSize: "13px", fontWeight: 500, padding: "6px 14px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>{savingContact ? "Saving..." : "Save"}</button>
                        <button onClick={() => setEditingContactId(null)} style={{ fontSize: "13px", padding: "6px 14px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>Cancel</button>
                      </div>
                    </div>
                  )}

                  {loadingContactSummary ? (
                    <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", padding: "12px 0" }}>Loading...</div>
                  ) : contactSummary && (() => {
                    const sections = [
                      {
                        label: "Devices", count: contactSummary.assets.length,
                        items: contactSummary.assets.map(a => ({
                          primary: a.name,
                          secondary: [a.assetType?.name, [a.make, a.model].filter(Boolean).join(" ")].filter(Boolean).join(" · "),
                          onClick: () => { setActiveTab("Assets"); if (assets.length === 0) fetchAssets() },
                        })),
                      },
                      {
                        label: "Credentials", count: contactSummary.credentials.length,
                        items: contactSummary.credentials.map(c => ({
                          primary: c.label,
                          secondary: c.username ?? null,
                          onClick: () => setActiveTab("Credentials"),
                        })),
                      },
                      {
                        label: "Licenses", count: contactSummary.licenses.length,
                        items: contactSummary.licenses.map(l => ({
                          primary: l.name,
                          secondary: l.vendor ?? null,
                          onClick: () => setActiveTab("Licenses"),
                        })),
                      },
                      {
                        label: "Applications", count: contactSummary.applications.length,
                        items: contactSummary.applications.map(a => ({
                          primary: a.name,
                          secondary: a.vendor ?? null,
                          onClick: () => setActiveTab("Applications"),
                        })),
                      },
                    ]
                    return (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                        {sections.map(section => (
                          <div key={section.label} style={{ background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "10px", overflow: "hidden" }}>
                            <div style={{ padding: "10px 14px", borderBottom: "0.5px solid var(--color-border-tertiary)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{section.label}</span>
                              <span style={{ fontSize: "12px", fontWeight: 500, color: section.count > 0 ? "var(--color-text-primary)" : "var(--color-text-secondary)", background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "10px", padding: "1px 7px" }}>{section.count}</span>
                            </div>
                            {section.items.length === 0 ? (
                              <div style={{ padding: "10px 14px", fontSize: "12px", color: "var(--color-text-secondary)" }}>None</div>
                            ) : section.items.map((item, i) => (
                              <div key={i} onClick={item.onClick} style={{ padding: "8px 14px", borderBottom: i < section.items.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none", cursor: "pointer", display: "flex", alignItems: "center" }}
                                onMouseEnter={e => (e.currentTarget.style.background = "var(--color-background-primary)")}
                                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                              >
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontSize: "13px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.primary}</div>
                                  {item.secondary && <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", marginTop: "1px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.secondary}</div>}
                                </div>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>
              )
            })()}
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
                {client.users.length > 0 && (
                  <div style={{ marginBottom: "12px" }}>
                    <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>Link to user</label>
                    <select value={credForm.userId} onChange={e => setCredForm(f => ({ ...f, userId: e.target.value }))} style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}>
                      <option value="">None</option>
                      {client.users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </div>
                )}
                {client.contacts.length > 0 && (
                  <div style={{ marginBottom: "12px" }}>
                    <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>Link to contact</label>
                    <select value={credForm.contactId} onChange={e => setCredForm(f => ({ ...f, contactId: e.target.value }))} style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}>
                      <option value="">None</option>
                      {client.contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                )}
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
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ fontSize: "14px", fontWeight: 500 }}>{cred.label}</div>
                    {cred.user && (
                      <span onClick={() => { setActiveTab("Users"); selectUser(cred.user.id) }} style={{ fontSize: "11px", color: "var(--color-text-secondary)", background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: "4px", padding: "1px 6px", cursor: "pointer" }}>
                        {cred.user.name}
                      </span>
                    )}
                  </div>
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
                  <div>
                    <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>Assigned User</label>
                    <select value={licenseForm.assignedUserId} onChange={e => setLicenseForm(f => ({ ...f, assignedUserId: e.target.value }))} style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }}>
                      <option value="">Unassigned</option>
                      {client.users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>Contact</label>
                    <select value={licenseForm.contactId} onChange={e => setLicenseForm(f => ({ ...f, contactId: e.target.value }))} style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }}>
                      <option value="">None</option>
                      {client.contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
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
                <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 60px 120px 120px 120px 80px", padding: "10px 16px", background: "var(--color-background-secondary)", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                  {["Name", "Vendor", "Seats", "Expiry", "Renewal", "User", ""].map(h => (
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
                      <div>
                        <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>Assigned User</label>
                        <select value={licenseEditForm.assignedUserId ?? ""} onChange={e => setLicenseEditForm((f: any) => ({ ...f, assignedUserId: e.target.value }))} style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }}>
                          <option value="">Unassigned</option>
                          {client.users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>Contact</label>
                        <select value={licenseEditForm.contactId ?? ""} onChange={e => setLicenseEditForm((f: any) => ({ ...f, contactId: e.target.value }))} style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }}>
                          <option value="">None</option>
                          {client.contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button onClick={() => updateLicense(lic.id)} style={{ fontSize: "13px", fontWeight: 500, padding: "6px 14px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>Save</button>
                      <button onClick={() => setEditingLicense(null)} style={{ fontSize: "13px", padding: "6px 14px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div key={lic.id} style={{ display: "grid", gridTemplateColumns: "1fr 120px 60px 120px 120px 120px 80px", padding: "12px 16px", borderBottom: i < licenses.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none", background: "var(--color-background-primary)", alignItems: "center" }}>
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
                    <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>{lic.assignedUser?.name ?? "—"}</div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button onClick={() => { setEditingLicense(lic.id); setLicenseEditForm({ ...lic, expiryDate: lic.expiryDate ? lic.expiryDate.slice(0, 10) : "", renewalDate: lic.renewalDate ? lic.renewalDate.slice(0, 10) : "", assignedUserId: lic.assignedUser?.id ?? "", contactId: lic.contact?.id ?? "" }) }} style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Edit</button>
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
                  <div>
                    <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>Assigned User</label>
                    <select value={appForm.assignedUserId} onChange={e => setAppForm(f => ({ ...f, assignedUserId: e.target.value }))} style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }}>
                      <option value="">Unassigned</option>
                      {client.users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>Contact</label>
                    <select value={appForm.contactId} onChange={e => setAppForm(f => ({ ...f, contactId: e.target.value }))} style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }}>
                      <option value="">None</option>
                      {client.contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
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
                <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 100px 140px 80px", padding: "10px 16px", background: "var(--color-background-secondary)", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                  {["Name", "Vendor", "Version", "User", ""].map(h => (
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
                      <div>
                        <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>Assigned User</label>
                        <select value={appEditForm.assignedUserId ?? ""} onChange={e => setAppEditForm((f: any) => ({ ...f, assignedUserId: e.target.value }))} style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }}>
                          <option value="">Unassigned</option>
                          {client.users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>Contact</label>
                        <select value={appEditForm.contactId ?? ""} onChange={e => setAppEditForm((f: any) => ({ ...f, contactId: e.target.value }))} style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }}>
                          <option value="">None</option>
                          {client.contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button onClick={() => updateApp(app.id)} style={{ fontSize: "13px", fontWeight: 500, padding: "6px 14px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>Save</button>
                      <button onClick={() => setEditingApp(null)} style={{ fontSize: "13px", padding: "6px 14px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div key={app.id} style={{ display: "grid", gridTemplateColumns: "1fr 140px 100px 140px 80px", padding: "12px 16px", borderBottom: i < applications.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none", background: "var(--color-background-primary)", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: "14px", fontWeight: 500 }}>{app.name}</div>
                      {app.notes && <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "2px" }}>{app.notes}</div>}
                    </div>
                    <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>{app.vendor ?? "—"}</div>
                    <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", fontFamily: "monospace" }}>{app.version ?? "—"}</div>
                    <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>{app.assignedUser?.name ?? "—"}</div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button onClick={() => { setEditingApp(app.id); setAppEditForm({ ...app, assignedUserId: app.assignedUser?.id ?? "", contactId: app.contact?.id ?? "" }) }} style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Edit</button>
                      <button onClick={() => deleteApp(app.id)} style={{ fontSize: "12px", color: "var(--color-text-danger)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "Websites" && (
          <div style={{ maxWidth: "860px" }}>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px" }}>
              <button onClick={() => setShowAddWebsite(true)} style={{ fontSize: "14px", fontWeight: 500, padding: "8px 16px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: "pointer", color: "var(--color-text-primary)" }}>
                Add website
              </button>
            </div>

            {showAddWebsite && (
              <div style={{ background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: "10px", padding: "20px", marginBottom: "16px" }}>
                <div style={{ fontSize: "15px", fontWeight: 500, marginBottom: "16px" }}>New website</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                  <div>
                    <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>Domain *</label>
                    <input value={websiteForm.domain} onChange={e => setWebsiteForm(f => ({ ...f, domain: e.target.value }))} placeholder="example.com" autoFocus
                      style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>Label</label>
                    <input value={websiteForm.label} onChange={e => setWebsiteForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. Main site"
                      style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" }} />
                  </div>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button onClick={addWebsite} disabled={savingWebsite} style={{ fontSize: "14px", fontWeight: 500, padding: "8px 16px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>
                    {savingWebsite ? "Saving..." : "Add"}
                  </button>
                  <button onClick={() => setShowAddWebsite(false)} style={{ fontSize: "14px", padding: "8px 16px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>Cancel</button>
                </div>
              </div>
            )}

            {loadingWebsites ? (
              <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>Loading...</div>
            ) : websites.length === 0 && !showAddWebsite ? (
              <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>No websites yet. Add a domain to start monitoring expiry and DNS.</div>
            ) : (
              <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "10px", overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 160px 130px 130px", padding: "10px 16px", background: "var(--color-background-secondary)", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                  {["Domain", "Expiry", "Registrar", "Last checked", ""].map(h => (
                    <div key={h} style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-secondary)" }}>{h}</div>
                  ))}
                </div>
                {websites.map((site, i) => {
                  const badge = expiryBadge(site.expiresAt)
                  const dns = site.dnsRecords as Record<string, any> | null
                  const dnsOpen = expandedDns[site.id]
                  const isChecking = checkingWebsite === site.id
                  const borderBottom = i < websites.length - 1 || dnsOpen ? "0.5px solid var(--color-border-tertiary)" : "none"
                  return (
                    <div key={site.id}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 160px 130px 130px", padding: "12px 16px", borderBottom, background: "var(--color-background-primary)", alignItems: "center" }}>
                        <div>
                          <div style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-text-primary)" }}>{site.domain}</div>
                          {site.label && <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "2px" }}>{site.label}</div>}
                        </div>
                        <div>
                          <span style={{ fontSize: "12px", padding: "3px 8px", borderRadius: "6px", background: badge.bg, color: badge.color, fontWeight: 500 }}>
                            {badge.label}
                          </span>
                          {site.expiresAt && (
                            <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "4px" }}>
                              {new Date(site.expiresAt).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                        <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>{site.registrar ?? "—"}</div>
                        <div style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
                          {site.lastChecked ? new Date(site.lastChecked).toLocaleDateString() : "Never"}
                        </div>
                        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                          <button onClick={() => checkWebsite(site.id)} disabled={isChecking} style={{ fontSize: "12px", color: "var(--color-accent)", background: "none", border: "none", cursor: isChecking ? "not-allowed" : "pointer", padding: 0, opacity: isChecking ? 0.5 : 1 }}>
                            {isChecking ? "Checking..." : "Check"}
                          </button>
                          {dns && (
                            <button onClick={() => setExpandedDns(d => ({ ...d, [site.id]: !d[site.id] }))} style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                              DNS {dnsOpen ? "▲" : "▼"}
                            </button>
                          )}
                          <button onClick={() => deleteWebsite(site.id)} style={{ fontSize: "12px", color: "var(--color-text-danger)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Remove</button>
                        </div>
                      </div>
                      {dnsOpen && dns && (
                        <div style={{ padding: "12px 16px", background: "var(--color-background-secondary)", borderBottom: i < websites.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "60px 1fr", gap: "6px 12px", fontSize: "13px" }}>
                            {dns.A && <><div style={{ color: "var(--color-text-muted)", fontWeight: 500 }}>A</div><div style={{ color: "var(--color-text-primary)", fontFamily: "monospace" }}>{dns.A.join(", ")}</div></>}
                            {dns.AAAA && <><div style={{ color: "var(--color-text-muted)", fontWeight: 500 }}>AAAA</div><div style={{ color: "var(--color-text-primary)", fontFamily: "monospace" }}>{dns.AAAA.join(", ")}</div></>}
                            {dns.MX && <><div style={{ color: "var(--color-text-muted)", fontWeight: 500 }}>MX</div><div style={{ color: "var(--color-text-primary)", fontFamily: "monospace" }}>{dns.MX.map((r: any) => `${r.exchange} (${r.priority})`).join(", ")}</div></>}
                            {dns.NS && <><div style={{ color: "var(--color-text-muted)", fontWeight: 500 }}>NS</div><div style={{ color: "var(--color-text-primary)", fontFamily: "monospace" }}>{dns.NS.join(", ")}</div></>}
                            {dns.TXT && <><div style={{ color: "var(--color-text-muted)", fontWeight: 500 }}>TXT</div><div style={{ color: "var(--color-text-primary)", fontFamily: "monospace", wordBreak: "break-all" }}>{dns.TXT.join(" · ")}</div></>}
                            {Object.keys(dns).length === 0 && <div style={{ gridColumn: "1 / -1", color: "var(--color-text-muted)" }}>No DNS records found</div>}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
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
