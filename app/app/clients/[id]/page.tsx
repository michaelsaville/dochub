"use client"

import AppShell from "@/components/AppShell"
import IpamPanel from "@/components/IpamPanel"
import RackDiagram from "@/components/RackDiagram"
import DocumentsPanel from "@/components/DocumentsPanel"
import PortalUsersPanel from "@/components/PortalUsersPanel"
import PortalVaultPanel from "@/components/PortalVaultPanel"
import FileSharesPanel from "@/components/FileSharesPanel"
import VpnPanel from "@/components/VpnPanel"
import PhonePanel from "@/components/PhonePanel"
import CameraPanel from "@/components/CameraPanel"
import WifiPanel from "@/components/WifiPanel"
import PtpPanel from "@/components/PtpPanel"
import SwitchPanel from "@/components/SwitchPanel"
import NetworkDiagramPanel from "@/components/NetworkDiagramPanel"
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
  friendlyName: string | null
  category: string
  assetTypeId: string | null
  assetType: { id: string; name: string; template: AssetTypeTemplate | null } | null
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
  splashtopUrl: string | null
  isFavorite: boolean
  rdpEnabled: boolean
  rdpHost: string | null
  rdpPort: number | null
  vncEnabled: boolean
  vncHost: string | null
  vncPort: number | null
  warrantyExpiry: string | null
  syncroAssetId: string | null
  dataSource: string | null
  notes: string | null
  firmwareVersion: string | null
  portCount: number | null
  os: string | null
  ram: string | null
  cpu: string | null
  storageCapacity: string | null
  customFields: Record<string, string> | null
}

type AssetTypeTemplate = {
  standardFields: string[]
  showSwitchPanel: boolean
  showCameraPhoto: boolean
  customFieldDefs: { key: string; label: string; type: string; required: boolean }[]
}

type AssetType = { id: string; name: string; template: AssetTypeTemplate | null }

const tabs = ["Dashboard", "Locations", "Users", "Assets", "Contacts", "Credentials", "Licenses", "Subscriptions", "Applications", "Domains", "Network", "Remote Access", "Phone System", "Cameras", "Documents", "SOPs", "Portal", "Portal Vault", "Audit Trail"]

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
  RETIRED: "#6b7280",
  IN_REPAIR: "#3b82f6",
  IN_STORAGE: "#8b5cf6",
  STOLEN: "#ef4444",
  LOST: "#f97316",
  DISPOSED: "#374151",
}

const statusLabel: Record<string, string> = {
  ACTIVE: "Active",
  RETIRING: "Retiring",
  SUNSET: "Sunset",
  RETIRED: "Retired",
  IN_REPAIR: "In Repair",
  IN_STORAGE: "In Storage",
  STOLEN: "Stolen",
  LOST: "Lost",
  DISPOSED: "Disposed",
}

const SOURCE_LABELS: Record<string, string> = {
  MANUAL: "Manual", SYNCRO: "Syncro", UNIFI: "Unifi",
  ITFLOW: "ITFlow", PAX8: "Pax8", PULSEWAY: "Pulseway",
  MERAKI: "Meraki", HPINSTANTON: "HP Instant On", SONICWALL: "SonicWall",
}

// Metadata for all standard asset fields
const ASSET_FIELD_META: Record<string, { label: string; placeholder?: string; type?: string }> = {
  friendlyName:    { label: "Friendly Name",     placeholder: "e.g. Reception Desk" },
  make:            { label: "Make",               placeholder: "e.g. HP, Dell, Cisco" },
  model:           { label: "Model",              placeholder: "" },
  serial:          { label: "Serial Number",      placeholder: "" },
  assetTag:        { label: "Asset Tag",          placeholder: "" },
  ipAddress:       { label: "IP Address",         placeholder: "e.g. 192.168.1.10" },
  macAddress:      { label: "MAC Address",        placeholder: "e.g. AA:BB:CC:DD:EE:FF" },
  vlan:            { label: "VLAN",               placeholder: "e.g. 10" },
  switchPort:      { label: "Switch Port",        placeholder: "e.g. Gi1/0/5" },
  managementUrl:   { label: "Management URL",     placeholder: "https://" },
  splashtopUrl:    { label: "Splashtop URL",      placeholder: "" },
  driverUrl:       { label: "Driver / Download URL", placeholder: "https://" },
  firmwareVersion: { label: "Firmware Version",   placeholder: "" },
  portCount:       { label: "Port Count",         placeholder: "e.g. 24", type: "number" },
  os:              { label: "Operating System",   placeholder: "e.g. Windows 11 Pro" },
  ram:             { label: "RAM",                placeholder: "e.g. 16GB DDR5" },
  cpu:             { label: "CPU / Processor",    placeholder: "e.g. Intel i7-13700" },
  storageCapacity: { label: "Storage",            placeholder: "e.g. 512GB NVMe SSD" },
  purchaseDate:    { label: "Purchase Date",      type: "date" },
  warrantyExpiry:  { label: "Warranty Expiry",    type: "date" },
  room:            { label: "Room / Location",    placeholder: "e.g. Server Room A" },
  rdpEnabled:      { label: "RDP Enabled",        type: "checkbox" },
  vncEnabled:      { label: "VNC Enabled",        type: "checkbox" },
  notes:           { label: "Notes",              type: "textarea" },
  primaryUserId:   { label: "Primary User",       type: "user-select" },
  contactId:       { label: "Contact",            type: "contact-select" },
}

const SOURCE_DEFAULTS: Record<string, string> = {
  SYNCRO: "#3b82f6", UNIFI: "#8b5cf6", ITFLOW: "#f97316", PAX8: "#10b981", PULSEWAY: "#ec4899",
  MERAKI: "#00bceb", HPINSTANTON: "#0096d6", SONICWALL: "#e8521a",
}

const SOURCE_DOMAINS: Record<string, string> = {
  SYNCRO:      "syncromsp.com",
  UNIFI:       "ui.com",
  ITFLOW:      "itflow.org",
  PAX8:        "pax8.com",
  PULSEWAY:    "pulseway.com",
  MERAKI:      "meraki.cisco.com",
  HPINSTANTON: "arubainstanton.com",
  SONICWALL:   "sonicwall.com",
}

function formatUptime(seconds: number | null | undefined): string {
  if (!seconds) return "—"
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function SourceStamp({ sourceKey, color, label }: { sourceKey: string; color: string; label: string }) {
  const [failed, setFailed] = useState(false)
  const domain = SOURCE_DOMAINS[sourceKey]
  return (
    <span
      title={`Source: ${label}`}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: "20px", height: "20px", borderRadius: "4px",
        border: `1px solid ${color}55`,
        background: "rgba(255,255,255,0.07)",
        overflow: "hidden", flexShrink: 0, cursor: "default",
        boxShadow: `0 0 0 1px ${color}22`,
      }}
    >
      {domain && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
          width={14} height={14}
          alt={label}
          style={{ display: "block", imageRendering: "auto" }}
          onError={() => setFailed(true)}
        />
      ) : (
        <span style={{ fontSize: "9px", fontWeight: 700, color, lineHeight: 1 }}>{label[0]}</span>
      )}
    </span>
  )
}

function sourceTag(
  dataSource?: string | null,
  fallbackSyncroId?: string | null,
  fallbackPax8Id?: string | null,
  colors?: Record<string, string>,
) {
  const src = dataSource || (fallbackSyncroId ? "SYNCRO" : fallbackPax8Id ? "PAX8" : "MANUAL")
  if (src === "MANUAL") return null
  const color = colors?.[src] ?? SOURCE_DEFAULTS[src] ?? "#64748b"
  const label = SOURCE_LABELS[src] ?? src
  return <SourceStamp sourceKey={src} color={color} label={label} />
}

