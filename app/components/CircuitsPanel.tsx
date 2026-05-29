"use client"

import { useEffect, useMemo, useState } from "react"
import { parseCidr } from "@/lib/cidr"

type Loc = { id: string; name: string }
type AssetLite = { id: string; name: string; friendlyName?: string | null; category: string }
type VendorLite = { id: string; name: string; category?: string; supportPhone?: string | null; supportEmail?: string | null }
type CredentialLite = { id: string; label: string }
type SubnetLite = { id: string; cidr: string; gateway: string | null; dns1: string | null; dns2: string | null }

type Circuit = {
  id: string
  label: string
  circuitId: string | null
  accountNumber: string | null
  serviceType: string
  role: string
  status: string
  ispNameFallback: string | null
  supportPhone: string | null
  supportEmail: string | null
  portalUrl: string | null
  downloadMbps: number | null
  uploadMbps: number | null
  isSymmetric: boolean
  wanIp: string | null
  staticBlockCidr: string | null
  subnetMask: string | null
  gatewayIp: string | null
  usableStartIp: string | null
  usableEndIp: string | null
  dns1: string | null
  dns2: string | null
  ipv6PrefixCidr: string | null
  ipv6Gateway: string | null
  installDate: string | null
  contractStart: string | null
  contractEnd: string | null
  cancelDate: string | null
  monthlyCost: number | null
  notes: string | null
  legacyImported: boolean
  location: Loc | null
  vendor: VendorLite | null
  modemAsset: AssetLite | null
  edgeAsset: AssetLite | null
  subnet: SubnetLite | null
  credential: CredentialLite | null
}

type Props = {
  clientId: string
  locations: Loc[]
  assets: AssetLite[]
  subnets: SubnetLite[]
}

