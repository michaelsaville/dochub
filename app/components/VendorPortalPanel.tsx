"use client"

import { useState, useEffect } from "react"

type ShareType = "CREDENTIAL" | "DOCUMENT" | "ATTACHMENT"
type Share = { id: string; itemType: ShareType; itemId: string; note: string | null; createdAt: string }
type Grant = {
  id: string
  label: string | null
  isActive: boolean
  vendor: { id: string; name: string }
  shares: Share[]
}
type VendorContact = { name: string; email: string | null }
type ClientVendor = { id: string; name: string; contacts?: VendorContact[] }
type Shareable = {
  credentials: { id: string; label: string; username: string | null; url: string | null }[]
  documents: { id: string; title: string; category: string | null }[]
  files: { id: string; originalName: string; mimeType: string; detectedMime: string | null; size: number }[]
}

const inp: React.CSSProperties = {
  width: "100%", padding: "8px 12px", fontSize: "14px",
  border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px",
  background: "var(--color-background-primary)", color: "var(--color-text-primary)",
  boxSizing: "border-box",
}
const lbl: React.CSSProperties = { fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }
const btnPrimary: React.CSSProperties = { fontSize: "14px", fontWeight: 500, padding: "8px 16px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }
const btnGhost: React.CSSProperties = { fontSize: "13px", padding: "7px 12px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }

const TYPE_LABEL: Record<ShareType, string> = { CREDENTIAL: "Credential", DOCUMENT: "Document", ATTACHMENT: "File" }
const VENDOR_PORTAL_URL = "https://vendor.pcc2k.com/"

export default function VendorPortalPanel({ clientId }: { clientId: string }) {
  const [grants, setGrants] = useState<Grant[]>([])
  const [vendors, setVendors] = useState<ClientVendor[]>([])
  const [shareable, setShareable] = useState<Shareable>({ credentials: [], documents: [], files: [] })
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [newForm, setNewForm] = useState({ vendorId: "", label: "" })
  const [creating, setCreating] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch(`/api/clients/${clientId}/vendor-grants`).then(r => r.json()),
      fetch(`/api/clients/${clientId}/vendors`).then(r => r.json()),
      fetch(`/api/clients/${clientId}/vendor-grants/shareable`).then(r => r.json()),
    ]).then(([g, v, s]) => {
      setGrants(Array.isArray(g) ? g : [])
      setVendors(Array.isArray(v) ? v : [])
      setShareable(s && s.credentials ? s : { credentials: [], documents: [], files: [] })
    }).finally(() => setLoading(false))
  }, [clientId])

  async function createGrant() {
    if (!newForm.vendorId) return
    setCreating(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/vendor-grants`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newForm),
      })
      if (res.ok) {
        const grant = await res.json()
        setGrants(g => [...g, { ...grant, shares: grant.shares ?? [] }])
        setNewForm({ vendorId: "", label: "" })
        setShowNew(false)
        setExpandedId(grant.id)
      } else {
        const e = await res.json(); alert(e.error || "Failed to create grant")
      }
    } finally { setCreating(false) }
  }

  async function toggleActive(grant: Grant) {
    const res = await fetch(`/api/clients/${clientId}/vendor-grants/${grant.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !grant.isActive }),
    })
    if (res.ok) setGrants(g => g.map(x => x.id === grant.id ? { ...x, isActive: !x.isActive } : x))
  }

  async function deleteGrant(grant: Grant) {
    if (!confirm(`Remove vendor-portal access for ${grant.vendor.name}? Their login will stop working and all shares are deleted.`)) return
    const res = await fetch(`/api/clients/${clientId}/vendor-grants/${grant.id}`, { method: "DELETE" })
    if (res.ok) { setGrants(g => g.filter(x => x.id !== grant.id)); if (expandedId === grant.id) setExpandedId(null) }
  }

  async function addShare(grant: Grant, itemType: ShareType, itemId: string) {
    const res = await fetch(`/api/clients/${clientId}/vendor-grants/${grant.id}/shares`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemType, itemId }),
    })
    if (res.ok) {
      const share = await res.json()
      setGrants(g => g.map(x => x.id === grant.id ? { ...x, shares: [...x.shares, share] } : x))
    } else {
      const e = await res.json(); alert(e.error || "Failed to share")
    }
  }

  async function removeShare(grant: Grant, shareId: string) {
    const res = await fetch(`/api/clients/${clientId}/vendor-grants/${grant.id}/shares/${shareId}`, { method: "DELETE" })
    if (res.ok) setGrants(g => g.map(x => x.id === grant.id ? { ...x, shares: x.shares.filter(s => s.id !== shareId) } : x))
  }

  // Vendors that don't already have a grant — eligible for a new one.
  const grantedVendorIds = new Set(grants.map(g => g.vendor.id))
  const availableVendors = vendors.filter(v => !grantedVendorIds.has(v.id))

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px", gap: 16 }}>
        <div style={{ fontSize: "13px", color: "var(--color-text-muted)", maxWidth: 560, lineHeight: 1.5 }}>
          Give a client&rsquo;s outside vendor scoped access to specific credentials and documents at{" "}
          <code style={{ fontFamily: "monospace", fontSize: "12px" }}>{VENDOR_PORTAL_URL}</code>.
          Default-deny — a vendor sees <strong>only</strong> the items you share below.
        </div>
        <button onClick={() => setShowNew(true)} disabled={availableVendors.length === 0}
          style={{ ...btnGhost, whiteSpace: "nowrap", opacity: availableVendors.length === 0 ? 0.5 : 1 }}>
          New vendor grant
        </button>
      </div>

      {availableVendors.length === 0 && vendors.length === 0 && !loading && (
        <div style={{ fontSize: "13px", color: "var(--color-text-muted)", marginBottom: 12 }}>
          Link a vendor to this client first (Vendors tab), then grant them portal access here.
        </div>
      )}

      {showNew && (
        <div style={{ background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: "10px", padding: "20px", marginBottom: "16px" }}>
          <div style={{ fontSize: "15px", fontWeight: 500, marginBottom: "16px" }}>New vendor grant</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
            <div>
              <label style={lbl}>Vendor *</label>
              <select value={newForm.vendorId} onChange={e => setNewForm(f => ({ ...f, vendorId: e.target.value }))} style={inp}>
                <option value="">— select vendor —</option>
                {availableVendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Label (optional)</label>
              <input value={newForm.label} onChange={e => setNewForm(f => ({ ...f, label: e.target.value }))} style={inp} placeholder="e.g. VPN + RDP access" />
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={createGrant} disabled={creating || !newForm.vendorId} style={{ ...btnPrimary, opacity: creating || !newForm.vendorId ? 0.6 : 1 }}>
              {creating ? "Creating..." : "Create grant"}
            </button>
            <button onClick={() => setShowNew(false)} style={btnGhost}>Cancel</button>
          </div>
        </div>
      )}

      {loading && <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>Loading...</div>}
      {!loading && grants.length === 0 && !showNew && (
        <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>No vendor grants yet.</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {grants.map(grant => (
          <GrantCard
            key={grant.id}
            grant={grant}
            clientId={clientId}
            shareable={shareable}
            vendor={vendors.find(v => v.id === grant.vendor.id)}
            expanded={expandedId === grant.id}
            onToggleExpand={() => setExpandedId(expandedId === grant.id ? null : grant.id)}
            onToggleActive={() => toggleActive(grant)}
            onDelete={() => deleteGrant(grant)}
            onAddShare={(t, i) => addShare(grant, t, i)}
            onRemoveShare={(s) => removeShare(grant, s)}
          />
        ))}
      </div>
    </div>
  )
}

function GrantCard({
  grant, clientId, shareable, vendor, expanded, onToggleExpand, onToggleActive, onDelete, onAddShare, onRemoveShare,
}: {
  grant: Grant
  clientId: string
  shareable: Shareable
  vendor?: ClientVendor
  expanded: boolean
  onToggleExpand: () => void
  onToggleActive: () => void
  onDelete: () => void
  onAddShare: (t: ShareType, i: string) => void
  onRemoveShare: (s: string) => void
}) {
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteName, setInviteName] = useState("")
  const [inviting, setInviting] = useState(false)
  const [setupUrl, setSetupUrl] = useState<string | null>(null)
  const [picker, setPicker] = useState<ShareType | null>(null)

  const sharedIds = new Set(grant.shares.map(s => `${s.itemType}:${s.itemId}`))

  function labelFor(s: Share): string {
    if (s.itemType === "CREDENTIAL") return shareable.credentials.find(c => c.id === s.itemId)?.label ?? "(credential)"
    if (s.itemType === "DOCUMENT") return shareable.documents.find(d => d.id === s.itemId)?.title ?? "(document)"
    return shareable.files.find(f => f.id === s.itemId)?.originalName ?? "(file)"
  }

  async function doInvite() {
    if (!inviteEmail.trim()) return
    setInviting(true); setSetupUrl(null)
    try {
      const res = await fetch(`/api/clients/${clientId}/vendor-grants/${grant.id}/invite`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, name: inviteName }),
      })
      const data = await res.json()
      if (res.ok) {
        setSetupUrl(data.setupUrl ?? null)
        if (data.emailed) alert("Invite emailed to the vendor.")
        else if (!data.setupUrl) alert("Vendor account provisioned.")
      } else {
        alert(data.error || "Failed to invite vendor")
      }
    } catch {
      alert("Could not reach the portal to provision the vendor account.")
    } finally { setInviting(false) }
  }

  const pickerItems: { id: string; label: string; sub?: string }[] =
    picker === "CREDENTIAL" ? shareable.credentials.map(c => ({ id: c.id, label: c.label, sub: c.username ?? c.url ?? undefined }))
    : picker === "DOCUMENT" ? shareable.documents.map(d => ({ id: d.id, label: d.title, sub: d.category ?? undefined }))
    : picker === "ATTACHMENT" ? shareable.files.map(f => ({ id: f.id, label: f.originalName, sub: `${(f.size / 1024).toFixed(0)} KB` }))
    : []

  return (
    <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "10px", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px", background: "var(--color-background-secondary)", cursor: "pointer" }} onClick={onToggleExpand}>
        <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: grant.isActive ? "#22c55e" : "#4a5568", flexShrink: 0 }} title={grant.isActive ? "Active" : "Disabled"} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-text-primary)" }}>{grant.vendor.name}</div>
          <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "1px" }}>
            {grant.label ? `${grant.label} · ` : ""}{grant.shares.length} item{grant.shares.length === 1 ? "" : "s"} shared
          </div>
        </div>
        {!grant.isActive && <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4, background: "rgba(148,163,184,0.16)", color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Disabled</span>}
        <span style={{ fontSize: "12px", color: "var(--color-text-muted)", flexShrink: 0 }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <div style={{ padding: "16px 20px", background: "var(--color-background-primary)" }}>
          {/* Shared items */}
          <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
            <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-primary)", marginBottom: 10 }}>Shared with this vendor</div>
            {grant.shares.length === 0 && <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: 10 }}>Nothing shared yet — add items below.</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
              {grant.shares.map(s => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "var(--color-background-secondary)", borderRadius: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4, background: "rgba(99,102,241,0.14)", color: "#6366f1", textTransform: "uppercase", letterSpacing: "0.04em", flexShrink: 0 }}>{TYPE_LABEL[s.itemType]}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{labelFor(s)}</span>
                  <button onClick={() => onRemoveShare(s.id)} style={{ fontSize: 12, color: "var(--color-text-danger)", background: "none", border: "none", cursor: "pointer", flexShrink: 0 }}>Remove</button>
                </div>
              ))}
            </div>
            {/* Add items */}
            <div style={{ display: "flex", gap: 8, marginBottom: picker ? 12 : 0 }}>
              {(["CREDENTIAL", "DOCUMENT", "ATTACHMENT"] as ShareType[]).map(t => (
                <button key={t} onClick={() => setPicker(picker === t ? null : t)} style={{ ...btnGhost, background: picker === t ? "var(--color-background-secondary)" : "transparent" }}>
                  + {TYPE_LABEL[t]}
                </button>
              ))}
            </div>
            {picker && (
              <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: 8, maxHeight: 220, overflowY: "auto" }}>
                {pickerItems.length === 0 && <div style={{ fontSize: 13, color: "var(--color-text-muted)", padding: "10px 12px" }}>None available for this client.</div>}
                {pickerItems.map(item => {
                  const already = sharedIds.has(`${picker}:${item.id}`)
                  return (
                    <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</div>
                        {item.sub && <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{item.sub}</div>}
                      </div>
                      <button disabled={already} onClick={() => onAddShare(picker, item.id)}
                        style={{ ...btnGhost, padding: "5px 12px", opacity: already ? 0.5 : 1, cursor: already ? "default" : "pointer" }}>
                        {already ? "Shared" : "Share"}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Invite vendor user */}
          <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
            <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-primary)", marginBottom: 8 }}>Invite a vendor contact</div>
            {vendor?.contacts && vendor.contacts.length > 0 && (
              <select onChange={e => {
                const c = vendor.contacts!.find(x => (x.email ?? "") === e.target.value)
                if (c) { setInviteEmail(c.email ?? ""); setInviteName(c.name) }
              }} style={{ ...inp, marginBottom: 8 }} defaultValue="">
                <option value="">— prefill from vendor contact —</option>
                {vendor.contacts.filter(c => c.email).map(c => <option key={c.email} value={c.email!}>{c.name} ({c.email})</option>)}
              </select>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="Name" style={{ ...inp, maxWidth: 180 }} />
              <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="vendor@example.com" style={{ ...inp, maxWidth: 260 }} />
              <button onClick={doInvite} disabled={inviting || !inviteEmail.trim() || !grant.isActive} style={{ ...btnPrimary, opacity: inviting || !inviteEmail.trim() || !grant.isActive ? 0.6 : 1 }}>
                {inviting ? "Inviting..." : "Send invite"}
              </button>
            </div>
            {setupUrl && (
              <div style={{ marginTop: 10, padding: "10px 12px", background: "var(--color-background-secondary)", borderRadius: 8, fontSize: 12 }}>
                <div style={{ color: "var(--color-text-secondary)", marginBottom: 4 }}>Setup link — copy to the vendor if they didn&rsquo;t get the email:</div>
                <code style={{ fontFamily: "monospace", wordBreak: "break-all", color: "var(--color-text-primary)" }}>{setupUrl}</code>
              </div>
            )}
          </div>

          {/* Status + delete */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={onToggleActive} style={{ fontSize: "13px", padding: "6px 14px", borderRadius: "8px", cursor: "pointer", border: "none", fontWeight: 500, background: grant.isActive ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)", color: grant.isActive ? "#ef4444" : "#22c55e" }}>
              {grant.isActive ? "Disable access" : "Enable access"}
            </button>
            <button onClick={onDelete} style={{ fontSize: "13px", color: "var(--color-text-danger)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              Delete grant
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