export default function ClientDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const [client, setClient] = useState<Client | null>(null)
  const [assets, setAssets] = useState<Asset[]>([])
  const [loadingClient, setLoadingClient] = useState(true)
  const [sourceColors, setSourceColors] = useState<Record<string, string>>(SOURCE_DEFAULTS)
  const [loadingAssets, setLoadingAssets] = useState(false)
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== "undefined") {
      const tab = new URLSearchParams(window.location.search).get("tab")
      if (tab) return tab
    }
    return "Dashboard"
  })
  const [credentials, setCredentials] = useState<any[]>([])
  const [loadingCreds, setLoadingCreds] = useState(false)
  const [showAddCred, setShowAddCred] = useState(false)
  const [credForm, setCredForm] = useState({ label: "", username: "", password: "", totp: "", url: "", notes: "", userId: "", contactId: "", expiryDate: "" })
  const [savingCred, setSavingCred] = useState(false)
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, string>>({})
  const [revealedTotps, setRevealedTotps] = useState<Record<string, { seed: string; code: string }>>({})
  const [totpSecondsLeft, setTotpSecondsLeft] = useState<number>(30 - (Math.floor(Date.now() / 1000) % 30))
  const [copiedCreds, setCopiedCreds] = useState<Record<string, string>>({})
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
  const [licenseForm, setLicenseForm] = useState({ name: "", vendor: "", vendorId: "", licenseKey: "", seats: "", assignedSeats: "", purchaseDate: "", expiryDate: "", renewalDate: "", cost: "", notes: "", assignedUserId: "", contactId: "" })
  const [savingLicense, setSavingLicense] = useState(false)
  const [editingLicense, setEditingLicense] = useState<string | null>(null)
  const [licenseEditForm, setLicenseEditForm] = useState<any>({})
  const [revealedLicenseKeys, setRevealedLicenseKeys] = useState<Record<string, string>>({})
  const [revealingKey, setRevealingKey] = useState<string | null>(null)
  const [vendorsList, setVendorsList] = useState<{ id: string; name: string }[]>([])
  const [subscriptions, setSubscriptions] = useState<any[]>([])
  const [loadingSubscriptions, setLoadingSubscriptions] = useState(false)
  const [assigningSubUser, setAssigningSubUser] = useState<string | null>(null)
  const [applications, setApplications] = useState<any[]>([])
  const [loadingApps, setLoadingApps] = useState(false)
  const [showAddApp, setShowAddApp] = useState(false)
  const [appForm, setAppForm] = useState({ name: "", vendor: "", version: "", supportUrl: "", notes: "", assignedUserId: "", contactId: "", vendorId: "" })
  const [savingApp, setSavingApp] = useState(false)
  const [editingApp, setEditingApp] = useState<string | null>(null)
  const [appEditForm, setAppEditForm] = useState<any>({})
  const [activityEvents, setActivityEvents] = useState<any[]>([])
  const [loadingActivity, setLoadingActivity] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [userSummary, setUserSummary] = useState<UserSummary | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [assetTypes, setAssetTypes] = useState<AssetType[]>([])
  const [assetSearch, setAssetSearch] = useState("")
  const [assetStatusFilter, setAssetStatusFilter] = useState("ALL")
  const [assetTypeFilter, setAssetTypeFilter] = useState("ALL")
  const [showAddAsset, setShowAddAsset] = useState(false)
  const [assetForm, setAssetForm] = useState<Record<string, any>>({ locationId: "", assetTypeId: "", name: "", friendlyName: "", make: "", model: "", serial: "", assetTag: "", ipAddress: "", macAddress: "", vlan: "", switchPort: "", managementUrl: "", splashtopUrl: "", driverUrl: "", rdpEnabled: false, rdpHost: "", rdpPort: "", vncEnabled: false, vncHost: "", vncPort: "", firmwareVersion: "", portCount: "", os: "", ram: "", cpu: "", storageCapacity: "", purchaseDate: "", warrantyExpiry: "", room: "", primaryUserId: "", contactId: "", notes: "", customFields: {} })
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
  const [websiteForm, setWebsiteForm] = useState({ domain: "", label: "", registrar: "", registrarUrl: "", accountNumber: "", autoRenew: false, notes: "" })
  const [editingWebsite, setEditingWebsite] = useState<string | null>(null)
  const [websiteEditForm, setWebsiteEditForm] = useState<any>({})
  const [savingWebsite, setSavingWebsite] = useState(false)
  const [checkingWebsite, setCheckingWebsite] = useState<string | null>(null)
  const [expandedDns, setExpandedDns] = useState<Record<string, boolean>>({})
  const [domainThreshold, setDomainThreshold] = useState(30)
  const [networkDevices, setNetworkDevices] = useState<any[]>([])
  const [loadingNetwork, setLoadingNetwork] = useState(false)
  const [showAddDevice, setShowAddDevice] = useState(false)
  const [deviceForm, setDeviceForm] = useState({ name: "", type: "OTHER", make: "", model: "", ipAddress: "", macAddress: "", serial: "", firmwareVersion: "", managementUrl: "", locationId: "", notes: "", portCount: "" })
  const [savingDevice, setSavingDevice] = useState(false)
  const [editingDevice, setEditingDevice] = useState<string | null>(null)
  const [deviceEditForm, setDeviceEditForm] = useState<any>({})
  const [vlans, setVlans] = useState<any[]>([])
  const [switchPanelDevice, setSwitchPanelDevice] = useState<{ id: string; name: string } | null>(null)
  const [switchPanelAsset, setSwitchPanelAsset] = useState<{ id: string; name: string } | null>(null)
  const [clientDocs, setClientDocs] = useState<any[]>([])
  const [loadingDocs, setLoadingDocs] = useState(false)
  const [clientRunbooks, setClientRunbooks] = useState<any[]>([])
  const [loadingRunbooks, setLoadingRunbooks] = useState(false)
  const [networkSubTab, setNetworkSubTab] = useState<"ipam" | "racks" | "shares" | "wireless" | "ptp" | "diagram">("ipam")
  const [ptpLinks, setPtpLinks] = useState<any[]>([])
  const [loadingPtp, setLoadingPtp] = useState(false)
  const [subnets, setSubnets] = useState<any[]>([])
  const [loadingSubnets, setLoadingSubnets] = useState(false)
  const [racks, setRacks] = useState<any[]>([])
  const [loadingRacks, setLoadingRacks] = useState(false)
  const [adDomains, setAdDomains] = useState<any[]>([])
  const [clientShares, setClientShares] = useState<any[]>([])
  const [loadingShares, setLoadingShares] = useState(false)
  const [vpnGateways, setVpnGateways] = useState<any[]>([])
  const [loadingVpn, setLoadingVpn] = useState(false)
  const [vpnVendors, setVpnVendors] = useState<any[]>([])
  const [vpnStaffUsers, setVpnStaffUsers] = useState<any[]>([])
  const [vpnCredentials, setVpnCredentials] = useState<any[]>([])
  const [phoneSystems, setPhoneSystems] = useState<any[]>([])
  const [loadingPhone, setLoadingPhone] = useState(false)
  const [phoneCredentials, setPhoneCredentials] = useState<any[]>([])
  const [cameraSystems, setCameraSystems] = useState<any[]>([])
  const [loadingCameras, setLoadingCameras] = useState(false)
  const [wifiControllers, setWifiControllers] = useState<any[]>([])
  const [loadingWifi, setLoadingWifi] = useState(false)
  const [dashboardData, setDashboardData] = useState<{ favoritedAssets: any[]; favoritedCredentials: any[] } | null>(null)
  const [loadingDashboard, setLoadingDashboard] = useState(false)
  const [dashRevealedPasswords, setDashRevealedPasswords] = useState<Record<string, string>>({})
  const [dashRevealedTotps, setDashRevealedTotps] = useState<Record<string, { seed: string; code: string }>>({})
  const [showArchivedDevices, setShowArchivedDevices] = useState(false)
  const [showArchivedLicenses, setShowArchivedLicenses] = useState(false)
  const [expandedAssetHistory, setExpandedAssetHistory] = useState<Record<string, any[] | null>>({})
  const [loadingAssetHistory, setLoadingAssetHistory] = useState<Record<string, boolean>>({})
  const [editingCredId, setEditingCredId] = useState<string | null>(null)
  const [credEditForm, setCredEditForm] = useState<any>({})
  const [savingCredEdit, setSavingCredEdit] = useState(false)
  const [expandedCredHistory, setExpandedCredHistory] = useState<Record<string, any[] | null>>({})
  const [loadingCredHistory, setLoadingCredHistory] = useState<Record<string, boolean>>({})

  const boundSourceTag = (ds?: string | null, si?: string | null, pi?: string | null) =>
    sourceTag(ds, si, pi, sourceColors)

  useEffect(() => {
    if (id) fetchClient()
    fetch("/api/settings/source-colors")
      .then(r => r.json())
      .then(d => setSourceColors(d))
      .catch(() => {})
  }, [id])

  useEffect(() => {
    if (activeTab === "Dashboard" && !dashboardData) fetchDashboard()
    if (activeTab === "Assets" && assets.length === 0) { fetchAssets(); if (assetTypes.length === 0) fetchAssetTypes() }
    if (activeTab === "Credentials" && credentials.length === 0) fetchCredentials()
    if (activeTab === "Licenses" && licenses.length === 0) { fetchLicenses(); if (vendorsList.length === 0) fetchVendorsList() }
    if (activeTab === "Subscriptions" && subscriptions.length === 0) fetchSubscriptions()
    if (activeTab === "Applications" && applications.length === 0) fetchApplications()
    if (activeTab === "Domains" && websites.length === 0) { fetchWebsites(); fetchDomainThreshold() }
    if (activeTab === "Network" && networkDevices.length === 0) { fetchNetworkDevices(); if (vlans.length === 0) fetchVlans() }
    if (activeTab === "Remote Access") {
      if (vpnGateways.length === 0) fetchVpn()
      if (assets.length === 0) fetchAssets()
      if (networkDevices.length === 0) fetchNetworkDevices()
    }
    if (activeTab === "Phone System") {
      if (phoneSystems.length === 0) fetchPhoneSystems()
      if (assets.length === 0) fetchAssets()
    }
    if (activeTab === "Cameras") {
      if (cameraSystems.length === 0) fetchCameraSystems()
      if (assets.length === 0) fetchAssets()
    }
    if (activeTab === "Documents" && clientDocs.length === 0) fetchClientDocs()
    if (activeTab === "SOPs" && clientRunbooks.length === 0) fetchClientRunbooks()
    if (activeTab === "Audit Trail" && activityEvents.length === 0) fetchActivity()
  }, [activeTab])

  useEffect(() => {
    if (activeTab !== "Network") return
    if (networkSubTab === "ipam" && subnets.length === 0) fetchSubnets()
    if (networkSubTab === "racks" && racks.length === 0) { fetchRacks(); if (networkDevices.length === 0) fetchNetworkDevices(); if (assets.length === 0) fetchAssets() }
    if (networkSubTab === "shares") {
      if (adDomains.length === 0 && clientShares.length === 0) fetchShares()
      if (assets.length === 0) fetchAssets()
    }
    if (networkSubTab === "wireless") {
      if (wifiControllers.length === 0) fetchWifi()
      if (subnets.length === 0) fetchSubnets()
      if (assets.length === 0) fetchAssets()
    }
    if (networkSubTab === "ptp" && ptpLinks.length === 0) fetchPtp()
  }, [networkSubTab, activeTab])

  // TOTP countdown — ticks every second, refreshes codes at the 30s boundary
  useEffect(() => {
    const tick = () => {
      const now = Math.floor(Date.now() / 1000)
      const secs = 30 - (now % 30)
      setTotpSecondsLeft(secs)
      // At the boundary, regenerate all currently-revealed codes
      if (secs === 30) {
        const refreshCodes = async (
          revealed: Record<string, { seed: string; code: string }>,
          setter: React.Dispatch<React.SetStateAction<Record<string, { seed: string; code: string }>>>
        ) => {
          const ids = Object.keys(revealed)
          if (ids.length === 0) return
          const updated: Record<string, { seed: string; code: string }> = {}
          await Promise.all(ids.map(async id => {
            try {
              const r = await fetch(`/api/credentials/${id}/reveal`)
              if (r.ok) {
                const d = await r.json()
                updated[id] = { seed: d.totp ?? revealed[id].seed, code: d.totpCode ?? "------" }
              } else {
                updated[id] = revealed[id]
              }
            } catch { updated[id] = revealed[id] }
          }))
          setter(prev => ({ ...prev, ...updated }))
        }
        setRevealedTotps(prev => { refreshCodes(prev, setRevealedTotps); return prev })
        setDashRevealedTotps(prev => { refreshCodes(prev, setDashRevealedTotps); return prev })
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  async function fetchClient() {
    try {
      const res = await fetch("/api/clients/" + id)
      if (!res.ok) { router.push("/clients"); return }
      setClient(await res.json())
    } catch { router.push("/clients") }
    finally { setLoadingClient(false) }
  }

  async function fetchDashboard() {
    setLoadingDashboard(true)
    try {
      const res = await fetch(`/api/clients/${id}/dashboard`)
      if (res.ok) setDashboardData(await res.json())
    } finally { setLoadingDashboard(false) }
  }

  async function toggleAssetFavorite(assetId: string, current: boolean) {
    await fetch(`/api/assets/${assetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isFavorite: !current }),
    })
    setAssets(prev => prev.map(a => a.id === assetId ? { ...a, isFavorite: !current } : a))
    // Refresh dashboard data
    setDashboardData(null)
    if (activeTab === "Dashboard") fetchDashboard()
  }

  async function toggleCredFavorite(credId: string, current: boolean) {
    await fetch(`/api/credentials/${credId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isFavorite: !current }),
    })
    setCredentials(prev => prev.map(c => c.id === credId ? { ...c, isFavorite: !current } : c))
    setDashboardData(null)
    if (activeTab === "Dashboard") fetchDashboard()
  }

  async function revealDashPassword(credId: string) {
    try {
      const res = await fetch(`/api/credentials/${credId}/reveal`)
      if (res.ok) {
        const { password } = await res.json()
        setDashRevealedPasswords(p => ({ ...p, [credId]: password }))
      }
    } catch {}
  }

  async function revealDashTotp(credId: string) {
    try {
      const res = await fetch(`/api/credentials/${credId}/reveal`)
      if (res.ok) {
        const data = await res.json()
        if (data.totp) setDashRevealedTotps(t => ({ ...t, [credId]: { seed: data.totp, code: data.totpCode ?? "------" } }))
      }
    } catch {}
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

  function flashCopied(credId: string, field: string) {
    setCopiedCreds(p => ({ ...p, [credId]: field }))
    setTimeout(() => setCopiedCreds(p => { const n = { ...p }; delete n[credId]; return n }), 1500)
  }

  async function copyPassword(credId: string) {
    try {
      if (revealedPasswords[credId]) {
        await navigator.clipboard.writeText(revealedPasswords[credId])
      } else {
        const res = await fetch(`/api/credentials/${credId}/reveal`)
        const data = await res.json()
        await navigator.clipboard.writeText(data.password)
      }
      flashCopied(credId, "password")
    } catch {}
  }

  async function copyTotpCode(credId: string) {
    try {
      let code: string
      if (revealedTotps[credId]) {
        code = revealedTotps[credId].code
      } else {
        const res = await fetch(`/api/credentials/${credId}/reveal`)
        const data = await res.json()
        code = data.totpCode ?? ""
      }
      if (code) await navigator.clipboard.writeText(code)
      flashCopied(credId, "totp")
    } catch {}
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

  async function revealTotp(credId: string) {
    if (revealedTotps[credId]) {
      setRevealedTotps(t => { const n = { ...t }; delete n[credId]; return n })
      return
    }
    try {
      const res = await fetch(`/api/credentials/${credId}/reveal`)
      const data = await res.json()
      if (data.totp) setRevealedTotps(t => ({ ...t, [credId]: { seed: data.totp, code: data.totpCode ?? "------" } }))
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
        setCredForm({ label: "", username: "", password: "", totp: "", url: "", notes: "", userId: "", contactId: "", expiryDate: "" })
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

  async function updateCred(credId: string) {
    setSavingCredEdit(true)
    try {
      const res = await fetch(`/api/credentials/${credId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credEditForm),
      })
      if (res.ok) {
        const updated = await res.json()
        setCredentials(c => c.map(x => x.id === credId ? { ...x, ...updated } : x))
        setEditingCredId(null)
        // Invalidate cached history so it refreshes next time
        setExpandedCredHistory(h => { const n = { ...h }; delete n[credId]; return n })
      }
    } catch {}
    finally { setSavingCredEdit(false) }
  }

  async function toggleCredHistory(credId: string) {
    if (credId in expandedCredHistory) {
      setExpandedCredHistory(h => { const n = { ...h }; delete n[credId]; return n })
      return
    }
    setLoadingCredHistory(h => ({ ...h, [credId]: true }))
    try {
      const res = await fetch(`/api/credentials/${credId}/history`)
      const data = await res.json()
      setExpandedCredHistory(h => ({ ...h, [credId]: Array.isArray(data) ? data : [] }))
    } catch {
      setExpandedCredHistory(h => ({ ...h, [credId]: [] }))
    } finally {
      setLoadingCredHistory(h => ({ ...h, [credId]: false }))
    }
  }

  async function fetchLicenses(includeInactive = false) {
    setLoadingLicenses(true)
    try {
      const res = await fetch(`/api/clients/${id}/licenses${includeInactive ? "?includeInactive=true" : ""}`)
      const all = await res.json()
      setLicenses(Array.isArray(all) ? all.filter((l: any) => l.dataSource !== "PAX8") : all)
    } catch {}
    finally { setLoadingLicenses(false) }
  }

  async function fetchSubscriptions() {
    setLoadingSubscriptions(true)
    try {
      const res = await fetch(`/api/clients/${id}/licenses`)
      const all = await res.json()
      setSubscriptions(Array.isArray(all) ? all.filter((l: any) => l.dataSource === "PAX8") : [])
    } catch {}
    finally { setLoadingSubscriptions(false) }
  }

  async function assignSubUser(licenseId: string, userId: string) {
    setAssigningSubUser(licenseId)
    try {
      const res = await fetch(`/api/clients/${id}/licenses/${licenseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedUserId: userId || null }),
      })
      if (res.ok) {
        const updated = await res.json()
        setSubscriptions(s => s.map(x => x.id === licenseId ? updated : x))
      }
    } catch {}
    finally { setAssigningSubUser(null) }
  }

  async function fetchVendorsList() {
    try {
      const res = await fetch("/api/vendors")
      const data = await res.json()
      setVendorsList(data.map((v: any) => ({ id: v.id, name: v.name })))
    } catch {}
  }

  async function revealLicenseKey(licenseId: string) {
    if (revealedLicenseKeys[licenseId] !== undefined) {
      setRevealedLicenseKeys(r => { const n = { ...r }; delete n[licenseId]; return n })
      return
    }
    setRevealingKey(licenseId)
    try {
      const res = await fetch(`/api/clients/${id}/licenses/${licenseId}/reveal`)
      const data = await res.json()
      setRevealedLicenseKeys(r => ({ ...r, [licenseId]: data.key ?? "" }))
    } catch {}
    finally { setRevealingKey(null) }
  }

  async function fetchNetworkDevices(includeInactive = false) {
    setLoadingNetwork(true)
    try {
      const res = await fetch(`/api/clients/${id}/network${includeInactive ? "?includeInactive=true" : ""}`)
      setNetworkDevices(await res.json())
    } catch {}
    finally { setLoadingNetwork(false) }
  }

  async function fetchVlans() {
    try {
      const res = await fetch(`/api/clients/${id}/vlans`)
      if (res.ok) setVlans(await res.json())
    } catch {}
  }

  async function saveNetworkDevice() {
    if (!deviceForm.name.trim()) return
    setSavingDevice(true)
    try {
      const res = await fetch(`/api/clients/${id}/network`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...deviceForm, portCount: deviceForm.portCount ? Number(deviceForm.portCount) : null }),
      })
      if (res.ok) {
        const d = await res.json()
        setNetworkDevices(n => [...n, d])
        setDeviceForm({ name: "", type: "OTHER", make: "", model: "", ipAddress: "", macAddress: "", serial: "", firmwareVersion: "", managementUrl: "", locationId: "", notes: "", portCount: "" })
        setShowAddDevice(false)
      }
    } catch {}
    finally { setSavingDevice(false) }
  }

  async function updateNetworkDevice(deviceId: string) {
    try {
      const res = await fetch(`/api/clients/${id}/network/${deviceId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...deviceEditForm, portCount: deviceEditForm.portCount !== undefined ? (deviceEditForm.portCount ? Number(deviceEditForm.portCount) : null) : undefined }),
      })
      if (res.ok) {
        const updated = await res.json()
        setNetworkDevices(n => n.map(x => x.id === deviceId ? updated : x))
        setEditingDevice(null)
      }
    } catch {}
  }

  async function deleteNetworkDevice(deviceId: string) {
    if (!confirm("Archive this device? It will be hidden but not deleted.")) return
    try {
      await fetch(`/api/clients/${id}/network/${deviceId}`, { method: "DELETE" })
      if (showArchivedDevices) {
        setNetworkDevices(n => n.map(x => x.id === deviceId ? { ...x, isActive: false } : x))
      } else {
        setNetworkDevices(n => n.filter(x => x.id !== deviceId))
      }
    } catch {}
  }

  async function restoreNetworkDevice(deviceId: string) {
    try {
      await fetch(`/api/clients/${id}/network/${deviceId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: true }) })
      setNetworkDevices(n => n.map(x => x.id === deviceId ? { ...x, isActive: true } : x))
    } catch {}
  }

  async function toggleAssetHistory(assetId: string) {
    if (expandedAssetHistory[assetId] !== undefined) {
      setExpandedAssetHistory(h => { const n = { ...h }; delete n[assetId]; return n })
      return
    }
    setLoadingAssetHistory(l => ({ ...l, [assetId]: true }))
    try {
      const res = await fetch(`/api/assets/${assetId}/history`)
      const data = await res.json()
      setExpandedAssetHistory(h => ({ ...h, [assetId]: Array.isArray(data) ? data : [] }))
    } catch {
      setExpandedAssetHistory(h => ({ ...h, [assetId]: [] }))
    } finally {
      setLoadingAssetHistory(l => ({ ...l, [assetId]: false }))
    }
  }

  async function fetchClientDocs() {
    setLoadingDocs(true)
    try {
      const res = await fetch(`/api/clients/${id}/documents`)
      setClientDocs(await res.json())
    } catch {}
    finally { setLoadingDocs(false) }
  }

  async function fetchClientRunbooks() {
    setLoadingRunbooks(true)
    try {
      const res = await fetch(`/api/clients/${id}/runbooks`)
      setClientRunbooks(await res.json())
    } catch {}
    finally { setLoadingRunbooks(false) }
  }

  async function fetchSubnets() {
    setLoadingSubnets(true)
    try {
      const res = await fetch(`/api/clients/${id}/subnets`)
      setSubnets(await res.json())
    } catch {}
    finally { setLoadingSubnets(false) }
  }

  async function fetchRacks() {
    setLoadingRacks(true)
    try {
      const res = await fetch(`/api/clients/${id}/racks`)
      setRacks(await res.json())
    } catch {}
    finally { setLoadingRacks(false) }
  }

  async function fetchShares() {
    setLoadingShares(true)
    try {
      const [domainsRes, sharesRes] = await Promise.all([
        fetch(`/api/clients/${id}/ad-domains`),
        fetch(`/api/clients/${id}/shares`),
      ])
      setAdDomains(await domainsRes.json())
      setClientShares(await sharesRes.json())
    } catch {}
    finally { setLoadingShares(false) }
  }

  async function fetchVpn() {
    setLoadingVpn(true)
    try {
      const [gwRes, vendorsRes, staffRes, credsRes] = await Promise.all([
        fetch(`/api/clients/${id}/vpn`),
        fetch(`/api/vendors`),
        fetch(`/api/staff`),
        fetch(`/api/clients/${id}/credentials`),
      ])
      if (gwRes.ok) setVpnGateways(await gwRes.json())
      if (vendorsRes.ok) setVpnVendors(await vendorsRes.json())
      if (staffRes.ok) setVpnStaffUsers(await staffRes.json())
      if (credsRes.ok) {
        const creds = await credsRes.json()
        setVpnCredentials(creds.map((c: any) => ({ id: c.id, label: c.label })))
      }
    } catch {}
    finally { setLoadingVpn(false) }
  }

  async function fetchPhoneSystems() {
    setLoadingPhone(true)
    try {
      const [sysRes, credsRes, vendorsRes] = await Promise.all([
        fetch(`/api/clients/${id}/phone-systems`),
        fetch(`/api/clients/${id}/credentials`),
        fetch(`/api/vendors`),
      ])
      if (sysRes.ok) setPhoneSystems(await sysRes.json())
      if (credsRes.ok) {
        const creds = await credsRes.json()
        setPhoneCredentials(creds.map((c: any) => ({ id: c.id, label: c.label })))
      }
      if (vendorsRes.ok) setVpnVendors(await vendorsRes.json())
    } catch {}
    finally { setLoadingPhone(false) }
  }

  async function fetchCameraSystems() {
    setLoadingCameras(true)
    try {
      const [sysRes, credsRes] = await Promise.all([
        fetch(`/api/clients/${id}/camera-systems`),
        fetch(`/api/clients/${id}/credentials`),
      ])
      if (sysRes.ok) setCameraSystems(await sysRes.json())
      if (credsRes.ok) {
        const creds = await credsRes.json()
        setPhoneCredentials(prev => prev.length ? prev : creds.map((c: any) => ({ id: c.id, label: c.label })))
      }
    } catch {}
    finally { setLoadingCameras(false) }
  }

  async function fetchWifi() {
    setLoadingWifi(true)
    try {
      const [ctrlRes, credsRes] = await Promise.all([
        fetch(`/api/clients/${id}/wifi-controllers`),
        fetch(`/api/clients/${id}/credentials`),
      ])
      if (ctrlRes.ok) setWifiControllers(await ctrlRes.json())
      if (credsRes.ok) {
        const creds = await credsRes.json()
        setPhoneCredentials(prev => prev.length ? prev : creds.map((c: any) => ({ id: c.id, label: c.label })))
      }
    } catch {}
    finally { setLoadingWifi(false) }
  }

  async function fetchPtp() {
    setLoadingPtp(true)
    try {
      const [linksRes, credsRes] = await Promise.all([
        fetch(`/api/clients/${id}/ptp`),
        fetch(`/api/clients/${id}/credentials`),
      ])
      if (linksRes.ok) setPtpLinks(await linksRes.json())
      if (credsRes.ok) {
        const creds = await credsRes.json()
        setPhoneCredentials(prev => prev.length ? prev : creds.map((c: any) => ({ id: c.id, label: c.label })))
      }
    } catch {}
    finally { setLoadingPtp(false) }
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
        setLicenseForm({ name: "", vendor: "", vendorId: "", licenseKey: "", seats: "", assignedSeats: "", purchaseDate: "", expiryDate: "", renewalDate: "", cost: "", notes: "", assignedUserId: "", contactId: "" })
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
    if (!confirm("Archive this license? It will be hidden but not deleted.")) return
    try {
      await fetch(`/api/clients/${id}/licenses/${licenseId}`, { method: "DELETE" })
      if (showArchivedLicenses) {
        setLicenses(l => l.map(x => x.id === licenseId ? { ...x, isActive: false } : x))
      } else {
        setLicenses(l => l.filter(x => x.id !== licenseId))
      }
    } catch {}
  }

  async function restoreLicense(licenseId: string) {
    try {
      await fetch(`/api/clients/${id}/licenses/${licenseId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: true }) })
      setLicenses(l => l.map(x => x.id === licenseId ? { ...x, isActive: true } : x))
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
      // Use admin seed endpoint which includes templates; fall back to basic endpoint
      const res = await fetch("/api/admin/seed-asset-types")
      if (res.ok) setAssetTypes(await res.json())
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

  const filteredAssets = assets.filter(asset => {
    const q = assetSearch.toLowerCase()
    if (q && !`${asset.name} ${asset.friendlyName ?? ""} ${asset.serial ?? ""}`.toLowerCase().includes(q)) return false
    if (assetStatusFilter !== "ALL" && asset.status !== assetStatusFilter) return false
    if (assetTypeFilter !== "ALL" && getTypeKey(asset) !== assetTypeFilter) return false
    return true
  })

  const assetsByType = filteredAssets.reduce((acc, asset) => {
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
        setWebsiteForm({ domain: "", label: "", registrar: "", registrarUrl: "", accountNumber: "", autoRenew: false, notes: "" })
        setShowAddWebsite(false)
      }
    } catch {}
    finally { setSavingWebsite(false) }
  }

  async function deleteWebsite(websiteId: string) {
    if (!confirm("Remove this domain?")) return
    try {
      await fetch(`/api/clients/${id}/websites/${websiteId}`, { method: "DELETE" })
      setWebsites(w => w.filter(s => s.id !== websiteId))
    } catch {}
  }

  async function updateWebsite(websiteId: string) {
    try {
      const res = await fetch(`/api/clients/${id}/websites/${websiteId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(websiteEditForm),
      })
      if (res.ok) {
        const updated = await res.json()
        setWebsites(w => w.map(s => s.id === websiteId ? updated : s))
        setEditingWebsite(null)
      }
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
          <button
            onClick={() => router.push(`/clients/${id}/runbook`)}
            style={{ marginLeft: "auto", fontSize: "13px", padding: "6px 14px", borderRadius: "7px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}
          >
            📋 Runbook
          </button>
        </div>

        <div className="pcc-tab-bar-wrap">
          <button className="pcc-tab-scroll-btn" onClick={() => { const el = document.querySelector('.pcc-tab-bar') as HTMLElement; if (el) el.scrollLeft -= 160 }}>‹</button>
          <div className="pcc-tab-bar">
            {tabs.map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`pcc-tab${activeTab === tab ? " active" : ""}`}>
                {tab}{tab === "Assets" && assets.length > 0 ? ` (${assets.length})` : ""}
              </button>
            ))}
          </div>
          <button className="pcc-tab-scroll-btn" onClick={() => { const el = document.querySelector('.pcc-tab-bar') as HTMLElement; if (el) el.scrollLeft += 160 }}>›</button>
        </div>

        {activeTab === "Dashboard" && (
          <div style={{ maxWidth: "960px" }}>
            {/* Top row: details + notes */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "24px" }}>
              <div style={{ background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "10px", padding: "20px" }}>
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
                <div style={{ background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "10px", padding: "20px" }}>
                  <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: "8px" }}>Notes</div>
                  <div style={{ fontSize: "14px", lineHeight: "1.6" }}>{client.notes}</div>
                </div>
              )}
            </div>

            {/* Favorited assets */}
            <div style={{ marginBottom: "24px" }}>
              <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" }}>
                Quick Access — Assets
              </div>
              {loadingDashboard ? (
                <div style={{ fontSize: "13px", color: "var(--color-text-muted)" }}>Loading...</div>
              ) : !dashboardData || dashboardData.favoritedAssets.length === 0 ? (
                <div style={{ fontSize: "13px", color: "var(--color-text-muted)" }}>
                  No favorited assets. Star an asset on the Assets tab to pin it here.
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "10px" }}>
                  {dashboardData.favoritedAssets.map((a: any) => (
                    <div key={a.id} style={{ background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "10px", padding: "14px 16px" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "6px" }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {a.friendlyName || a.name}
                          </div>
                          {a.friendlyName && a.friendlyName !== a.name && (
                            <div style={{ fontSize: "11px", color: "var(--color-text-muted)", fontFamily: "monospace" }}>{a.name}</div>
                          )}
                          <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "2px" }}>
                            {[a.make, a.model].filter(Boolean).join(" ") || categoryLabel[a.category] || a.category}
                          </div>
                        </div>
                        <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: statusColor[a.status] ?? "#94a3b8", flexShrink: 0, marginTop: "6px" }} />
                      </div>
                      {a.ipAddress && (
                        <div style={{ fontSize: "11px", color: "var(--color-text-muted)", fontFamily: "monospace", marginBottom: "8px" }}>{a.ipAddress}</div>
                      )}
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        {a.splashtopUrl && (
                          <a href={a.splashtopUrl} style={{ fontSize: "12px", padding: "4px 10px", borderRadius: "6px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", color: "var(--color-text-secondary)", textDecoration: "none", cursor: "pointer" }}>
                            Splashtop
                          </a>
                        )}
                        {a.rdpEnabled && (
                          <a href={`/api/assets/${a.id}/rdp`} style={{ fontSize: "12px", padding: "4px 10px", borderRadius: "6px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", color: "var(--color-text-secondary)", textDecoration: "none" }}>
                            RDP
                          </a>
                        )}
                        {a.vncEnabled && (
                          <a href={`vnc://${a.vncHost || a.ipAddress}:${a.vncPort ?? 5900}`} style={{ fontSize: "12px", padding: "4px 10px", borderRadius: "6px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", color: "var(--color-text-secondary)", textDecoration: "none" }}>
                            VNC
                          </a>
                        )}
                        {a.managementUrl && (
                          <a href={a.managementUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "12px", padding: "4px 10px", borderRadius: "6px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", color: "var(--color-text-secondary)", textDecoration: "none" }}>
                            Syncro
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Favorited credentials */}
            <div>
              <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" }}>
                Quick Access — Credentials
              </div>
              {loadingDashboard ? (
                <div style={{ fontSize: "13px", color: "var(--color-text-muted)" }}>Loading...</div>
              ) : !dashboardData || dashboardData.favoritedCredentials.length === 0 ? (
                <div style={{ fontSize: "13px", color: "var(--color-text-muted)" }}>
                  No favorited credentials. Star a credential on the Credentials tab to pin it here.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {dashboardData.favoritedCredentials.map((cred: any) => (
                    <div key={cred.id} style={{ background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "10px", padding: "12px 16px", display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
                      <div style={{ fontSize: "14px", fontWeight: 500, minWidth: "120px" }}>{cred.label}</div>
                      {cred.username && (
                        <div style={{ fontSize: "13px", fontFamily: "monospace", color: "var(--color-text-secondary)" }}>{cred.username}</div>
                      )}
                      {cred.hasPassword && (
                        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                          <span style={{ fontSize: "13px", fontFamily: "monospace" }}>
                            {dashRevealedPasswords[cred.id] ?? "••••••••••••"}
                          </span>
                          <button onClick={() => dashRevealedPasswords[cred.id]
                            ? setDashRevealedPasswords(p => { const n = { ...p }; delete n[cred.id]; return n })
                            : revealDashPassword(cred.id)
                          } style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                            {dashRevealedPasswords[cred.id] ? "Hide" : "Show"}
                          </button>
                        </div>
                      )}
                      {cred.hasTotp && (
                        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                          {dashRevealedTotps[cred.id] ? (
                            <>
                              <span style={{ fontSize: "15px", fontFamily: "monospace", fontWeight: 700, letterSpacing: "3px", color: totpSecondsLeft <= 5 ? "#f59e0b" : "#10b981" }}>{dashRevealedTotps[cred.id].code}</span>
                              <span style={{ fontSize: "11px", color: totpSecondsLeft <= 5 ? "#f59e0b" : "var(--color-text-muted)", fontFamily: "monospace", minWidth: "28px" }}>{totpSecondsLeft}s</span>
                              <button onClick={() => navigator.clipboard.writeText(dashRevealedTotps[cred.id].code)} style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Copy</button>
                              <button onClick={() => setDashRevealedTotps(t => { const n = { ...t }; delete n[cred.id]; return n })} style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Hide</button>
                            </>
                          ) : (
                            <>
                              <span style={{ fontSize: "13px", fontFamily: "monospace", color: "var(--color-text-muted)" }}>MFA</span>
                              <button onClick={() => revealDashTotp(cred.id)} style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Show code</button>
                            </>
                          )}
                        </div>
                      )}
                      {cred.url && (
                        <a href={cred.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "12px", padding: "3px 10px", borderRadius: "6px", border: "0.5px solid var(--color-border-secondary)", color: "var(--color-text-secondary)", textDecoration: "none" }}>
                          Open ↗
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
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
                    <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>Name / Asset ID *</label>
                    <input value={assetForm.name} onChange={e => setAssetForm((f: any) => ({ ...f, name: e.target.value }))} style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }} placeholder="e.g. DELL-WS-001 or HP LaserJet M404" />
                  </div>
                  {/* Template-driven fields */}
                  {(() => {
                    const tmpl = assetTypes.find(t => t.id === assetForm.assetTypeId)?.template
                    const fields = tmpl?.standardFields ?? ["make", "model", "serial", "ipAddress", "macAddress", "managementUrl", "purchaseDate", "warrantyExpiry", "notes"]
                    const inputStyle = { width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }
                    return fields.map((fk: string) => {
                      const meta = ASSET_FIELD_META[fk]
                      if (!meta) return null
                      const isFullWidth = meta.type === "textarea" || meta.type === "user-select" || meta.type === "contact-select"
                      return (
                        <div key={fk} style={isFullWidth ? { gridColumn: "1 / -1" } : {}}>
                          <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>{meta.label}</label>
                          {meta.type === "textarea" ? (
                            <textarea rows={2} value={assetForm[fk] ?? ""} onChange={e => setAssetForm((f: any) => ({ ...f, [fk]: e.target.value }))} style={{ ...inputStyle, resize: "vertical" as const }} />
                          ) : meta.type === "checkbox" ? (
                            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", cursor: "pointer" }}>
                              <input type="checkbox" checked={!!assetForm[fk]} onChange={e => setAssetForm((f: any) => ({ ...f, [fk]: e.target.checked }))} />
                              {meta.label}
                            </label>
                          ) : meta.type === "user-select" ? (
                            <select value={assetForm.primaryUserId ?? ""} onChange={e => setAssetForm((f: any) => ({ ...f, primaryUserId: e.target.value }))} style={inputStyle}>
                              <option value="">Unassigned</option>
                              {client.users.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
                            </select>
                          ) : meta.type === "contact-select" ? (
                            <select value={assetForm.contactId ?? ""} onChange={e => setAssetForm((f: any) => ({ ...f, contactId: e.target.value }))} style={inputStyle}>
                              <option value="">None</option>
                              {client.contacts.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                          ) : (
                            <input type={meta.type ?? "text"} value={assetForm[fk] ?? ""} onChange={e => setAssetForm((f: any) => ({ ...f, [fk]: e.target.value }))} placeholder={meta.placeholder ?? ""} style={inputStyle} />
                          )}
                        </div>
                      )
                    })
                  })()}
                  {/* Custom fields from template */}
                  {(() => {
                    const tmpl = assetTypes.find(t => t.id === assetForm.assetTypeId)?.template
                    if (!tmpl?.customFieldDefs?.length) return null
                    return (tmpl.customFieldDefs as any[]).map((cd: any) => (
                      <div key={cd.key}>
                        <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>{cd.label}{cd.required ? " *" : ""}</label>
                        <input type={cd.type === "number" ? "number" : cd.type === "date" ? "date" : "text"} value={assetForm.customFields?.[cd.key] ?? ""}
                          onChange={e => setAssetForm((f: any) => ({ ...f, customFields: { ...f.customFields, [cd.key]: e.target.value } }))}
                          style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }} />
                      </div>
                    ))
                  })()}
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button onClick={saveAsset} disabled={savingAsset} style={{ fontSize: "14px", fontWeight: 500, padding: "8px 16px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>
                    {savingAsset ? "Saving..." : "Create asset"}
                  </button>
                  <button onClick={() => setShowAddAsset(false)} style={{ fontSize: "14px", padding: "8px 16px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>Cancel</button>
                </div>
              </div>
            )}

            {assets.length > 0 && (
              <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "16px", flexWrap: "wrap" }}>
                <input
                  type="text"
                  placeholder="Search name, serial..."
                  value={assetSearch}
                  onChange={e => setAssetSearch(e.target.value)}
                  style={{ padding: "6px 10px", fontSize: "13px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "7px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", width: "200px" }}
                />
                <select
                  value={assetStatusFilter}
                  onChange={e => setAssetStatusFilter(e.target.value)}
                  style={{ padding: "6px 10px", fontSize: "13px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "7px", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}
                >
                  <option value="ALL">All statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="SPARE">Spare</option>
                  <option value="RETIRED">Retired</option>
                  <option value="DISPOSED">Disposed</option>
                </select>
                <select
                  value={assetTypeFilter}
                  onChange={e => setAssetTypeFilter(e.target.value)}
                  style={{ padding: "6px 10px", fontSize: "13px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "7px", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}
                >
                  <option value="ALL">All types</option>
                  {Object.keys(assets.reduce((acc, a) => { acc[getTypeKey(a)] = getTypeLabel(a); return acc }, {} as Record<string,string>)).sort((a, b) => (assets.find(x => getTypeKey(x) === a)?.assetType?.name ?? a).localeCompare(assets.find(x => getTypeKey(x) === b)?.assetType?.name ?? b)).map(key => (
                    <option key={key} value={key}>{assets.find(a => getTypeKey(a) === key)?.assetType?.name ?? key}</option>
                  ))}
                </select>
                {(assetSearch || assetStatusFilter !== "ALL" || assetTypeFilter !== "ALL") && (
                  <button
                    onClick={() => { setAssetSearch(""); setAssetStatusFilter("ALL"); setAssetTypeFilter("ALL") }}
                    style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                  >Clear</button>
                )}
                {(assetSearch || assetStatusFilter !== "ALL" || assetTypeFilter !== "ALL") && (
                  <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
                    {filteredAssets.length} of {assets.length}
                  </span>
                )}
              </div>
            )}

            {loadingAssets ? (
              <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>Loading assets...</div>
            ) : assets.length === 0 && !showAddAsset ? (
              <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>No assets found.</div>
            ) : filteredAssets.length === 0 ? (
              <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>No assets match your filters.</div>
            ) : (
              typeKeys.map(key => (
                <div key={key} style={{ marginBottom: "24px" }}>
                  <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {getTypeLabel(assetsByType[key][0])} ({assetsByType[key].length})
                  </div>
                  <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "10px", overflow: "hidden" }}>
                    <div style={{
                      display: "grid", gridTemplateColumns: "1fr 160px 100px 120px 80px 1fr",
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
                            { key: "name", label: "Name" }, { key: "friendlyName", label: "Friendly Name" },
                            { key: "make", label: "Make" }, { key: "model", label: "Model" },
                            { key: "serial", label: "Serial" },
                            { key: "ipAddress", label: "IP Address" }, { key: "macAddress", label: "MAC Address" },
                            { key: "managementUrl", label: "Management URL" }, { key: "notes", label: "Notes" },
                          ].map(({ key, label }) => (
                            <div key={key} style={key === "notes" || key === "managementUrl" ? { gridColumn: "1 / -1" } : {}}>
                              <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>{label}</label>
                              <input value={assetEditForm[key] ?? ""} onChange={e => setAssetEditForm((f: any) => ({ ...f, [key]: e.target.value }))}
                                style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }} />
                            </div>
                          ))}
                          {/* RDP */}
                          <div style={{ gridColumn: "1 / -1", borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: "10px" }}>
                            <div style={{ display: "flex", gap: "16px", alignItems: "center", marginBottom: "8px" }}>
                              <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--color-text-secondary)", cursor: "pointer" }}>
                                <input type="checkbox" checked={assetEditForm.rdpEnabled ?? false} onChange={e => setAssetEditForm((f: any) => ({ ...f, rdpEnabled: e.target.checked }))} />
                                Enable RDP
                              </label>
                              <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--color-text-secondary)", cursor: "pointer" }}>
                                <input type="checkbox" checked={assetEditForm.vncEnabled ?? false} onChange={e => setAssetEditForm((f: any) => ({ ...f, vncEnabled: e.target.checked }))} />
                                Enable VNC
                              </label>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "10px" }}>
                              {assetEditForm.rdpEnabled && <>
                                <div>
                                  <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>RDP Host (blank = IP)</label>
                                  <input value={assetEditForm.rdpHost ?? ""} onChange={e => setAssetEditForm((f: any) => ({ ...f, rdpHost: e.target.value }))} placeholder="e.g. 192.168.1.10"
                                    style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }} />
                                </div>
                                <div>
                                  <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>RDP Port</label>
                                  <input type="number" value={assetEditForm.rdpPort ?? "3389"} onChange={e => setAssetEditForm((f: any) => ({ ...f, rdpPort: e.target.value }))} placeholder="3389"
                                    style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }} />
                                </div>
                              </>}
                              {assetEditForm.vncEnabled && <>
                                <div>
                                  <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>VNC Host (blank = IP)</label>
                                  <input value={assetEditForm.vncHost ?? ""} onChange={e => setAssetEditForm((f: any) => ({ ...f, vncHost: e.target.value }))} placeholder="e.g. 192.168.1.10"
                                    style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }} />
                                </div>
                                <div>
                                  <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>VNC Port</label>
                                  <input type="number" value={assetEditForm.vncPort ?? "5900"} onChange={e => setAssetEditForm((f: any) => ({ ...f, vncPort: e.target.value }))} placeholder="5900"
                                    style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }} />
                                </div>
                              </>}
                            </div>
                          </div>
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
                              <option value="RETIRED">Retired</option>
                              <option value="IN_REPAIR">In Repair</option>
                              <option value="IN_STORAGE">In Storage</option>
                              <option value="STOLEN">Stolen</option>
                              <option value="LOST">Lost</option>
                              <option value="DISPOSED">Disposed</option>
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
                      <div key={asset.id}>
                      <div style={{
                        display: "grid", gridTemplateColumns: "1fr 160px 100px 120px 80px 1fr",
                        padding: "10px 16px", background: "var(--color-background-primary)",
                        borderBottom: expandedAssetHistory[asset.id] !== undefined ? "none" : (i < assetsByType[key].length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none"),
                        alignItems: "center",
                      }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span
                              onClick={() => router.push(`/assets/${asset.id}`)}
                              style={{ fontSize: "14px", fontWeight: 500, cursor: "pointer" }}
                              onMouseEnter={e => (e.currentTarget.style.textDecoration = "underline")}
                              onMouseLeave={e => (e.currentTarget.style.textDecoration = "none")}
                            >
                              {asset.friendlyName || asset.name}
                            </span>
                            {boundSourceTag(asset.dataSource, asset.syncroAssetId)}
                          </div>
                          {asset.friendlyName && asset.friendlyName !== asset.name && (
                            <div style={{ fontSize: "11px", color: "var(--color-text-muted)", fontFamily: "monospace" }}>{asset.name}</div>
                          )}
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
                            {statusLabel[asset.status] ?? asset.status}
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                          <button
                            onClick={() => toggleAssetFavorite(asset.id, asset.isFavorite)}
                            title={asset.isFavorite ? "Remove from dashboard" : "Pin to dashboard"}
                            style={{ fontSize: "14px", background: "none", border: "none", cursor: "pointer", padding: "0 2px", lineHeight: 1, color: asset.isFavorite ? "#f59e0b" : "var(--color-text-muted)" }}
                          >★</button>
                          {asset.splashtopUrl && (
                            <a href={asset.splashtopUrl} title="Launch Splashtop" style={{ fontSize: "11px", padding: "2px 7px", borderRadius: "5px", border: "0.5px solid var(--color-border-secondary)", color: "var(--color-text-secondary)", textDecoration: "none", whiteSpace: "nowrap" }}>
                              Splashtop
                            </a>
                          )}
                          {asset.rdpEnabled && (
                            <a href={`/api/assets/${asset.id}/rdp`} title="Download RDP file" style={{ fontSize: "11px", padding: "2px 7px", borderRadius: "5px", border: "0.5px solid var(--color-border-secondary)", color: "var(--color-text-secondary)", textDecoration: "none" }}>
                              RDP
                            </a>
                          )}
                          {asset.vncEnabled && (
                            <a href={`vnc://${asset.vncHost || asset.ipAddress}:${asset.vncPort ?? 5900}`} title="Launch VNC" style={{ fontSize: "11px", padding: "2px 7px", borderRadius: "5px", border: "0.5px solid var(--color-border-secondary)", color: "var(--color-text-secondary)", textDecoration: "none" }}>
                              VNC
                            </a>
                          )}
                          {asset.managementUrl && (
                            <a href={asset.managementUrl} target="_blank" rel="noopener noreferrer" title="Open Management UI" style={{ fontSize: "11px", padding: "2px 7px", borderRadius: "5px", border: "0.5px solid var(--color-border-secondary)", color: "var(--color-text-secondary)", textDecoration: "none", whiteSpace: "nowrap" }}>
                              Manage
                            </a>
                          )}
                          {asset.assetType?.template?.showSwitchPanel && (
                            <button onClick={() => { setSwitchPanelAsset({ id: asset.id, name: asset.friendlyName || asset.name }); if (vlans.length === 0) fetchVlans() }}
                              style={{ fontSize: "11px", padding: "2px 7px", borderRadius: "5px", border: "0.5px solid var(--color-border-secondary)", color: "var(--color-text-secondary)", background: "transparent", cursor: "pointer", whiteSpace: "nowrap" }}>
                              Ports{asset.portCount ? ` (${asset.portCount})` : ""}
                            </button>
                          )}
                          <button onClick={() => toggleAssetHistory(asset.id)} style={{ fontSize: "12px", color: loadingAssetHistory[asset.id] ? "var(--color-text-muted)" : "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                            {loadingAssetHistory[asset.id] ? "..." : expandedAssetHistory[asset.id] !== undefined ? "History ▲" : "History"}
                          </button>
                          <button onClick={() => { setEditingAsset(asset.id); if (assetTypes.length === 0) fetchAssetTypes(); setAssetEditForm({ name: asset.name, friendlyName: asset.friendlyName ?? "", make: asset.make ?? "", model: asset.model ?? "", serial: asset.serial ?? "", ipAddress: asset.ipAddress ?? "", macAddress: asset.macAddress ?? "", managementUrl: asset.managementUrl ?? "", notes: asset.notes ?? "", assetTypeId: asset.assetTypeId ?? "", status: asset.status, primaryUserId: asset.primaryUserId ?? "", contactId: asset.contactId ?? "", rdpEnabled: asset.rdpEnabled, rdpHost: asset.rdpHost ?? "", rdpPort: asset.rdpPort ?? "", vncEnabled: asset.vncEnabled, vncHost: asset.vncHost ?? "", vncPort: asset.vncPort ?? "" }) }} style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Edit</button>
                        </div>
                      </div>
                      {expandedAssetHistory[asset.id] !== undefined && (
                        <div style={{ padding: "8px 16px 12px", borderTop: "0.5px solid var(--color-border-tertiary)", borderBottom: i < assetsByType[key].length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none", background: "var(--color-background-primary)" }}>
                          {expandedAssetHistory[asset.id]!.length === 0 ? (
                            <div style={{ fontSize: "12px", color: "var(--color-text-muted)", fontStyle: "italic" }}>No history recorded yet.</div>
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                              {expandedAssetHistory[asset.id]!.map((h: any) => (
                                <div key={h.id} style={{ display: "flex", gap: "10px", fontSize: "12px", color: "var(--color-text-secondary)" }}>
                                  <span style={{ color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>{new Date(h.changedAt).toLocaleString()}</span>
                                  <span style={{ fontWeight: 500, color: "var(--color-text-primary)" }}>{h.field}</span>
                                  <span>{h.oldValue ?? "—"} → {h.newValue ?? "—"}</span>
                                  {h.changedBy && <span style={{ color: "var(--color-text-muted)" }}>by {h.changedBy}</span>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
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
                  { key: "totp", label: "MFA / TOTP seed (optional)", placeholder: "Base32 secret from authenticator app" },
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
                <div style={{ marginBottom: "12px" }}>
                  <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>Expiry date (optional)</label>
                  <input type="date" value={credForm.expiryDate} onChange={e => setCredForm(f => ({ ...f, expiryDate: e.target.value }))}
                    style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }} />
                </div>
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
            ) : credentials.map(cred => {
              const isEditing = editingCredId === cred.id
              const historyOpen = cred.id in expandedCredHistory
              const credHistory = expandedCredHistory[cred.id] ?? []
              const inpStyle = { width: "100%", padding: "7px 10px", fontSize: "13px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "7px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }
              return (
                <div key={cred.id} style={{
                  background: "var(--color-background-secondary)",
                  border: "0.5px solid var(--color-border-tertiary)",
                  borderRadius: "10px", padding: "16px", marginBottom: "10px",
                }}>
                  {/* Header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div style={{ fontSize: "14px", fontWeight: 500 }}>{cred.label}</div>
                      {boundSourceTag(cred.dataSource)}
                      {cred.user && (
                        <span onClick={() => { setActiveTab("Users"); selectUser(cred.user.id) }} style={{ fontSize: "11px", color: "var(--color-text-secondary)", background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: "4px", padding: "1px 6px", cursor: "pointer" }}>
                          {cred.user.name}
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                      <button
                        onClick={() => toggleCredFavorite(cred.id, cred.isFavorite)}
                        title={cred.isFavorite ? "Remove from dashboard" : "Pin to dashboard"}
                        style={{ fontSize: "16px", background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 1, color: cred.isFavorite ? "#f59e0b" : "var(--color-text-muted)" }}
                      >★</button>
                      {!isEditing && (
                        <button
                          onClick={() => {
                            setEditingCredId(cred.id)
                            setCredEditForm({ label: cred.label, username: cred.username ?? "", password: "", totp: "", url: cred.url ?? "", notes: cred.notes ?? "", userId: cred.user?.id ?? "", contactId: cred.contact?.id ?? "", expiryDate: cred.expiryDate ? new Date(cred.expiryDate).toISOString().split("T")[0] : "" })
                          }}
                          style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                        >Edit</button>
                      )}
                      <button onClick={() => deleteCred(cred.id)} style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Retire</button>
                    </div>
                  </div>

                  {isEditing ? (
                    /* ── Edit form ── */
                    <div>
                      {[
                        { key: "label",    label: "Label",               type: "text"     },
                        { key: "username", label: "Username",             type: "text"     },
                        { key: "password", label: "New password (blank = keep current)", type: "password" },
                        { key: "totp",     label: "TOTP seed (blank = keep current)",    type: "text"     },
                        { key: "url",      label: "URL",                  type: "text"     },
                        { key: "notes",    label: "Notes",                type: "text"     },
                      ].map(({ key, label, type }) => (
                        <div key={key} style={{ marginBottom: "8px" }}>
                          <label style={{ fontSize: "12px", color: "var(--color-text-secondary)", display: "block", marginBottom: "3px" }}>{label}</label>
                          <input type={type} value={credEditForm[key] ?? ""} onChange={e => setCredEditForm((f: any) => ({ ...f, [key]: e.target.value }))} style={inpStyle} />
                        </div>
                      ))}
                      {client && client.users.length > 0 && (
                        <div style={{ marginBottom: "8px" }}>
                          <label style={{ fontSize: "12px", color: "var(--color-text-secondary)", display: "block", marginBottom: "3px" }}>Linked user</label>
                          <select value={credEditForm.userId ?? ""} onChange={e => setCredEditForm((f: any) => ({ ...f, userId: e.target.value }))} style={inpStyle}>
                            <option value="">None</option>
                            {client.users.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
                          </select>
                        </div>
                      )}
                      <div style={{ marginBottom: "10px" }}>
                        <label style={{ fontSize: "12px", color: "var(--color-text-secondary)", display: "block", marginBottom: "3px" }}>Expiry date</label>
                        <input type="date" value={credEditForm.expiryDate ?? ""} onChange={e => setCredEditForm((f: any) => ({ ...f, expiryDate: e.target.value }))} style={{ ...inpStyle, width: "auto" }} />
                      </div>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button onClick={() => updateCred(cred.id)} disabled={savingCredEdit} style={{ fontSize: "13px", fontWeight: 500, padding: "7px 14px", borderRadius: "7px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>
                          {savingCredEdit ? "Saving..." : "Save"}
                        </button>
                        <button onClick={() => setEditingCredId(null)} style={{ fontSize: "13px", padding: "7px 14px", borderRadius: "7px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    /* ── View mode ── */
                    <>
                      {cred.username && (
                        <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "4px" }}>
                          <span style={{ fontSize: "12px", color: "var(--color-text-secondary)", width: "80px" }}>Username</span>
                          <span style={{ fontSize: "13px", fontFamily: "monospace" }}>{cred.username}</span>
                          <button
                            onClick={() => { navigator.clipboard.writeText(cred.username); flashCopied(cred.id, "username") }}
                            style={{ fontSize: "11px", color: copiedCreds[cred.id] === "username" ? "#22c55e" : "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                          >{copiedCreds[cred.id] === "username" ? "Copied!" : "Copy"}</button>
                        </div>
                      )}
                      {cred.hasPassword && (
                        <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "4px" }}>
                          <span style={{ fontSize: "12px", color: "var(--color-text-secondary)", width: "80px" }}>Password</span>
                          <span style={{ fontSize: "13px", fontFamily: "monospace" }}>{revealedPasswords[cred.id] ?? "••••••••••••"}</span>
                          <button
                            onClick={() => copyPassword(cred.id)}
                            style={{ fontSize: "11px", color: copiedCreds[cred.id] === "password" ? "#22c55e" : "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                          >{copiedCreds[cred.id] === "password" ? "Copied!" : "Copy"}</button>
                          <button onClick={() => revealPassword(cred.id)} style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>{revealedPasswords[cred.id] ? "Hide" : "Show"}</button>
                        </div>
                      )}
                      {cred.hasTotp && (
                        <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "4px" }}>
                          <span style={{ fontSize: "12px", color: "var(--color-text-secondary)", width: "80px" }}>MFA</span>
                          {revealedTotps[cred.id] ? (
                            <>
                              <span style={{ fontSize: "15px", fontFamily: "monospace", fontWeight: 700, letterSpacing: "3px", color: totpSecondsLeft <= 5 ? "#f59e0b" : "#10b981" }}>{revealedTotps[cred.id].code}</span>
                              <span style={{ fontSize: "11px", color: totpSecondsLeft <= 5 ? "#f59e0b" : "var(--color-text-muted)", fontFamily: "monospace", minWidth: "28px" }}>{totpSecondsLeft}s</span>
                              <span style={{ fontSize: "11px", color: "var(--color-text-muted)", fontFamily: "monospace" }}>· {revealedTotps[cred.id].seed}</span>
                              <button
                                onClick={() => copyTotpCode(cred.id)}
                                style={{ fontSize: "11px", color: copiedCreds[cred.id] === "totp" ? "#22c55e" : "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                              >{copiedCreds[cred.id] === "totp" ? "Copied!" : "Copy"}</button>
                              <button onClick={() => revealTotp(cred.id)} style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Hide</button>
                            </>
                          ) : (
                            <>
                              <span style={{ fontSize: "13px", fontFamily: "monospace", letterSpacing: "3px" }}>••••••</span>
                              <button
                                onClick={() => copyTotpCode(cred.id)}
                                style={{ fontSize: "11px", color: copiedCreds[cred.id] === "totp" ? "#22c55e" : "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                              >{copiedCreds[cred.id] === "totp" ? "Copied!" : "Copy code"}</button>
                              <button onClick={() => revealTotp(cred.id)} style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Show</button>
                            </>
                          )}
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

                      {/* History */}
                      <div style={{ marginTop: "10px", borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: "8px" }}>
                        <button
                          onClick={() => toggleCredHistory(cred.id)}
                          style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                        >
                          {historyOpen ? "Hide history" : "History"}
                        </button>
                        {historyOpen && (
                          <div style={{ marginTop: "8px" }}>
                            {loadingCredHistory[cred.id] ? (
                              <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>Loading...</div>
                            ) : credHistory.length === 0 ? (
                              <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>No history recorded yet.</div>
                            ) : credHistory.map((h: any) => (
                              <div key={h.id} style={{ display: "flex", gap: "12px", padding: "4px 0", borderBottom: "0.5px solid var(--color-border-tertiary)", alignItems: "baseline" }}>
                                <span style={{ fontSize: "11px", color: "var(--color-text-muted)", flexShrink: 0, width: "130px" }}>
                                  {new Date(h.changedAt).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                                </span>
                                <span style={{ fontSize: "11px", color: "var(--color-text-secondary)", flexShrink: 0, width: "100px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.changedBy ?? "unknown"}</span>
                                <span style={{ fontSize: "12px", color: "var(--color-text-primary)" }}>
                                  {h.field === "password"
                                    ? "password rotated"
                                    : `${h.field}: ${h.oldValue ?? "—"} → ${h.newValue ?? "—"}`}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {activeTab === "Licenses" && (
          <div style={{ maxWidth: "900px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <button onClick={() => { const next = !showArchivedLicenses; setShowArchivedLicenses(next); fetchLicenses(next) }} style={{ fontSize: "13px", padding: "6px 12px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: showArchivedLicenses ? "rgba(61,111,255,0.1)" : "transparent", cursor: "pointer", color: showArchivedLicenses ? "var(--accent)" : "var(--color-text-secondary)" }}>
                {showArchivedLicenses ? "Hide archived" : "Show archived"}
              </button>
              <button onClick={() => setShowAddLicense(true)} style={{ fontSize: "14px", fontWeight: 500, padding: "8px 16px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: "pointer" }}>Add license</button>
            </div>
            {showAddLicense && (
              <div style={{ background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: "10px", padding: "20px", marginBottom: "16px" }}>
                <div style={{ fontSize: "15px", fontWeight: 500, marginBottom: "16px" }}>New license</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>Name *</label>
                    <input value={licenseForm.name} onChange={e => setLicenseForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Microsoft 365 Business"
                      style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }} />
                  </div>
                  <div>
                    <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>Vendor (global)</label>
                    <select value={licenseForm.vendorId} onChange={e => setLicenseForm(f => ({ ...f, vendorId: e.target.value }))} style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }}>
                      <option value="">Select vendor...</option>
                      {vendorsList.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>Vendor (freetext)</label>
                    <input value={licenseForm.vendor} onChange={e => setLicenseForm(f => ({ ...f, vendor: e.target.value }))} placeholder="If not in list above"
                      style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }} />
                  </div>
                  <div>
                    <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>License key</label>
                    <input value={licenseForm.licenseKey} onChange={e => setLicenseForm(f => ({ ...f, licenseKey: e.target.value }))} placeholder="Will be encrypted"
                      style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }} />
                  </div>
                  <div>
                    <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>Total seats</label>
                    <input value={licenseForm.seats} onChange={e => setLicenseForm(f => ({ ...f, seats: e.target.value }))} placeholder="e.g. 25"
                      style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }} />
                  </div>
                  <div>
                    <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>Assigned seats</label>
                    <input value={licenseForm.assignedSeats} onChange={e => setLicenseForm(f => ({ ...f, assignedSeats: e.target.value }))}
                      style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }} />
                  </div>
                  <div>
                    <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>Cost ($/mo)</label>
                    <input value={licenseForm.cost} onChange={e => setLicenseForm(f => ({ ...f, cost: e.target.value }))}
                      style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }} />
                  </div>
                  <div>
                    <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>Purchase date</label>
                    <input type="date" value={licenseForm.purchaseDate} onChange={e => setLicenseForm(f => ({ ...f, purchaseDate: e.target.value }))}
                      style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }} />
                  </div>
                  <div>
                    <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>Expiry date</label>
                    <input type="date" value={licenseForm.expiryDate} onChange={e => setLicenseForm(f => ({ ...f, expiryDate: e.target.value }))}
                      style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }} />
                  </div>
                  <div>
                    <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>Renewal date</label>
                    <input type="date" value={licenseForm.renewalDate} onChange={e => setLicenseForm(f => ({ ...f, renewalDate: e.target.value }))}
                      style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }} />
                  </div>
                  <div>
                    <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>Assigned user</label>
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
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>Notes</label>
                    <input value={licenseForm.notes} onChange={e => setLicenseForm(f => ({ ...f, notes: e.target.value }))}
                      style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }} />
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
                <div style={{ display: "grid", gridTemplateColumns: "1.5fr 120px 80px 100px 100px 80px", padding: "10px 16px", background: "var(--color-background-secondary)", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                  {["Name", "Vendor", "Seats", "Expiry", "Renewal", ""].map(h => (
                    <div key={h} style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-secondary)" }}>{h}</div>
                  ))}
                </div>
                {licenses.map((lic, i) => editingLicense === lic.id ? (
                  <div key={lic.id} style={{ padding: "14px 16px", borderBottom: i < licenses.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none", background: "var(--color-background-primary)" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
                      {[
                        { key: "name", label: "Name" }, { key: "vendor", label: "Vendor (freetext)" },
                        { key: "seats", label: "Total seats" }, { key: "assignedSeats", label: "Assigned seats" },
                        { key: "cost", label: "Cost ($/mo)" }, { key: "purchaseDate", label: "Purchase date", type: "date" },
                        { key: "expiryDate", label: "Expiry", type: "date" }, { key: "renewalDate", label: "Renewal", type: "date" },
                      ].map(({ key, label, type }) => (
                        <div key={key}>
                          <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>{label}</label>
                          <input type={type ?? "text"} value={licenseEditForm[key] ?? ""} onChange={e => setLicenseEditForm((f: any) => ({ ...f, [key]: e.target.value }))}
                            style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }} />
                        </div>
                      ))}
                      <div>
                        <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>Vendor (global)</label>
                        <select value={licenseEditForm.vendorId ?? ""} onChange={e => setLicenseEditForm((f: any) => ({ ...f, vendorId: e.target.value }))} style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }}>
                          <option value="">Select vendor...</option>
                          {vendorsList.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>Assigned user</label>
                        <select value={licenseEditForm.assignedUserId ?? ""} onChange={e => setLicenseEditForm((f: any) => ({ ...f, assignedUserId: e.target.value }))} style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }}>
                          <option value="">Unassigned</option>
                          {client.users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                      </div>
                      <div style={{ gridColumn: "1 / -1" }}>
                        <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>License key (leave blank to keep existing)</label>
                        <input value={licenseEditForm.newLicenseKey ?? ""} onChange={e => setLicenseEditForm((f: any) => ({ ...f, newLicenseKey: e.target.value, licenseKey: e.target.value }))} placeholder="Enter new key to replace..."
                          style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }} />
                      </div>
                      <div style={{ gridColumn: "1 / -1" }}>
                        <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>Notes</label>
                        <input value={licenseEditForm.notes ?? ""} onChange={e => setLicenseEditForm((f: any) => ({ ...f, notes: e.target.value }))}
                          style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }} />
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button onClick={() => updateLicense(lic.id)} style={{ fontSize: "13px", fontWeight: 500, padding: "6px 14px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>Save</button>
                      <button onClick={() => setEditingLicense(null)} style={{ fontSize: "13px", padding: "6px 14px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div key={lic.id} style={{ padding: "12px 16px", borderBottom: i < licenses.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none", background: lic.isActive ? "var(--color-background-primary)" : "var(--color-background-secondary)", opacity: lic.isActive ? 1 : 0.65 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1.5fr 120px 80px 100px 100px 80px", alignItems: "center", marginBottom: lic.licenseKey ? "8px" : 0 }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ fontSize: "14px", fontWeight: 500 }}>{lic.name}</span>
                          {!lic.isActive && <span style={{ fontSize: "10px", padding: "1px 5px", borderRadius: "4px", background: "#374151", color: "#9ca3af" }}>archived</span>}
                          {boundSourceTag(lic.dataSource, null, lic.pax8Id)}
                        </div>
                        {lic.notes && <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "2px" }}>{lic.notes}</div>}
                      </div>
                      <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>{lic.vendorRef?.name ?? lic.vendor ?? "—"}</div>
                      <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>
                        {lic.seats ? `${lic.assignedSeats ?? 0}/${lic.seats}` : "—"}
                      </div>
                      <div style={{ fontSize: "13px", color: lic.expiryDate && new Date(lic.expiryDate) < new Date() ? "var(--color-text-danger)" : "var(--color-text-secondary)" }}>
                        {lic.expiryDate ? new Date(lic.expiryDate).toLocaleDateString() : "—"}
                      </div>
                      <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>{lic.renewalDate ? new Date(lic.renewalDate).toLocaleDateString() : "—"}</div>
                      <div style={{ display: "flex", gap: "8px" }}>
                        {lic.isActive ? (
                          <>
                            <button onClick={() => { setEditingLicense(lic.id); setLicenseEditForm({ ...lic, expiryDate: lic.expiryDate ? lic.expiryDate.slice(0, 10) : "", renewalDate: lic.renewalDate ? lic.renewalDate.slice(0, 10) : "", purchaseDate: lic.purchaseDate ? lic.purchaseDate.slice(0, 10) : "", vendorId: lic.vendorRef?.id ?? "", assignedUserId: lic.assignedUser?.id ?? "", contactId: lic.contact?.id ?? "", newLicenseKey: "" }) }} style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Edit</button>
                            <button onClick={() => deleteLicense(lic.id)} style={{ fontSize: "12px", color: "var(--color-text-danger)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Archive</button>
                          </>
                        ) : (
                          <button onClick={() => restoreLicense(lic.id)} style={{ fontSize: "12px", color: "#22c55e", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Restore</button>
                        )}
                      </div>
                    </div>
                    {lic.licenseKey && (
                      <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "6px" }}>
                        <span style={{ fontSize: "12px", color: "var(--color-text-secondary)", width: "80px" }}>License key</span>
                        <span style={{ fontSize: "13px", fontFamily: "monospace", color: "var(--color-text-primary)" }}>
                          {revealedLicenseKeys[lic.id] !== undefined ? (revealedLicenseKeys[lic.id] || "(empty)") : "••••••••••••"}
                        </span>
                        <button onClick={() => revealLicenseKey(lic.id)} disabled={revealingKey === lic.id} style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                          {revealingKey === lic.id ? "..." : revealedLicenseKeys[lic.id] !== undefined ? "Hide" : "Reveal"}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "Subscriptions" && (
          <div style={{ maxWidth: "960px" }}>
            {loadingSubscriptions ? (
              <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>Loading...</div>
            ) : subscriptions.length === 0 ? (
              <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>No Pax8 subscriptions synced yet. Configure Pax8 in Settings and run a sync.</div>
            ) : (
              <>
                {/* Group by vendor */}
                {(() => {
                  const byVendor: Record<string, any[]> = {}
                  for (const sub of subscriptions) {
                    const v = sub.vendor ?? "Other"
                    if (!byVendor[v]) byVendor[v] = []
                    byVendor[v].push(sub)
                  }
                  return Object.entries(byVendor).sort(([a], [b]) => a.localeCompare(b)).map(([vendor, subs]) => (
                    <div key={vendor} style={{ marginBottom: "24px" }}>
                      <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{vendor}</div>
                      <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "10px", overflow: "hidden" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 100px 70px 90px 110px 160px", padding: "9px 16px", background: "var(--color-background-secondary)", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                          {["Product", "Status", "Qty", "$/mo", "Renewal", "Assigned To"].map(h => (
                            <div key={h} style={{ fontSize: "11px", fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</div>
                          ))}
                        </div>
                        {subs.map((sub, i) => {
                          const statusColor = sub.status === "Active" ? "#22c55e"
                            : sub.status === "Suspended" ? "#f59e0b"
                            : sub.status === "Trial" ? "#3b82f6"
                            : "#94a3b8"
                          return (
                            <div key={sub.id} style={{ display: "grid", gridTemplateColumns: "1.5fr 100px 70px 90px 110px 160px", padding: "11px 16px", borderBottom: i < subs.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none", background: "var(--color-background-primary)", alignItems: "center" }}>
                              <div>
                                <div style={{ fontSize: "14px", fontWeight: 500 }}>{sub.name}</div>
                                {sub.billingTerm && <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "2px" }}>{sub.billingTerm}</div>}
                              </div>
                              <div>
                                <span style={{ fontSize: "11px", padding: "2px 7px", borderRadius: "4px", background: `${statusColor}18`, color: statusColor, fontWeight: 500 }}>
                                  {sub.status ?? "—"}
                                </span>
                              </div>
                              <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>{sub.seats ?? "—"}</div>
                              <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>
                                {sub.cost != null ? `$${sub.cost.toFixed(2)}` : "—"}
                              </div>
                              <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>
                                {sub.renewalDate ? new Date(sub.renewalDate).toLocaleDateString() : "—"}
                              </div>
                              <div>
                                <select
                                  value={sub.assignedUser?.id ?? ""}
                                  onChange={e => assignSubUser(sub.id, e.target.value)}
                                  disabled={assigningSubUser === sub.id}
                                  style={{ width: "100%", fontSize: "12px", padding: "4px 8px", borderRadius: "6px", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-secondary)", color: "var(--color-text-primary)", cursor: "pointer" }}
                                >
                                  <option value="">Unassigned</option>
                                  {client.users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                                </select>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))
                })()}
                <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "8px" }}>
                  {subscriptions.length} subscription{subscriptions.length !== 1 ? "s" : ""} · Total $/mo: ${subscriptions.reduce((s, l) => s + (l.cost ?? 0), 0).toFixed(2)}
                </div>
              </>
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

        {activeTab === "Domains" && (
          <div style={{ maxWidth: "920px" }}>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px" }}>
              <button onClick={() => setShowAddWebsite(true)} style={{ fontSize: "14px", fontWeight: 500, padding: "8px 16px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: "pointer", color: "var(--color-text-primary)" }}>
                Add domain
              </button>
            </div>

            {showAddWebsite && (
              <div style={{ background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: "10px", padding: "20px", marginBottom: "16px" }}>
                <div style={{ fontSize: "15px", fontWeight: 500, marginBottom: "16px" }}>New domain</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                  <div>
                    <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>Domain *</label>
                    <input value={websiteForm.domain} onChange={e => setWebsiteForm(f => ({ ...f, domain: e.target.value }))} placeholder="example.com" autoFocus
                      style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }} />
                  </div>
                  <div>
                    <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>Label</label>
                    <input value={websiteForm.label} onChange={e => setWebsiteForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. Main site"
                      style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }} />
                  </div>
                  <div>
                    <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>Registrar</label>
                    <input value={websiteForm.registrar} onChange={e => setWebsiteForm(f => ({ ...f, registrar: e.target.value }))} placeholder="e.g. GoDaddy"
                      style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }} />
                  </div>
                  <div>
                    <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>Registrar URL</label>
                    <input value={websiteForm.registrarUrl} onChange={e => setWebsiteForm(f => ({ ...f, registrarUrl: e.target.value }))} placeholder="https://..."
                      style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }} />
                  </div>
                  <div>
                    <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>Account number</label>
                    <input value={websiteForm.accountNumber} onChange={e => setWebsiteForm(f => ({ ...f, accountNumber: e.target.value }))}
                      style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", paddingTop: "20px" }}>
                    <input type="checkbox" id="autoRenew" checked={websiteForm.autoRenew} onChange={e => setWebsiteForm(f => ({ ...f, autoRenew: e.target.checked }))} />
                    <label htmlFor="autoRenew" style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>Auto-renews</label>
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>Notes</label>
                    <input value={websiteForm.notes} onChange={e => setWebsiteForm(f => ({ ...f, notes: e.target.value }))}
                      style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }} />
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
              <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>No domains yet. Add a domain to start monitoring expiry, SSL, and DNS.</div>
            ) : (
              <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "10px", overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 140px 140px 130px", padding: "10px 16px", background: "var(--color-background-secondary)", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                  {["Domain", "Domain expiry", "SSL expiry", "Registrar", ""].map(h => (
                    <div key={h} style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-secondary)" }}>{h}</div>
                  ))}
                </div>
                {websites.map((site, i) => {
                  const domainBadge = expiryBadge(site.expiresAt)
                  const sslBadge = expiryBadge(site.sslExpiresAt)
                  const dns = site.dnsRecords as Record<string, any> | null
                  const dnsOpen = expandedDns[site.id]
                  const isChecking = checkingWebsite === site.id
                  const showExtra = dnsOpen || editingWebsite === site.id
                  const borderBottom = i < websites.length - 1 || showExtra ? "0.5px solid var(--color-border-tertiary)" : "none"
                  return (
                    <div key={site.id}>
                      {editingWebsite === site.id ? (
                        <div style={{ padding: "14px 16px", borderBottom, background: "var(--color-background-primary)" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
                            {[
                              { key: "label", label: "Label" },
                              { key: "registrar", label: "Registrar" },
                              { key: "registrarUrl", label: "Registrar URL" },
                              { key: "accountNumber", label: "Account number" },
                              { key: "notes", label: "Notes" },
                            ].map(({ key, label }) => (
                              <div key={key} style={key === "notes" ? { gridColumn: "1 / -1" } : {}}>
                                <label style={{ fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }}>{label}</label>
                                <input value={websiteEditForm[key] ?? ""} onChange={e => setWebsiteEditForm((f: any) => ({ ...f, [key]: e.target.value }))}
                                  style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }} />
                              </div>
                            ))}
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <input type="checkbox" checked={websiteEditForm.autoRenew ?? false} onChange={e => setWebsiteEditForm((f: any) => ({ ...f, autoRenew: e.target.checked }))} />
                              <label style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>Auto-renews</label>
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: "8px" }}>
                            <button onClick={() => updateWebsite(site.id)} style={{ fontSize: "13px", fontWeight: 500, padding: "6px 14px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>Save</button>
                            <button onClick={() => setEditingWebsite(null)} style={{ fontSize: "13px", padding: "6px 14px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 140px 140px 130px", padding: "12px 16px", borderBottom, background: "var(--color-background-primary)", alignItems: "center" }}>
                          <div>
                            <div style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-text-primary)" }}>{site.domain}</div>
                            {site.label && <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "2px" }}>{site.label}</div>}
                            {site.autoRenew && <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "2px" }}>Auto-renews</div>}
                          </div>
                          <div>
                            <span style={{ fontSize: "12px", padding: "3px 8px", borderRadius: "6px", background: domainBadge.bg, color: domainBadge.color, fontWeight: 500 }}>
                              {domainBadge.label}
                            </span>
                            {site.expiresAt && (
                              <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "4px" }}>
                                {new Date(site.expiresAt).toLocaleDateString()}
                              </div>
                            )}
                          </div>
                          <div>
                            {site.sslExpiresAt ? (
                              <>
                                <span style={{ fontSize: "12px", padding: "3px 8px", borderRadius: "6px", background: sslBadge.bg, color: sslBadge.color, fontWeight: 500 }}>
                                  {sslBadge.label}
                                </span>
                                <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "4px" }}>
                                  {new Date(site.sslExpiresAt).toLocaleDateString()}
                                </div>
                              </>
                            ) : <span style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>—</span>}
                          </div>
                          <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>
                            {site.registrarUrl ? (
                              <a href={site.registrarUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-text-secondary)" }}>{site.registrar ?? "Portal"}</a>
                            ) : site.registrar ?? "—"}
                          </div>
                          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                            <button onClick={() => checkWebsite(site.id)} disabled={isChecking} style={{ fontSize: "12px", color: "var(--color-accent)", background: "none", border: "none", cursor: isChecking ? "not-allowed" : "pointer", padding: 0, opacity: isChecking ? 0.5 : 1 }}>
                              {isChecking ? "Checking..." : "Check"}
                            </button>
                            <button onClick={() => { setEditingWebsite(site.id); setWebsiteEditForm({ label: site.label ?? "", registrar: site.registrar ?? "", registrarUrl: site.registrarUrl ?? "", accountNumber: site.accountNumber ?? "", autoRenew: site.autoRenew ?? false, notes: site.notes ?? "" }) }} style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                              Edit
                            </button>
                            {dns && (
                              <button onClick={() => setExpandedDns(d => ({ ...d, [site.id]: !d[site.id] }))} style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                                DNS {dnsOpen ? "▲" : "▼"}
                              </button>
                            )}
                            <button onClick={() => deleteWebsite(site.id)} style={{ fontSize: "12px", color: "var(--color-text-danger)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Remove</button>
                          </div>
                        </div>
                      )}
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

        {activeTab === "Network" && (
          <div style={{ maxWidth: "960px" }}>
            {/* Network sub-tabs */}
            <div style={{ display: "flex", gap: "4px", marginBottom: "24px", borderBottom: "0.5px solid var(--color-border-tertiary)", paddingBottom: "0" }}>
              {(["ipam", "racks", "wireless", "ptp", "shares", "diagram"] as const).map(t => (
                <button key={t} onClick={() => setNetworkSubTab(t)} style={{
                  fontSize: "13px", fontWeight: networkSubTab === t ? 600 : 400,
                  padding: "8px 16px", border: "none", background: "transparent", cursor: "pointer",
                  color: networkSubTab === t ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                  borderBottom: networkSubTab === t ? "2px solid var(--color-text-primary)" : "2px solid transparent",
                  marginBottom: "-1px",
                }}>
                  {t === "ipam" ? "IPAM" : t === "racks" ? "Rack Diagrams" : t === "wireless" ? "Wireless" : t === "ptp" ? "PTP Bridges" : t === "shares" ? "File Shares" : "Topology Diagram"}
                </button>
              ))}
            </div>


            {/* IPAM sub-tab */}
            {networkSubTab === "ipam" && (
              <div>
                {loadingSubnets ? (
                  <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>Loading...</div>
                ) : (
                  <IpamPanel
                    subnets={subnets}
                    locations={client.locations}
                    assets={assets}
                    users={client.users}
                    clientId={id as string}
                    onSubnetsChange={setSubnets}
                  />
                )}
              </div>
            )}

            {/* Racks sub-tab */}
            {networkSubTab === "racks" && (
              <div>
                {loadingRacks ? (
                  <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>Loading...</div>
                ) : (
                  <RackDiagram
                    racks={racks}
                    locations={client.locations}
                    networkDevices={networkDevices}
                    assets={assets}
                    clientId={id as string}
                    onRacksChange={setRacks}
                  />
                )}
              </div>
            )}

            {/* File Shares sub-tab */}
            {networkSubTab === "wireless" && (
              <div>
                {loadingWifi ? (
                  <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>Loading...</div>
                ) : (
                  <WifiPanel
                    controllers={wifiControllers}
                    assets={assets}
                    networkDevices={networkDevices}
                    subnets={subnets}
                    credentials={phoneCredentials}
                    clientId={id as string}
                    onControllersChange={setWifiControllers}
                  />
                )}
              </div>
            )}

            {networkSubTab === "ptp" && (
              <div>
                {loadingPtp ? (
                  <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>Loading...</div>
                ) : (
                  <PtpPanel
                    links={ptpLinks}
                    locations={client.locations}
                    credentials={phoneCredentials}
                    clientId={id as string}
                    onLinksChange={setPtpLinks}
                  />
                )}
              </div>
            )}

            {networkSubTab === "shares" && (
              <div>
                {loadingShares ? (
                  <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>Loading...</div>
                ) : (
                  <FileSharesPanel
                    domains={adDomains}
                    shares={clientShares}
                    assets={assets}
                    clientId={id as string}
                    onDomainsChange={setAdDomains}
                    onSharesChange={setClientShares}
                  />
                )}
              </div>
            )}

            {networkSubTab === "diagram" && (
              <NetworkDiagramPanel clientId={id as string} />
            )}
          </div>
        )}

        {/* Switch port panel overlay — asset-based (new) */}
        {switchPanelAsset && (
          <SwitchPanel
            clientId={id as string}
            assetId={switchPanelAsset.id}
            deviceName={switchPanelAsset.name}
            vlans={vlans}
            onVlansChange={setVlans}
            assets={assets.map((a: any) => ({ id: a.id, name: a.name, friendlyName: a.friendlyName, category: a.category, macAddress: a.macAddress ?? null, interfaces: a.interfaces ?? [] }))}
            onClose={() => setSwitchPanelAsset(null)}
          />
        )}

        {/* Switch port panel overlay — device-based (legacy NetworkDevices) */}
        {switchPanelDevice && (
          <SwitchPanel
            clientId={id as string}
            deviceId={switchPanelDevice.id}
            deviceName={switchPanelDevice.name}
            vlans={vlans}
            onVlansChange={setVlans}
            assets={assets.map((a: any) => ({ id: a.id, name: a.name, friendlyName: a.friendlyName, category: a.category, macAddress: a.macAddress ?? null, interfaces: a.interfaces ?? [] }))}
            onClose={() => setSwitchPanelDevice(null)}
          />
        )}

        {activeTab === "Remote Access" && (
          <div style={{ maxWidth: "960px" }}>
            {loadingVpn ? (
              <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>Loading...</div>
            ) : (
              <VpnPanel
                gateways={vpnGateways}
                assets={assets}
                networkDevices={networkDevices}
                clientUsers={client.users}
                vendors={vpnVendors}
                staffUsers={vpnStaffUsers}
                contacts={client.contacts}
                credentials={vpnCredentials}
                clientId={id as string}
                onGatewaysChange={setVpnGateways}
              />
            )}
          </div>
        )}

        {activeTab === "Phone System" && (
          <div style={{ maxWidth: "960px" }}>
            {loadingPhone ? (
              <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>Loading...</div>
            ) : (
              <PhonePanel
                systems={phoneSystems}
                assets={assets}
                clientUsers={client.users}
                credentials={phoneCredentials}
                vendors={vpnVendors}
                clientId={id as string}
                onSystemsChange={setPhoneSystems}
              />
            )}
          </div>
        )}

        {activeTab === "Cameras" && (
          <div style={{ maxWidth: "960px" }}>
            {loadingCameras ? (
              <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>Loading...</div>
            ) : (
              <CameraPanel
                systems={cameraSystems}
                assets={assets}
                credentials={phoneCredentials}
                clientId={id as string}
                onSystemsChange={setCameraSystems}
              />
            )}
          </div>
        )}

        {activeTab === "Documents" && (
          <div style={{ maxWidth: "820px" }}>
            {loadingDocs ? (
              <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>Loading...</div>
            ) : (
              <DocumentsPanel docs={clientDocs} clientId={id as string} onDocsChange={setClientDocs} />
            )}
          </div>
        )}

        {activeTab === "SOPs" && (
          <div style={{ maxWidth: "820px" }}>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px" }}>
              <a href={`/runbooks/new?clientId=${id}`} style={{ fontSize: "14px", fontWeight: 500, padding: "8px 16px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: "pointer", textDecoration: "none", color: "var(--color-text-primary)" }}>
                New SOP
              </a>
            </div>
            {loadingRunbooks ? (
              <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>Loading...</div>
            ) : clientRunbooks.length === 0 ? (
              <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>No SOPs yet for this client.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {clientRunbooks.map((rb: any) => (
                  <a key={rb.id} href={`/runbooks/${rb.id}`} style={{ textDecoration: "none", display: "block", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "10px", padding: "14px 18px", background: "var(--color-background-secondary)", color: "inherit" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "4px" }}>
                      <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-text-primary)" }}>{rb.title}</span>
                      {rb.category && (
                        <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "10px", background: rb.category.color + "22", color: rb.category.color, border: `1px solid ${rb.category.color}44` }}>{rb.category.name}</span>
                      )}
                    </div>
                    {rb.summary && <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginBottom: "6px" }}>{rb.summary}</div>}
                    <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                      {rb.steps.length > 0 && <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>{rb.steps.length} steps</span>}
                      {rb.tags.map((t: any) => <span key={t.tagId} style={{ fontSize: "11px", color: "var(--color-text-muted)", background: "var(--color-background-hover)", padding: "1px 6px", borderRadius: "4px" }}>#{t.tag.name}</span>)}
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "Portal" && (
          <PortalUsersPanel clientId={id as string} />
        )}

        {activeTab === "Portal Vault" && (
          <PortalVaultPanel clientId={id as string} />
        )}

        {activeTab === "Audit Trail" && (
          <div style={{ maxWidth: "680px" }}>
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
