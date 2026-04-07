"use client"

import { useState } from "react"

// ── Types ─────────────────────────────────────────────────────────────────────

type DomainGroup = {
  id: string
  name: string
  scope: string | null
  purpose: string | null
  members: string[]
  notes: string | null
}

type SharePermission = {
  id: string
  principal: string
  principalType: "USER" | "GROUP" | "COMPUTER"
  domainGroupId: string | null
  accessLevel: "READ" | "CHANGE" | "FULL_CONTROL" | "DENY"
  layer: "SHARE" | "NTFS" | "BOTH"
  notes: string | null
  domainGroup: { id: string; name: string } | null
}

type NetworkShare = {
  id: string
  name: string
  uncPath: string
  shareType: "SMB" | "DFS" | "NFS"
  purpose: string | null
  notes: string | null
  domainId: string | null
  assetId: string | null
  domain: { id: string; name: string; netbiosName: string | null } | null
  asset: { id: string; name: string; friendlyName: string | null } | null
  permissions: SharePermission[]
}

type AdDomain = {
  id: string
  name: string
  netbiosName: string | null
  functionalLevel: string | null
  credentialId: string | null
  credential: { id: string; label: string; username: string | null } | null
  notes: string | null
  groups: DomainGroup[]
  shares: NetworkShare[]
}

type Props = {
  domains: AdDomain[]
  shares: NetworkShare[]
  assets: { id: string; name: string; friendlyName: string | null; category: string }[]
  clientId: string
  onDomainsChange: (domains: AdDomain[]) => void
  onSharesChange: (shares: NetworkShare[]) => void
}

// ── Shared styles ──────────────────────────────────────────────────────────────

const inp = {
  width: "100%", padding: "8px 12px", fontSize: "14px",
  border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px",
  background: "var(--color-background-primary)", color: "var(--color-text-primary)",
  boxSizing: "border-box" as const,
}
const lbl = { fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }
const card = {
  background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-secondary)",
  borderRadius: "10px", padding: "20px", marginBottom: "16px",
}
const emptyNote = {
  fontSize: "14px", color: "var(--color-text-secondary)", padding: "32px", textAlign: "center" as const,
  border: "0.5px solid var(--color-border-tertiary)", borderRadius: "10px",
}

const ACCESS_COLORS: Record<string, string> = {
  FULL_CONTROL: "#ef4444",
  CHANGE: "#f59e0b",
  READ: "#22c55e",
  DENY: "#6b7280",
}

const ACCESS_LABELS: Record<string, string> = {
  FULL_CONTROL: "Full Control", CHANGE: "Change", READ: "Read", DENY: "Deny",
}

const LAYER_LABELS: Record<string, string> = {
  SHARE: "Share", NTFS: "NTFS", BOTH: "Share+NTFS",
}