const input = { width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }
const label = { fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }
const sectionTitle = { fontSize: "11px", fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase" as const, letterSpacing: "0.05em", marginTop: "16px", marginBottom: "8px", paddingBottom: "6px", borderBottom: "0.5px solid var(--color-border-tertiary)" }
const monoChip = { fontSize: "11px", padding: "2px 6px", borderRadius: "4px", fontFamily: "monospace" }
const chip = { fontSize: "11px", padding: "2px 6px", borderRadius: "4px" }

const ROLE_CHIP: Record<string, React.CSSProperties> = {
  PRIMARY: { ...chip, background: "var(--color-accent-muted)", color: "var(--color-accent)" },
  FAILOVER: { ...chip, background: "var(--color-background-hover)", color: "var(--color-text-secondary)" },
  LOAD_BALANCED: { ...chip, background: "var(--color-background-hover)", color: "var(--color-text-secondary)" },
  OUT_OF_BAND: { ...chip, background: "var(--color-background-hover)", color: "var(--color-text-muted)" },
  GUEST: { ...chip, background: "var(--color-background-hover)", color: "var(--color-text-muted)" },
  OTHER: { ...chip, background: "var(--color-background-hover)", color: "var(--color-text-muted)" },
}
const STATUS_CHIP: Record<string, React.CSSProperties> = {
  PLANNED: { ...chip, background: "var(--color-background-hover)", color: "var(--color-text-secondary)" },
  ORDERED: { ...chip, background: "var(--color-background-warning)", color: "var(--color-text-warning)" },
  INSTALLING: { ...chip, background: "var(--color-background-warning)", color: "var(--color-text-warning)" },
  ACTIVE: { ...chip, background: "var(--color-background-success)", color: "var(--color-text-success)" },
  DEGRADED: { ...chip, background: "var(--color-background-warning)", color: "var(--color-text-warning)" },
  SUSPENDED: { ...chip, background: "var(--color-background-hover)", color: "var(--color-text-muted)" },
  CANCELLED: { ...chip, background: "var(--color-background-hover)", color: "var(--color-text-muted)" },
  RETIRED: { ...chip, background: "var(--color-background-hover)", color: "var(--color-text-muted)" },
}

const SERVICE_LABEL: Record<string, string> = {
  FIBER: "Fiber", CABLE: "Cable", DSL: "DSL", FIXED_WIRELESS: "Fixed Wireless",
  CELLULAR_LTE: "LTE", CELLULAR_5G: "5G", SATELLITE: "Satellite", T1: "T1",
  METRO_ETHERNET: "Metro Ethernet", MPLS: "MPLS", SDWAN_BROADBAND: "SD-WAN", OTHER: "Other",
}

const blankForm = {
  label: "", locationId: "", role: "PRIMARY", status: "ACTIVE", serviceType: "FIBER",
  circuitId: "", accountNumber: "", vendorId: "", ispNameFallback: "",
  supportPhone: "", supportEmail: "", portalUrl: "", credentialId: "",
  downloadMbps: "", uploadMbps: "", isSymmetric: false,
  wanIp: "", staticBlockCidr: "", subnetMask: "", gatewayIp: "",
  usableStartIp: "", usableEndIp: "", dns1: "", dns2: "",
  ipv6PrefixCidr: "", ipv6Gateway: "", subnetId: "",
  modemAssetId: "", edgeAssetId: "",
  installDate: "", contractStart: "", contractEnd: "", cancelDate: "",
  monthlyCost: "", notes: "",
}

function fmtMbps(d: number | null, u: number | null) {
  if (d == null && u == null) return null
  if (d != null && u != null) return `${d}/${u} Mbps`
  return `${d ?? u} Mbps`
}

function fmtDate(s: string | null) {
  if (!s) return null
  const d = new Date(s)
  if (isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

function isExpiringSoon(s: string | null): boolean {
  if (!s) return false
  const t = new Date(s).getTime()
  return t - Date.now() < 30 * 86_400_000 && t > Date.now()
}

export default function CircuitsPanel({ clientId, locations, assets, subnets }: Props) {
  const [circuits, setCircuits] = useState<Circuit[]>([])
  const [loading, setLoading] = useState(true)
  const [vendors, setVendors] = useState<VendorLite[]>([])
  const [credentials, setCredentials] = useState<CredentialLite[]>([])
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ ...blankForm })
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [legacyAvailable, setLegacyAvailable] = useState(false)
  const [promoting, setPromoting] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        const [cRes, vRes, creds] = await Promise.all([
          fetch(`/api/clients/${clientId}/circuits`),
          fetch(`/api/vendors`),
          fetch(`/api/clients/${clientId}/credentials`),
        ])
        if (cancelled) return
        if (cRes.ok) setCircuits(await cRes.json())
        if (vRes.ok) {
          const all = await vRes.json()
          setVendors(all.filter((v: any) => v.category === "ISP"))
        }
        if (creds.ok) {
          const all = await creds.json()
          setCredentials(all.map((c: any) => ({ id: c.id, label: c.label })))
        }
        // Detect any legacy ispName/wanIp present on this client's locations
        const locRes = await fetch(`/api/clients/${clientId}/locations`)
        if (locRes.ok) {
          const locs = await locRes.json()
          setLegacyAvailable(locs.some((l: any) => (l.ispName || l.wanIp) && !l.circuitsLegacyPromoted))
        }
      } finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [clientId])

  const isps = vendors // already filtered

  const { active, archived } = useMemo(() => {
    const a: Circuit[] = []
    const z: Circuit[] = []
    for (const c of circuits) {
      if (c.status === "CANCELLED" || c.status === "RETIRED") z.push(c); else a.push(c)
    }
    return { active: a, archived: z }
  }, [circuits])

  function setF<K extends keyof typeof blankForm>(k: K, v: any) {
    setForm(f => ({ ...f, [k]: v }))
  }

  function onCidrChange(value: string) {
    setF("staticBlockCidr", value)
    const parsed = parseCidr(value)
    if (parsed) {
      setForm(f => ({
        ...f,
        staticBlockCidr: parsed.cidr,
        subnetMask: f.subnetMask || parsed.subnetMask,
        gatewayIp: f.gatewayIp || parsed.gatewayCandidate || "",
        usableStartIp: f.usableStartIp || parsed.usableStartIp || "",
        usableEndIp: f.usableEndIp || parsed.usableEndIp || "",
      }))
    }
  }

  // Linking an IPAM subnet pulls its documented gateway/DNS into the circuit —
  // fills blanks only, never clobbers values the tech already typed (relate, don't retype).
  function onSubnetChange(subnetId: string) {
    const s = subnets.find(x => x.id === subnetId)
    setForm(f => ({
      ...f,
      subnetId,
      ...(s && {
        gatewayIp: f.gatewayIp || s.gateway || "",
        dns1: f.dns1 || s.dns1 || "",
        dns2: f.dns2 || s.dns2 || "",
      }),
    }))
  }

  async function save() {
    if (!form.label.trim() || !form.locationId) return
    setSaving(true); setServerError(null)
    try {
      const endpoint = editingId
        ? `/api/clients/${clientId}/circuits/${editingId}`
        : `/api/clients/${clientId}/circuits`
      const method = editingId ? "PATCH" : "POST"
      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          downloadMbps: form.downloadMbps === "" ? null : Number(form.downloadMbps),
          uploadMbps: form.uploadMbps === "" ? null : Number(form.uploadMbps),
          monthlyCost: form.monthlyCost === "" ? null : Number(form.monthlyCost),
          installDate: form.installDate || null,
          contractStart: form.contractStart || null,
          contractEnd: form.contractEnd || null,
          cancelDate: form.cancelDate || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setServerError(err.error ?? "Save failed")
        return
      }
      const saved = await res.json()
      setCircuits(prev => editingId ? prev.map(c => c.id === saved.id ? saved : c) : [...prev, saved])
      setShowAdd(false); setEditingId(null); setForm({ ...blankForm })
    } finally { setSaving(false) }
  }

  async function remove(id: string) {
    if (!confirm("Delete this circuit? This cannot be undone.")) return
    const res = await fetch(`/api/clients/${clientId}/circuits/${id}`, { method: "DELETE" })
    if (res.ok) setCircuits(prev => prev.filter(c => c.id !== id))
  }

  async function quickToggleRole(c: Circuit) {
    const nextRole = c.role === "PRIMARY" ? "FAILOVER" : "PRIMARY"
    const res = await fetch(`/api/clients/${clientId}/circuits/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: nextRole }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      alert(err.error ?? "Could not change role")
      return
    }
    const saved = await res.json()
    setCircuits(prev => prev.map(x => x.id === saved.id ? saved : x))
  }

  function copyWanBlock(c: Circuit) {
    const lines: string[] = []
    if (c.wanIp) lines.push(`WAN IP:     ${c.wanIp}`)
    if (c.staticBlockCidr) lines.push(`Block:      ${c.staticBlockCidr}`)
    if (c.subnetMask) lines.push(`Mask:       ${c.subnetMask}`)
    if (c.gatewayIp) lines.push(`Gateway:    ${c.gatewayIp}`)
    if (c.usableStartIp || c.usableEndIp) lines.push(`Usable:     ${c.usableStartIp ?? "?"} – ${c.usableEndIp ?? "?"}`)
    if (c.dns1) lines.push(`DNS 1:      ${c.dns1}`)
    if (c.dns2) lines.push(`DNS 2:      ${c.dns2}`)
    if (lines.length === 0) return
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopied(c.id)
      setTimeout(() => setCopied(null), 1500)
    }).catch(() => {})
  }

  async function promoteLegacy() {
    if (!confirm("Create one circuit per location that still has legacy ISP/WAN fields? Safe to re-run.")) return
    setPromoting(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/circuits/promote-legacy`, { method: "POST" })
      if (res.ok) {
        const { promoted } = await res.json()
        const reload = await fetch(`/api/clients/${clientId}/circuits`)
        if (reload.ok) setCircuits(await reload.json())
        setLegacyAvailable(false)
        if (promoted === 0) alert("No legacy fields found to promote.")
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error ?? "Promote failed")
      }
    } finally { setPromoting(false) }
  }

  function startEdit(c: Circuit) {
    setEditingId(c.id)
    setShowAdd(true)
    setForm({
      label: c.label, locationId: c.location?.id ?? "", role: c.role, status: c.status,
      serviceType: c.serviceType, circuitId: c.circuitId ?? "", accountNumber: c.accountNumber ?? "",
      vendorId: c.vendor?.id ?? "", ispNameFallback: c.ispNameFallback ?? "",
      supportPhone: c.supportPhone ?? "", supportEmail: c.supportEmail ?? "", portalUrl: c.portalUrl ?? "",
      credentialId: c.credential?.id ?? "",
      downloadMbps: c.downloadMbps != null ? String(c.downloadMbps) : "",
      uploadMbps: c.uploadMbps != null ? String(c.uploadMbps) : "",
      isSymmetric: c.isSymmetric,
      wanIp: c.wanIp ?? "", staticBlockCidr: c.staticBlockCidr ?? "",
      subnetMask: c.subnetMask ?? "", gatewayIp: c.gatewayIp ?? "",
      usableStartIp: c.usableStartIp ?? "", usableEndIp: c.usableEndIp ?? "",
      dns1: c.dns1 ?? "", dns2: c.dns2 ?? "",
      ipv6PrefixCidr: c.ipv6PrefixCidr ?? "", ipv6Gateway: c.ipv6Gateway ?? "",
      subnetId: c.subnet?.id ?? "", modemAssetId: c.modemAsset?.id ?? "", edgeAssetId: c.edgeAsset?.id ?? "",
      installDate: fmtDate(c.installDate) ?? "", contractStart: fmtDate(c.contractStart) ?? "",
      contractEnd: fmtDate(c.contractEnd) ?? "", cancelDate: fmtDate(c.cancelDate) ?? "",
      monthlyCost: c.monthlyCost != null ? String(c.monthlyCost) : "",
      notes: c.notes ?? "",
    })
  }

  function renderForm() {
    return (
      <div style={{ background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: "10px", padding: "20px", marginBottom: "16px" }}>
        <div style={{ fontSize: "15px", fontWeight: 500, marginBottom: "16px" }}>{editingId ? "Edit circuit" : "New circuit"}</div>

        <div style={sectionTitle}>Service</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div><label style={label}>Label *</label><input autoFocus value={form.label} onChange={e => setF("label", e.target.value)} placeholder="e.g. Comcast Fiber – Main" style={input} /></div>
          <div><label style={label}>Location *</label>
            <select value={form.locationId} onChange={e => setF("locationId", e.target.value)} style={input}>
              <option value="">Select location…</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div><label style={label}>ISP Vendor</label>
            <select value={form.vendorId} onChange={e => setF("vendorId", e.target.value)} style={input}>
              <option value="">— or type fallback below —</option>
              {isps.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div><label style={label}>ISP name (if no vendor)</label><input value={form.ispNameFallback} onChange={e => setF("ispNameFallback", e.target.value)} placeholder="e.g. Comcast Business" style={input} /></div>
          <div><label style={label}>Service type</label>
            <select value={form.serviceType} onChange={e => setF("serviceType", e.target.value)} style={input}>
              {Object.entries(SERVICE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div><label style={label}>Role</label>
            <select value={form.role} onChange={e => setF("role", e.target.value)} style={input}>
              <option value="PRIMARY">Primary</option>
              <option value="FAILOVER">Failover</option>
              <option value="LOAD_BALANCED">Load balanced</option>
              <option value="OUT_OF_BAND">Out of band</option>
              <option value="GUEST">Guest</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div><label style={label}>Status</label>
            <select value={form.status} onChange={e => setF("status", e.target.value)} style={input}>
              <option value="PLANNED">Planned</option>
              <option value="ORDERED">Ordered</option>
              <option value="INSTALLING">Installing</option>
              <option value="ACTIVE">Active</option>
              <option value="DEGRADED">Degraded</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="RETIRED">Retired</option>
            </select>
          </div>
          <div><label style={label}>Account #</label><input value={form.accountNumber} onChange={e => setF("accountNumber", e.target.value)} style={input} /></div>
          <div><label style={label}>Circuit ID</label><input value={form.circuitId} onChange={e => setF("circuitId", e.target.value)} style={input} /></div>
          <div><label style={label}>Download (Mbps)</label><input type="number" value={form.downloadMbps} onChange={e => setF("downloadMbps", e.target.value)} style={input} /></div>
          <div><label style={label}>Upload (Mbps)</label><input type="number" value={form.uploadMbps} onChange={e => setF("uploadMbps", e.target.value)} style={input} /></div>
        </div>

        <div style={sectionTitle}>IP & Hand-off</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div><label style={label}>WAN IP (single)</label><input value={form.wanIp} onChange={e => setF("wanIp", e.target.value)} placeholder="e.g. 203.0.113.10" style={input} /></div>
          <div><label style={label}>Static block CIDR</label><input value={form.staticBlockCidr} onChange={e => onCidrChange(e.target.value)} placeholder="e.g. 203.0.113.0/29" style={input} /></div>
          <div><label style={label}>Subnet mask</label><input value={form.subnetMask} onChange={e => setF("subnetMask", e.target.value)} placeholder="e.g. 255.255.255.248" style={input} /></div>
          <div><label style={label}>Gateway</label><input value={form.gatewayIp} onChange={e => setF("gatewayIp", e.target.value)} style={input} /></div>
          <div><label style={label}>Usable start</label><input value={form.usableStartIp} onChange={e => setF("usableStartIp", e.target.value)} style={input} /></div>
          <div><label style={label}>Usable end</label><input value={form.usableEndIp} onChange={e => setF("usableEndIp", e.target.value)} style={input} /></div>
          <div><label style={label}>DNS 1</label><input value={form.dns1} onChange={e => setF("dns1", e.target.value)} style={input} /></div>
          <div><label style={label}>DNS 2</label><input value={form.dns2} onChange={e => setF("dns2", e.target.value)} style={input} /></div>
          <div><label style={label}>IPv6 prefix CIDR</label><input value={form.ipv6PrefixCidr} onChange={e => setF("ipv6PrefixCidr", e.target.value)} placeholder="e.g. 2001:db8::/56" style={input} /></div>
          <div><label style={label}>IPv6 gateway</label><input value={form.ipv6Gateway} onChange={e => setF("ipv6Gateway", e.target.value)} style={input} /></div>
          <div><label style={label}>Modem / ONT asset</label>
            <select value={form.modemAssetId} onChange={e => setF("modemAssetId", e.target.value)} style={input}>
              <option value="">None</option>
              {assets.map(a => <option key={a.id} value={a.id}>{a.friendlyName || a.name}</option>)}
            </select>
          </div>
          <div><label style={label}>Edge device (firewall/router)</label>
            <select value={form.edgeAssetId} onChange={e => setF("edgeAssetId", e.target.value)} style={input}>
              <option value="">None</option>
              {assets.map(a => <option key={a.id} value={a.id}>{a.friendlyName || a.name}</option>)}
            </select>
          </div>
          <div><label style={label}>Linked IPAM subnet</label>
            <select value={form.subnetId} onChange={e => onSubnetChange(e.target.value)} style={input}>
              <option value="">None</option>
              {subnets.map(s => <option key={s.id} value={s.id}>{s.cidr}</option>)}
            </select>
          </div>
        </div>

        <div style={sectionTitle}>Support & Contract</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div><label style={label}>Support phone</label><input value={form.supportPhone} onChange={e => setF("supportPhone", e.target.value)} style={input} /></div>
          <div><label style={label}>Support email</label><input value={form.supportEmail} onChange={e => setF("supportEmail", e.target.value)} style={input} /></div>
          <div><label style={label}>Portal URL</label><input value={form.portalUrl} onChange={e => setF("portalUrl", e.target.value)} style={input} /></div>
          <div><label style={label}>Portal credential</label>
            <select value={form.credentialId} onChange={e => setF("credentialId", e.target.value)} style={input}>
              <option value="">None</option>
              {credentials.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div><label style={label}>Install date</label><input type="date" value={form.installDate} onChange={e => setF("installDate", e.target.value)} style={input} /></div>
          <div><label style={label}>Contract start</label><input type="date" value={form.contractStart} onChange={e => setF("contractStart", e.target.value)} style={input} /></div>
          <div><label style={label}>Contract end</label><input type="date" value={form.contractEnd} onChange={e => setF("contractEnd", e.target.value)} style={input} /></div>
          <div><label style={label}>Monthly cost ($)</label><input type="number" value={form.monthlyCost} onChange={e => setF("monthlyCost", e.target.value)} style={input} /></div>
          <div style={{ gridColumn: "1 / -1" }}><label style={label}>Notes</label><textarea value={form.notes} onChange={e => setF("notes", e.target.value)} rows={3} style={{ ...input, resize: "vertical" } as any} /></div>
        </div>

        {serverError && <div style={{ marginTop: "12px", color: "var(--color-text-danger)", fontSize: "13px" }}>{serverError}</div>}

        <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
          <button onClick={save} disabled={saving} style={{ fontSize: "14px", fontWeight: 500, padding: "8px 16px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button onClick={() => { setShowAdd(false); setEditingId(null); setForm({ ...blankForm }); setServerError(null) }} style={{ fontSize: "14px", padding: "8px 16px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>Cancel</button>
        </div>
      </div>
    )
  }

  function renderCard(c: Circuit) {
    const isOpen = !!expanded[c.id]
    const speed = fmtMbps(c.downloadMbps, c.uploadMbps)
    const ispName = c.vendor?.name ?? c.ispNameFallback ?? "Untitled ISP"
    return (
      <div key={c.id} style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "10px", overflow: "hidden" }}>
        <div
          onClick={() => setExpanded(s => ({ ...s, [c.id]: !s[c.id] }))}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "var(--color-background-secondary)", cursor: "pointer" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "15px", fontWeight: 600, color: "var(--color-text-primary)" }}>{ispName}</span>
            <span style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>{c.label}</span>
            <span style={ROLE_CHIP[c.role] ?? ROLE_CHIP.OTHER}>{c.role.replace("_", " ")}</span>
            <span style={STATUS_CHIP[c.status] ?? STATUS_CHIP.PLANNED}>{c.status}</span>
            {c.staticBlockCidr && <span style={{ ...monoChip, background: "var(--color-accent-muted)", color: "var(--color-accent)" }}>{c.staticBlockCidr}</span>}
            {speed && <span style={{ fontSize: "12px", color: "var(--color-text-muted)", fontFamily: "monospace" }}>{speed}</span>}
            {c.location && <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>{c.location.name}</span>}
            {isExpiringSoon(c.contractEnd) && <span style={{ ...chip, background: "var(--color-background-warning)", color: "var(--color-text-warning)" }}>Contract ≤30d</span>}
            {c.legacyImported && <span style={{ ...chip, background: "var(--color-background-hover)", color: "var(--color-text-muted)", fontStyle: "italic" }}>Legacy import</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }} onClick={e => e.stopPropagation()}>
            <button onClick={() => copyWanBlock(c)} style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              {copied === c.id ? "Copied!" : "Copy WAN"}
            </button>
            <button onClick={() => quickToggleRole(c)} title="Promote/demote primary↔failover" style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              {c.role === "PRIMARY" ? "→ Failover" : "→ Primary"}
            </button>
            <button onClick={() => startEdit(c)} style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Edit</button>
            <button onClick={() => remove(c.id)} style={{ fontSize: "12px", color: "var(--color-text-danger)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Delete</button>
            <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>{isOpen ? "▲" : "▼"}</span>
          </div>
        </div>

        {isOpen && (
          <div style={{ background: "var(--color-background-primary)", padding: "12px 16px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", paddingBottom: "8px" }}>
              {c.wanIp && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>WAN <span style={{ fontFamily: "monospace" }}>{c.wanIp}</span></span>}
              {c.gatewayIp && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>GW <span style={{ fontFamily: "monospace" }}>{c.gatewayIp}</span></span>}
              {c.subnetMask && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>Mask <span style={{ fontFamily: "monospace" }}>{c.subnetMask}</span></span>}
              {(c.usableStartIp || c.usableEndIp) && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>Usable <span style={{ fontFamily: "monospace" }}>{c.usableStartIp}–{c.usableEndIp}</span></span>}
              {c.dns1 && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>DNS1 <span style={{ fontFamily: "monospace" }}>{c.dns1}</span></span>}
              {c.dns2 && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>DNS2 <span style={{ fontFamily: "monospace" }}>{c.dns2}</span></span>}
              {c.ipv6PrefixCidr && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>v6 <span style={{ fontFamily: "monospace" }}>{c.ipv6PrefixCidr}</span></span>}
              <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>{SERVICE_LABEL[c.serviceType] ?? c.serviceType}</span>
              {c.accountNumber && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>Acct <span style={{ fontFamily: "monospace" }}>{c.accountNumber}</span></span>}
              {c.circuitId && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>Circuit <span style={{ fontFamily: "monospace" }}>{c.circuitId}</span></span>}
              {c.monthlyCost != null && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>${c.monthlyCost}/mo</span>}
              {fmtDate(c.contractEnd) && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>Contract ends {fmtDate(c.contractEnd)}</span>}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", paddingTop: "8px", borderTop: "0.5px solid var(--color-border-tertiary)" }}>
              {c.supportPhone && <a href={`tel:${c.supportPhone}`} style={{ fontSize: "12px", color: "var(--color-accent)" }}>📞 {c.supportPhone}</a>}
              {c.supportEmail && <a href={`mailto:${c.supportEmail}`} style={{ fontSize: "12px", color: "var(--color-accent)" }}>✉ {c.supportEmail}</a>}
              {c.portalUrl && <a href={c.portalUrl} target="_blank" rel="noreferrer" style={{ fontSize: "12px", color: "var(--color-accent)" }}>Portal ↗</a>}
              {c.credential && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>Credential: <span style={{ color: "var(--color-text-primary)" }}>{c.credential.label}</span></span>}
              {c.modemAsset && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>Modem: <span style={{ color: "var(--color-text-primary)" }}>{c.modemAsset.friendlyName || c.modemAsset.name}</span></span>}
              {c.edgeAsset && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>Edge: <span style={{ color: "var(--color-text-primary)" }}>{c.edgeAsset.friendlyName || c.edgeAsset.name}</span></span>}
              {c.subnet && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>IPAM: <span style={{ fontFamily: "monospace", color: "var(--color-text-primary)" }}>{c.subnet.cidr}</span></span>}
              {c.vendor && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>Vendor: <span style={{ color: "var(--color-text-primary)" }}>{c.vendor.name}</span></span>}
            </div>
            {c.notes && <div style={{ marginTop: "12px", fontSize: "13px", color: "var(--color-text-secondary)", whiteSpace: "pre-wrap" }}>{c.notes}</div>}
          </div>
        )}
      </div>
    )
  }

  if (loading) return <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>Loading…</div>

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <div style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
          {active.length} active{archived.length > 0 ? ` · ${archived.length} archived` : ""}
        </div>
        <button onClick={() => { setShowAdd(true); setEditingId(null); setForm({ ...blankForm }) }} style={{ fontSize: "14px", fontWeight: 500, padding: "8px 16px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: "pointer" }}>
          Add circuit
        </button>
      </div>

      {showAdd && renderForm()}

      {circuits.length === 0 && !showAdd ? (
        <div>
          <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>No circuits documented yet.</div>
          {legacyAvailable && (
            <div style={{ marginTop: "12px", fontSize: "13px", color: "var(--color-text-muted)" }}>
              Legacy ISP / WAN fields found on one or more locations.{" "}
              <button onClick={promoteLegacy} disabled={promoting} style={{ fontSize: "13px", color: "var(--color-accent)", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}>
                {promoting ? "Promoting…" : "Promote them →"}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {active.map(renderCard)}
          {archived.length > 0 && (
            <div style={{ marginTop: "8px" }}>
              <div style={{ fontSize: "11px", fontWeight: 500, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px", marginTop: "12px" }}>
                Archived ({archived.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {archived.map(renderCard)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