const TYPE_LABELS: Record<string, string> = {
  USER: "User", GROUP: "Group", COMPUTER: "Computer",
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function FileSharesPanel({ domains, shares, assets, clientId, onDomainsChange, onSharesChange }: Props) {
  const [view, setView] = useState<"shares" | "domains">("shares")

  return (
    <div>
      {/* Sub-nav */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "24px", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
        {(["shares", "domains"] as const).map(v => (
          <button key={v} onClick={() => setView(v)} style={{
            fontSize: "13px", fontWeight: view === v ? 600 : 400, padding: "8px 16px",
            border: "none", background: "transparent", cursor: "pointer",
            color: view === v ? "var(--color-text-primary)" : "var(--color-text-secondary)",
            borderBottom: view === v ? "2px solid var(--color-text-primary)" : "2px solid transparent",
            marginBottom: "-1px",
          }}>
            {v === "shares" ? `Shares (${shares.length})` : `AD Domains (${domains.length})`}
          </button>
        ))}
      </div>

      {view === "shares" && (
        <SharesView shares={shares} domains={domains} assets={assets} clientId={clientId} onSharesChange={onSharesChange} />
      )}
      {view === "domains" && (
        <DomainsView domains={domains} clientId={clientId} onDomainsChange={onDomainsChange} />
      )}
    </div>
  )
}

// ── Shares view ────────────────────────────────────────────────────────────────

function SharesView({ shares, domains, assets, clientId, onSharesChange }: {
  shares: NetworkShare[]
  domains: AdDomain[]
  assets: Props["assets"]
  clientId: string
  onSharesChange: (s: NetworkShare[]) => void
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: "", uncPath: "", shareType: "SMB", domainId: "", assetId: "", purpose: "", notes: "" })
  const [saving, setSaving] = useState(false)
  const [expandedShare, setExpandedShare] = useState<string | null>(null)
  const [editingShare, setEditingShare] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<any>({})

  // All groups across all domains for the permission picker
  const allGroups = domains.flatMap(d => d.groups.map(g => ({ ...g, domainName: d.netbiosName || d.name })))

  async function saveShare() {
    if (!form.name.trim() || !form.uncPath.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/shares`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        const created = await res.json()
        onSharesChange([...shares, created])
        setForm({ name: "", uncPath: "", shareType: "SMB", domainId: "", assetId: "", purpose: "", notes: "" })
        setShowAdd(false)
      }
    } finally { setSaving(false) }
  }

  async function updateShare(shareId: string) {
    setSaving(true)
    try {
      const res = await fetch(`/api/shares/${shareId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      })
      if (res.ok) {
        const updated = await res.json()
        onSharesChange(shares.map(s => s.id === shareId ? updated : s))
        setEditingShare(null)
      }
    } finally { setSaving(false) }
  }

  async function deleteShare(shareId: string) {
    if (!confirm("Delete this share and all its permissions?")) return
    const res = await fetch(`/api/shares/${shareId}`, { method: "DELETE" })
    if (res.ok) onSharesChange(shares.filter(s => s.id !== shareId))
  }

  async function addPermission(shareId: string, permForm: any) {
    const res = await fetch(`/api/shares/${shareId}/permissions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(permForm),
    })
    if (res.ok) {
      const perm = await res.json()
      onSharesChange(shares.map(s => s.id === shareId ? { ...s, permissions: [...s.permissions, perm] } : s))
    }
  }

  async function deletePermission(shareId: string, permId: string) {
    const res = await fetch(`/api/share-permissions/${permId}`, { method: "DELETE" })
    if (res.ok) {
      onSharesChange(shares.map(s => s.id === shareId
        ? { ...s, permissions: s.permissions.filter(p => p.id !== permId) }
        : s
      ))
    }
  }

  const serverAssets = assets.filter(a => ["SERVER", "NAS"].includes(a.category))

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px" }}>
        <button onClick={() => setShowAdd(true)} style={{ fontSize: "14px", fontWeight: 500, padding: "8px 16px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: "pointer" }}>
          Add share
        </button>
      </div>

      {showAdd && (
        <div style={card}>
          <div style={{ fontSize: "15px", fontWeight: 500, marginBottom: "16px" }}>New network share</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
            <div>
              <label style={lbl}>Share name *</label>
              <input autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Finance" style={inp} />
            </div>
            <div>
              <label style={lbl}>UNC path *</label>
              <input value={form.uncPath} onChange={e => setForm(f => ({ ...f, uncPath: e.target.value }))} placeholder="\\FS01\Finance" style={inp} />
            </div>
            <div>
              <label style={lbl}>Type</label>
              <select value={form.shareType} onChange={e => setForm(f => ({ ...f, shareType: e.target.value }))} style={inp}>
                {["SMB", "DFS", "NFS"].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>File server (asset)</label>
              <select value={form.assetId} onChange={e => setForm(f => ({ ...f, assetId: e.target.value }))} style={inp}>
                <option value="">None</option>
                {serverAssets.map(a => <option key={a.id} value={a.id}>{a.friendlyName || a.name}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>AD domain</label>
              <select value={form.domainId} onChange={e => setForm(f => ({ ...f, domainId: e.target.value }))} style={inp}>
                <option value="">None</option>
                {domains.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Purpose</label>
              <input value={form.purpose} onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))} placeholder="e.g. Finance department files" style={inp} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={lbl}>Notes</label>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...inp, resize: "vertical" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={saveShare} disabled={saving} style={{ fontSize: "14px", fontWeight: 500, padding: "8px 16px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>
              {saving ? "Saving..." : "Save"}
            </button>
            <button onClick={() => setShowAdd(false)} style={{ fontSize: "14px", padding: "8px 16px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {shares.length === 0 && !showAdd && (
        <div style={emptyNote}>No shares documented yet. Add a share to get started.</div>
      )}

      {shares.map(share => (
        <div key={share.id} style={{ border: "0.5px solid var(--color-border-secondary)", borderRadius: "10px", marginBottom: "12px", overflow: "hidden" }}>
          {/* Share header */}
          {editingShare === share.id ? (
            <div style={{ padding: "16px", background: "var(--color-background-secondary)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                <div>
                  <label style={lbl}>Share name</label>
                  <input value={editForm.name} onChange={e => setEditForm((f: any) => ({ ...f, name: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>UNC path</label>
                  <input value={editForm.uncPath} onChange={e => setEditForm((f: any) => ({ ...f, uncPath: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Type</label>
                  <select value={editForm.shareType} onChange={e => setEditForm((f: any) => ({ ...f, shareType: e.target.value }))} style={inp}>
                    {["SMB", "DFS", "NFS"].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>File server</label>
                  <select value={editForm.assetId || ""} onChange={e => setEditForm((f: any) => ({ ...f, assetId: e.target.value || null }))} style={inp}>
                    <option value="">None</option>
                    {serverAssets.map(a => <option key={a.id} value={a.id}>{a.friendlyName || a.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>AD domain</label>
                  <select value={editForm.domainId || ""} onChange={e => setEditForm((f: any) => ({ ...f, domainId: e.target.value || null }))} style={inp}>
                    <option value="">None</option>
                    {domains.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Purpose</label>
                  <input value={editForm.purpose || ""} onChange={e => setEditForm((f: any) => ({ ...f, purpose: e.target.value }))} style={inp} />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={lbl}>Notes</label>
                  <textarea value={editForm.notes || ""} onChange={e => setEditForm((f: any) => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...inp, resize: "vertical" }} />
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={() => updateShare(share.id)} disabled={saving} style={{ fontSize: "13px", fontWeight: 500, padding: "6px 14px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>
                  {saving ? "Saving..." : "Save"}
                </button>
                <button onClick={() => setEditingShare(null)} style={{ fontSize: "13px", padding: "6px 14px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer" }}>Cancel</button>
              </div>
            </div>
          ) : (
            <div
              style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: "12px", cursor: "pointer", background: "var(--color-background-primary)" }}
              onClick={() => setExpandedShare(expandedShare === share.id ? null : share.id)}
            >
              {/* Type badge */}
              <span style={{ fontSize: "11px", fontWeight: 600, padding: "2px 7px", borderRadius: "4px", background: "var(--color-background-secondary)", color: "var(--color-text-secondary)", flexShrink: 0 }}>
                {share.shareType}
              </span>
              {/* Name + path */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-text-primary)" }}>{share.name}</div>
                <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", fontFamily: "monospace", marginTop: "1px" }}>{share.uncPath}</div>
              </div>
              {/* Server */}
              {share.asset && (
                <span style={{ fontSize: "12px", color: "var(--color-text-secondary)", flexShrink: 0 }}>
                  {share.asset.friendlyName || share.asset.name}
                </span>
              )}
              {/* Domain */}
              {share.domain && (
                <span style={{ fontSize: "12px", color: "var(--color-text-secondary)", flexShrink: 0 }}>
                  {share.domain.netbiosName || share.domain.name}
                </span>
              )}
              {/* Permission count */}
              <span style={{ fontSize: "12px", color: "var(--color-text-secondary)", flexShrink: 0 }}>
                {share.permissions.length} {share.permissions.length === 1 ? "ACE" : "ACEs"}
              </span>
              {/* Chevron */}
              <span style={{ fontSize: "12px", color: "var(--color-text-secondary)", flexShrink: 0 }}>
                {expandedShare === share.id ? "▲" : "▼"}
              </span>
              {/* Actions */}
              <button onClick={e => { e.stopPropagation(); setEditingShare(share.id); setEditForm({ ...share }); setExpandedShare(null) }}
                style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: "0 4px", flexShrink: 0 }}>
                Edit
              </button>
              <button onClick={e => { e.stopPropagation(); deleteShare(share.id) }}
                style={{ fontSize: "12px", color: "var(--color-text-danger)", background: "none", border: "none", cursor: "pointer", padding: "0 4px", flexShrink: 0 }}>
                Delete
              </button>
            </div>
          )}

          {/* Expanded permissions panel */}
          {expandedShare === share.id && (
            <PermissionsPanel
              share={share}
              allGroups={allGroups}
              onAddPermission={(pf) => addPermission(share.id, pf)}
              onDeletePermission={(permId) => deletePermission(share.id, permId)}
            />
          )}
        </div>
      ))}
    </div>
  )
}

// ── Permissions panel (inside expanded share) ──────────────────────────────────

function PermissionsPanel({ share, allGroups, onAddPermission, onDeletePermission }: {
  share: NetworkShare
  allGroups: (DomainGroup & { domainName: string })[]
  onAddPermission: (pf: any) => Promise<void>
  onDeletePermission: (permId: string) => Promise<void>
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ principal: "", principalType: "GROUP", domainGroupId: "", accessLevel: "READ", layer: "BOTH", notes: "" })
  const [saving, setSaving] = useState(false)

  function pickGroup(groupId: string) {
    if (!groupId) { setForm(f => ({ ...f, domainGroupId: "", principal: "" })); return }
    const g = allGroups.find(g => g.id === groupId)
    if (g) setForm(f => ({ ...f, domainGroupId: groupId, principal: `${g.domainName}\\${g.name}`, principalType: "GROUP" }))
  }

  async function save() {
    if (!form.principal.trim()) return
    setSaving(true)
    try {
      await onAddPermission(form)
      setForm({ principal: "", principalType: "GROUP", domainGroupId: "", accessLevel: "READ", layer: "BOTH", notes: "" })
      setShowAdd(false)
    } finally { setSaving(false) }
  }

  return (
    <div style={{ padding: "0 16px 16px", background: "var(--color-background-primary)", borderTop: "0.5px solid var(--color-border-tertiary)" }}>
      {share.purpose && (
        <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", padding: "10px 0 8px" }}>{share.purpose}</div>
      )}

      {/* Permission rows */}
      {share.permissions.length > 0 && (
        <div style={{ marginTop: "12px", marginBottom: "12px" }}>
          {/* Header */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 120px 60px", gap: "8px", padding: "6px 8px", fontSize: "11px", fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            <span>Principal</span>
            <span>Access</span>
            <span>Layer</span>
            <span></span>
          </div>
          {share.permissions.map(p => (
            <div key={p.id} style={{ display: "grid", gridTemplateColumns: "1fr 120px 120px 60px", gap: "8px", padding: "8px 8px", fontSize: "13px", borderTop: "0.5px solid var(--color-border-tertiary)", alignItems: "center" }}>
              <div>
                <span style={{ fontFamily: "monospace", fontSize: "12px" }}>{p.principal}</span>
                <span style={{ marginLeft: "6px", fontSize: "11px", color: "var(--color-text-secondary)" }}>{TYPE_LABELS[p.principalType]}</span>
              </div>
              <div>
                <span style={{ fontSize: "12px", fontWeight: 600, padding: "2px 7px", borderRadius: "4px", background: ACCESS_COLORS[p.accessLevel] + "22", color: ACCESS_COLORS[p.accessLevel] }}>
                  {ACCESS_LABELS[p.accessLevel]}
                </span>
              </div>
              <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{LAYER_LABELS[p.layer]}</div>
              <div>
                <button onClick={() => onDeletePermission(p.id)} style={{ fontSize: "12px", color: "var(--color-text-danger)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {share.permissions.length === 0 && !showAdd && (
        <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", padding: "12px 0 8px" }}>No permissions documented.</div>
      )}

      {/* Add permission form */}
      {showAdd ? (
        <div style={{ background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", padding: "14px", marginTop: "8px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
            {allGroups.length > 0 && (
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={lbl}>Pick a known group (auto-fills principal)</label>
                <select value={form.domainGroupId} onChange={e => pickGroup(e.target.value)} style={inp}>
                  <option value="">Select group…</option>
                  {allGroups.map(g => <option key={g.id} value={g.id}>{g.domainName}\{g.name}</option>)}
                </select>
              </div>
            )}
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={lbl}>Principal *</label>
              <input value={form.principal} onChange={e => setForm(f => ({ ...f, principal: e.target.value, domainGroupId: "" }))} placeholder="DOMAIN\GroupName or DOMAIN\username" style={inp} />
            </div>
            <div>
              <label style={lbl}>Type</label>
              <select value={form.principalType} onChange={e => setForm(f => ({ ...f, principalType: e.target.value }))} style={inp}>
                {["GROUP", "USER", "COMPUTER"].map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Access level</label>
              <select value={form.accessLevel} onChange={e => setForm(f => ({ ...f, accessLevel: e.target.value }))} style={inp}>
                {["READ", "CHANGE", "FULL_CONTROL", "DENY"].map(a => <option key={a} value={a}>{ACCESS_LABELS[a]}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Permission layer</label>
              <select value={form.layer} onChange={e => setForm(f => ({ ...f, layer: e.target.value }))} style={inp}>
                {["BOTH", "SHARE", "NTFS"].map(l => <option key={l} value={l}>{LAYER_LABELS[l]}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Notes</label>
              <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={inp} />
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={save} disabled={saving} style={{ fontSize: "13px", fontWeight: 500, padding: "6px 14px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>
              {saving ? "Saving..." : "Add"}
            </button>
            <button onClick={() => setShowAdd(false)} style={{ fontSize: "13px", padding: "6px 14px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)} style={{ fontSize: "13px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: "4px 0", marginTop: "4px" }}>
          + Add permission
        </button>
      )}

      {share.notes && (
        <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "10px", fontStyle: "italic" }}>{share.notes}</div>
      )}
    </div>
  )
}

// ── AD Domains view ────────────────────────────────────────────────────────────

function DomainsView({ domains, clientId, onDomainsChange }: {
  domains: AdDomain[]
  clientId: string
  onDomainsChange: (d: AdDomain[]) => void
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: "", netbiosName: "", functionalLevel: "", notes: "", credLabel: "", credUsername: "", credPassword: "" })
  const [saving, setSaving] = useState(false)
  const [expandedDomain, setExpandedDomain] = useState<string | null>(null)
  const [editingDomain, setEditingDomain] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<any>({})

  async function saveDomain() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/ad-domains`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        const created = await res.json()
        onDomainsChange([...domains, created])
        setForm({ name: "", netbiosName: "", functionalLevel: "", notes: "", credLabel: "", credUsername: "", credPassword: "" })
        setShowAdd(false)
      }
    } finally { setSaving(false) }
  }

  async function updateDomain(domainId: string) {
    setSaving(true)
    try {
      const res = await fetch(`/api/ad-domains/${domainId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      })
      if (res.ok) {
        const updated = await res.json()
        onDomainsChange(domains.map(d => d.id === domainId ? { ...d, ...updated } : d))
        setEditingDomain(null)
      }
    } finally { setSaving(false) }
  }

  async function deleteDomain(domainId: string) {
    if (!confirm("Delete this domain and all its groups?")) return
    const res = await fetch(`/api/ad-domains/${domainId}`, { method: "DELETE" })
    if (res.ok) onDomainsChange(domains.filter(d => d.id !== domainId))
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px" }}>
        <button onClick={() => setShowAdd(true)} style={{ fontSize: "14px", fontWeight: 500, padding: "8px 16px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: "pointer" }}>
          Add domain
        </button>
      </div>

      {showAdd && (
        <div style={card}>
          <div style={{ fontSize: "15px", fontWeight: 500, marginBottom: "16px" }}>New AD domain</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
            <div>
              <label style={lbl}>Domain name (FQDN) *</label>
              <input autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="corp.client.local" style={inp} />
            </div>
            <div>
              <label style={lbl}>NetBIOS name</label>
              <input value={form.netbiosName} onChange={e => setForm(f => ({ ...f, netbiosName: e.target.value }))} placeholder="CORP" style={inp} />
            </div>
            <div>
              <label style={lbl}>Functional level</label>
              <input value={form.functionalLevel} onChange={e => setForm(f => ({ ...f, functionalLevel: e.target.value }))} placeholder="Windows Server 2019" style={inp} />
            </div>
            <div>
              <label style={lbl}>Notes</label>
              <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={inp} />
            </div>
          </div>

          {/* Domain admin credential */}
          <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: "14px", marginBottom: "12px" }}>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Domain admin credential <span style={{ fontWeight: 400, textTransform: "none", fontSize: "12px" }}>(saved to vault)</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
              <div>
                <label style={lbl}>Credential label</label>
                <input value={form.credLabel} onChange={e => setForm(f => ({ ...f, credLabel: e.target.value }))} placeholder="Domain Admin" style={inp} />
              </div>
              <div>
                <label style={lbl}>Username</label>
                <input value={form.credUsername} onChange={e => setForm(f => ({ ...f, credUsername: e.target.value }))} placeholder="administrator" style={inp} />
              </div>
              <div>
                <label style={lbl}>Password</label>
                <input type="password" value={form.credPassword} onChange={e => setForm(f => ({ ...f, credPassword: e.target.value }))} placeholder="Leave blank to skip" style={inp} />
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={saveDomain} disabled={saving} style={{ fontSize: "14px", fontWeight: 500, padding: "8px 16px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>
              {saving ? "Saving..." : "Save"}
            </button>
            <button onClick={() => setShowAdd(false)} style={{ fontSize: "14px", padding: "8px 16px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      )}

      {domains.length === 0 && !showAdd && (
        <div style={emptyNote}>No AD domains documented yet.</div>
      )}

      {domains.map(domain => (
        <div key={domain.id} style={{ border: "0.5px solid var(--color-border-secondary)", borderRadius: "10px", marginBottom: "12px", overflow: "hidden" }}>
          {/* Domain header */}
          {editingDomain === domain.id ? (
            <div style={{ padding: "16px", background: "var(--color-background-secondary)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                <div>
                  <label style={lbl}>FQDN</label>
                  <input value={editForm.name || ""} onChange={e => setEditForm((f: any) => ({ ...f, name: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>NetBIOS</label>
                  <input value={editForm.netbiosName || ""} onChange={e => setEditForm((f: any) => ({ ...f, netbiosName: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Functional level</label>
                  <input value={editForm.functionalLevel || ""} onChange={e => setEditForm((f: any) => ({ ...f, functionalLevel: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Notes</label>
                  <input value={editForm.notes || ""} onChange={e => setEditForm((f: any) => ({ ...f, notes: e.target.value }))} style={inp} />
                </div>
              </div>
              <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: "12px", marginBottom: "12px" }}>
                <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Domain admin credential
                  {domain.credential && <span style={{ fontWeight: 400, textTransform: "none", marginLeft: "8px" }}>— currently: {domain.credential.label}</span>}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
                  <div>
                    <label style={lbl}>Credential label</label>
                    <input value={editForm.credLabel || ""} onChange={e => setEditForm((f: any) => ({ ...f, credLabel: e.target.value }))} placeholder={domain.credential?.label || "Domain Admin"} style={inp} />
                  </div>
                  <div>
                    <label style={lbl}>Username</label>
                    <input value={editForm.credUsername || ""} onChange={e => setEditForm((f: any) => ({ ...f, credUsername: e.target.value }))} placeholder={domain.credential?.username || "administrator"} style={inp} />
                  </div>
                  <div>
                    <label style={lbl}>New password</label>
                    <input type="password" value={editForm.credPassword || ""} onChange={e => setEditForm((f: any) => ({ ...f, credPassword: e.target.value }))} placeholder={domain.credential ? "Enter to replace" : "Leave blank to skip"} style={inp} />
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={() => updateDomain(domain.id)} disabled={saving} style={{ fontSize: "13px", fontWeight: 500, padding: "6px 14px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>Save</button>
                <button onClick={() => setEditingDomain(null)} style={{ fontSize: "13px", padding: "6px 14px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer" }}>Cancel</button>
              </div>
            </div>
          ) : (
            <div
              style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: "12px", cursor: "pointer", background: "var(--color-background-primary)" }}
              onClick={() => setExpandedDomain(expandedDomain === domain.id ? null : domain.id)}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "14px", fontWeight: 500 }}>{domain.name}</div>
                <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "1px" }}>
                  {[domain.netbiosName, domain.functionalLevel].filter(Boolean).join(" · ")}
                </div>
              </div>
              {domain.credential && (
                <span style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "5px", padding: "2px 7px", flexShrink: 0 }}>
                  🔑 {domain.credential.username || domain.credential.label}
                </span>
              )}
              <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
                {domain.groups.length} {domain.groups.length === 1 ? "group" : "groups"}
              </span>
              <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{expandedDomain === domain.id ? "▲" : "▼"}</span>
              <button onClick={e => { e.stopPropagation(); setEditingDomain(domain.id); setEditForm({ ...domain }); setExpandedDomain(null) }}
                style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: "0 4px" }}>Edit</button>
              <button onClick={e => { e.stopPropagation(); deleteDomain(domain.id) }}
                style={{ fontSize: "12px", color: "var(--color-text-danger)", background: "none", border: "none", cursor: "pointer", padding: "0 4px" }}>Delete</button>
            </div>
          )}

          {/* Expanded groups */}
          {expandedDomain === domain.id && (
            <GroupsPanel domain={domain} onDomainChange={updated => onDomainsChange(domains.map(d => d.id === updated.id ? updated : d))} />
          )}
        </div>
      ))}
    </div>
  )
}

// ── Groups panel (inside expanded domain) ──────────────────────────────────────

function GroupsPanel({ domain, onDomainChange }: {
  domain: AdDomain
  onDomainChange: (d: AdDomain) => void
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: "", scope: "", purpose: "", membersRaw: "", notes: "" })
  const [saving, setSaving] = useState(false)
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)
  const [editingGroup, setEditingGroup] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<any>({})

  async function saveGroup() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const members = form.membersRaw.split(/[\n,]+/).map(s => s.trim()).filter(Boolean)
      const res = await fetch(`/api/ad-domains/${domain.id}/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, members }),
      })
      if (res.ok) {
        const created = await res.json()
        onDomainChange({ ...domain, groups: [...domain.groups, created] })
        setForm({ name: "", scope: "", purpose: "", membersRaw: "", notes: "" })
        setShowAdd(false)
      }
    } finally { setSaving(false) }
  }

  async function updateGroup(groupId: string) {
    setSaving(true)
    try {
      const members = editForm.membersRaw
        ? editForm.membersRaw.split(/[\n,]+/).map((s: string) => s.trim()).filter(Boolean)
        : editForm.members
      const res = await fetch(`/api/domain-groups/${groupId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...editForm, members }),
      })
      if (res.ok) {
        const updated = await res.json()
        onDomainChange({ ...domain, groups: domain.groups.map(g => g.id === groupId ? updated : g) })
        setEditingGroup(null)
      }
    } finally { setSaving(false) }
  }

  async function deleteGroup(groupId: string) {
    if (!confirm("Delete this group?")) return
    const res = await fetch(`/api/domain-groups/${groupId}`, { method: "DELETE" })
    if (res.ok) onDomainChange({ ...domain, groups: domain.groups.filter(g => g.id !== groupId) })
  }

  return (
    <div style={{ padding: "0 16px 16px", background: "var(--color-background-primary)", borderTop: "0.5px solid var(--color-border-tertiary)" }}>
      {(domain.notes || domain.credential) && (
        <div style={{ padding: "10px 0 8px", display: "flex", gap: "16px", alignItems: "flex-start", flexWrap: "wrap" }}>
          {domain.credential && (
            <span style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "5px", padding: "3px 8px" }}>
              🔑 {domain.credential.label}{domain.credential.username ? ` · ${domain.credential.username}` : ""}
            </span>
          )}
          {domain.notes && (
            <span style={{ fontSize: "13px", color: "var(--color-text-secondary)", fontStyle: "italic" }}>{domain.notes}</span>
          )}
        </div>
      )}

      {domain.groups.length === 0 && !showAdd && (
        <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", padding: "12px 0 8px" }}>No groups documented.</div>
      )}

      {domain.groups.map(group => (
        <div key={group.id} style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "8px", marginTop: "10px", overflow: "hidden" }}>
          {editingGroup === group.id ? (
            <div style={{ padding: "14px", background: "var(--color-background-secondary)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
                <div>
                  <label style={lbl}>Group name</label>
                  <input value={editForm.name || ""} onChange={e => setEditForm((f: any) => ({ ...f, name: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Scope</label>
                  <select value={editForm.scope || ""} onChange={e => setEditForm((f: any) => ({ ...f, scope: e.target.value }))} style={inp}>
                    <option value="">Unknown</option>
                    {["Global", "Universal", "Domain Local"].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={lbl}>Purpose</label>
                  <input value={editForm.purpose || ""} onChange={e => setEditForm((f: any) => ({ ...f, purpose: e.target.value }))} style={inp} />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={lbl}>Members (comma or newline separated samAccountNames)</label>
                  <textarea
                    value={editForm.membersRaw !== undefined ? editForm.membersRaw : editForm.members?.join("\n") || ""}
                    onChange={e => setEditForm((f: any) => ({ ...f, membersRaw: e.target.value }))}
                    rows={3} style={{ ...inp, resize: "vertical" }}
                  />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={lbl}>Notes</label>
                  <input value={editForm.notes || ""} onChange={e => setEditForm((f: any) => ({ ...f, notes: e.target.value }))} style={inp} />
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={() => updateGroup(group.id)} disabled={saving} style={{ fontSize: "13px", fontWeight: 500, padding: "6px 14px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>Save</button>
                <button onClick={() => setEditingGroup(null)} style={{ fontSize: "13px", padding: "6px 14px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer" }}>Cancel</button>
              </div>
            </div>
          ) : (
            <div
              style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", background: "var(--color-background-primary)" }}
              onClick={() => setExpandedGroup(expandedGroup === group.id ? null : group.id)}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: "13px", fontWeight: 500, fontFamily: "monospace" }}>{group.name}</span>
                {group.scope && <span style={{ fontSize: "11px", color: "var(--color-text-secondary)", marginLeft: "8px" }}>{group.scope}</span>}
                {group.purpose && <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "1px" }}>{group.purpose}</div>}
              </div>
              <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
                {group.members.length} {group.members.length === 1 ? "member" : "members"}
              </span>
              <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{expandedGroup === group.id ? "▲" : "▼"}</span>
              <button onClick={e => { e.stopPropagation(); setEditingGroup(group.id); setEditForm({ ...group }); setExpandedGroup(null) }}
                style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: "0 4px" }}>Edit</button>
              <button onClick={e => { e.stopPropagation(); deleteGroup(group.id) }}
                style={{ fontSize: "12px", color: "var(--color-text-danger)", background: "none", border: "none", cursor: "pointer", padding: "0 4px" }}>Delete</button>
            </div>
          )}

          {expandedGroup === group.id && group.members.length > 0 && (
            <div style={{ padding: "8px 12px 12px", borderTop: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-primary)" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {group.members.map(m => (
                  <span key={m} style={{ fontSize: "12px", fontFamily: "monospace", padding: "2px 8px", borderRadius: "4px", background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)" }}>
                    {m}
                  </span>
                ))}
              </div>
              {group.notes && <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "8px", fontStyle: "italic" }}>{group.notes}</div>}
            </div>
          )}
        </div>
      ))}

      {showAdd ? (
        <div style={{ ...card, marginTop: "12px" }}>
          <div style={{ fontSize: "14px", fontWeight: 500, marginBottom: "12px" }}>New group</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
            <div>
              <label style={lbl}>Group name *</label>
              <input autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Finance_Users" style={inp} />
            </div>
            <div>
              <label style={lbl}>Scope</label>
              <select value={form.scope} onChange={e => setForm(f => ({ ...f, scope: e.target.value }))} style={inp}>
                <option value="">Unknown</option>
                {["Global", "Universal", "Domain Local"].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={lbl}>Purpose</label>
              <input value={form.purpose} onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))} placeholder="Who uses this group" style={inp} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={lbl}>Members (comma or newline separated)</label>
              <textarea value={form.membersRaw} onChange={e => setForm(f => ({ ...f, membersRaw: e.target.value }))} placeholder={"jsmith\nmdoe\njones"} rows={3} style={{ ...inp, resize: "vertical" }} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={lbl}>Notes</label>
              <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={inp} />
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={saveGroup} disabled={saving} style={{ fontSize: "13px", fontWeight: 500, padding: "6px 14px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>
              {saving ? "Saving..." : "Save"}
            </button>
            <button onClick={() => setShowAdd(false)} style={{ fontSize: "13px", padding: "6px 14px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)} style={{ fontSize: "13px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: "4px 0", marginTop: "10px" }}>
          + Add group
        </button>
      )}
    </div>
  )
}
