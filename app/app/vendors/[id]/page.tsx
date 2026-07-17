"use client"

import AppShell from "@/components/AppShell"
import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import VendorContractsPanel from "@/components/VendorContractsPanel"
import AttachmentsPanel from "@/components/AttachmentsPanel"
import RelationLinker from "@/components/RelationLinker"

const CATEGORIES = ["ISP", "SOFTWARE", "HARDWARE", "TELECOM", "CLOUD", "SECURITY", "SERVICES", "OTHER"]

type VendorContact = {
  id: string
  name: string
  role: string | null
  email: string | null
  phone: string | null
  mobile: string | null
  notes: string | null
}

type LinkedClient = { id: string; name: string }

type Vendor = {
  id: string
  name: string
  category: string
  website: string | null
  supportUrl: string | null
  supportPhone: string | null
  supportEmail: string | null
  accountNumber: string | null
  portalUrl: string | null
  notes: string | null
  isActive: boolean
  contacts: VendorContact[]
  clients: LinkedClient[]
  _count: { licenses: number }
}

const inputStyle = {
  width: "100%", padding: "8px 12px", fontSize: "14px",
  border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px",
  background: "var(--color-background-primary)", color: "var(--color-text-primary)",
  boxSizing: "border-box" as const,
}
const labelStyle = {
  fontSize: "13px", color: "var(--color-text-secondary)",
  display: "block", marginBottom: "4px",
}

export default function VendorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [vendor, setVendor] = useState<Vendor | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<Partial<Vendor>>({})
  const [savingEdit, setSavingEdit] = useState(false)
  const [showAddContact, setShowAddContact] = useState(false)
  const [contactForm, setContactForm] = useState({ name: "", role: "", email: "", phone: "", mobile: "", notes: "" })
  const [savingContact, setSavingContact] = useState(false)
  const [editingContact, setEditingContact] = useState<string | null>(null)
  const [contactEditForm, setContactEditForm] = useState<Partial<VendorContact>>({})
  const [allClients, setAllClients] = useState<LinkedClient[]>([])
  const [linkClientId, setLinkClientId] = useState("")
  const [linkingClient, setLinkingClient] = useState(false)
  const [vendorLicenses, setVendorLicenses] = useState<any[]>([])
  const [vendorApplications, setVendorApplications] = useState<any[]>([])

  useEffect(() => { fetchVendor(); fetchAllClients(); fetchVendorLicenses(); fetchVendorApplications() }, [id])

  async function fetchVendorLicenses() {
    try {
      const r = await fetch(`/api/licenses?vendorId=${id}`)
      if (r.ok) setVendorLicenses(await r.json())
    } catch {}
  }
  async function fetchVendorApplications() {
    try {
      const r = await fetch(`/api/applications?vendorId=${id}`)
      if (r.ok) setVendorApplications(await r.json())
    } catch {}
  }

  async function fetchAllClients() {
    try {
      const res = await fetch("/api/clients")
      const data = await res.json()
      setAllClients(data.map((c: any) => ({ id: c.id, name: c.name })))
    } catch {}
  }

  async function fetchVendor() {
    setLoading(true)
    try {
      const res = await fetch(`/api/vendors/${id}`)
      if (!res.ok) { router.push("/vendors"); return }
      const data = await res.json()
      setVendor(data)
      setEditForm(data)
    } catch (e) {
      router.push("/vendors")
    } finally {
      setLoading(false)
    }
  }

  async function saveEdit() {
    if (!editForm.name?.trim()) return
    setSavingEdit(true)
    try {
      const res = await fetch(`/api/vendors/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      })
      if (res.ok) { setVendor(await res.json()); setEditing(false) }
    } finally {
      setSavingEdit(false)
    }
  }

  async function deleteVendor() {
    if (!confirm(`Delete ${vendor?.name}? This cannot be undone.`)) return
    await fetch(`/api/vendors/${id}`, { method: "DELETE" })
    router.push("/vendors")
  }

  async function linkClient() {
    if (!linkClientId) return
    setLinkingClient(true)
    try {
      await fetch(`/api/vendors/${id}/clients`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: linkClientId }),
      })
      setLinkClientId("")
      await fetchVendor()
    } finally {
      setLinkingClient(false)
    }
  }

  async function unlinkClient(clientId: string) {
    await fetch(`/api/vendors/${id}/clients`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId }),
    })
    await fetchVendor()
  }

  async function addContact() {
    if (!contactForm.name.trim()) return
    setSavingContact(true)
    try {
      const res = await fetch(`/api/vendors/${id}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contactForm),
      })
      if (res.ok) {
        setContactForm({ name: "", role: "", email: "", phone: "", mobile: "", notes: "" })
        setShowAddContact(false)
        await fetchVendor()
      }
    } finally {
      setSavingContact(false)
    }
  }

  async function saveContactEdit(contactId: string) {
    await fetch(`/api/vendors/${id}/contacts/${contactId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(contactEditForm),
    })
    setEditingContact(null)
    await fetchVendor()
  }

  async function deleteContact(contactId: string) {
    if (!confirm("Delete this contact?")) return
    await fetch(`/api/vendors/${id}/contacts/${contactId}`, { method: "DELETE" })
    await fetchVendor()
  }

  if (loading) {
    return (
      <AppShell>
        <div style={{ padding: "32px", color: "var(--color-text-secondary)", fontSize: "14px" }}>Loading...</div>
      </AppShell>
    )
  }

  if (!vendor) return null

  const linkedClientIds = new Set(vendor.clients.map(c => c.id))
  const unlinkableClients = allClients.filter(c => !linkedClientIds.has(c.id))

  return (
    <AppShell>
      <div style={{ padding: "32px", maxWidth: "800px" }}>

        {/* Header */}
        <div style={{ marginBottom: "32px" }}>
          <button
            onClick={() => router.push("/vendors")}
            style={{ fontSize: "13px", color: "var(--color-text-secondary)", background: "none", border: "none", padding: 0, cursor: "pointer", marginBottom: "12px" }}
          >
            ← Vendors
          </button>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
                <h1 style={{ fontSize: "22px", fontWeight: 500, margin: 0 }}>{vendor.name}</h1>
                <span style={{
                  fontSize: "11px", padding: "2px 8px", borderRadius: "20px",
                  background: "var(--color-background-hover)", color: "var(--color-text-secondary)",
                }}>
                  {vendor.category.charAt(0) + vendor.category.slice(1).toLowerCase()}
                </span>
              </div>
              {vendor.website && (
                <a href={vendor.website} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>
                  {vendor.website}
                </a>
              )}
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => { setEditing(true); setEditForm(vendor) }}
                className="btn btn-secondary"
              >
                Edit
              </button>
              <button
                onClick={deleteVendor}
                className="btn btn-danger"
              >
                Delete
              </button>
            </div>
          </div>
        </div>

        {/* Edit form */}
        {editing && (
          <div style={{
            background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-secondary)",
            borderRadius: "10px", padding: "20px", marginBottom: "24px",
          }}>
            <div style={{ fontSize: "15px", fontWeight: 500, marginBottom: "16px" }}>Edit vendor</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Vendor name *</label>
                <input style={inputStyle} value={editForm.name ?? ""}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Category</label>
                <select style={inputStyle} value={(editForm as any).category ?? "OTHER"}
                  onChange={(e) => setEditForm({ ...editForm, category: e.target.value } as any)}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Website</label>
                <input style={inputStyle} value={editForm.website ?? ""}
                  onChange={(e) => setEditForm({ ...editForm, website: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Support URL</label>
                <input style={inputStyle} value={editForm.supportUrl ?? ""}
                  onChange={(e) => setEditForm({ ...editForm, supportUrl: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Portal URL</label>
                <input style={inputStyle} value={editForm.portalUrl ?? ""}
                  onChange={(e) => setEditForm({ ...editForm, portalUrl: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Support phone</label>
                <input style={inputStyle} value={editForm.supportPhone ?? ""}
                  onChange={(e) => setEditForm({ ...editForm, supportPhone: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Support email</label>
                <input style={inputStyle} value={editForm.supportEmail ?? ""}
                  onChange={(e) => setEditForm({ ...editForm, supportEmail: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Account number</label>
                <input style={inputStyle} value={editForm.accountNumber ?? ""}
                  onChange={(e) => setEditForm({ ...editForm, accountNumber: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Notes</label>
                <input style={inputStyle} value={editForm.notes ?? ""}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={saveEdit} disabled={savingEdit} style={{
                fontSize: "14px", fontWeight: 500, padding: "8px 16px", borderRadius: "8px",
                border: "none", background: "var(--color-text-primary)",
                color: "var(--color-background-primary)", cursor: "pointer",
              }}>
                {savingEdit ? "Saving..." : "Save"}
              </button>
              <button onClick={() => setEditing(false)} className="btn btn-ghost">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Details card */}
        {!editing && (
          <div style={{
            background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)",
            borderRadius: "10px", padding: "20px", marginBottom: "32px",
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px",
          }}>
            {[
              { label: "Support phone", value: vendor.supportPhone },
              { label: "Support email", value: vendor.supportEmail },
              { label: "Support URL", value: vendor.supportUrl },
              { label: "Portal URL", value: vendor.portalUrl },
              { label: "Account number", value: vendor.accountNumber },
              { label: "Notes", value: vendor.notes },
            ].map(({ label, value }) => value ? (
              <div key={label}>
                <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginBottom: "2px" }}>{label}</div>
                <div style={{ fontSize: "14px", color: "var(--color-text-primary)" }}>
                  {label.includes("URL") ? (
                    <a href={value} target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-text-primary)" }}>{value}</a>
                  ) : value}
                </div>
              </div>
            ) : null)}
          </div>
        )}

        {/* Linked clients */}
        <div style={{ marginBottom: "32px" }}>
          <div style={{ fontSize: "16px", fontWeight: 500, marginBottom: "14px" }}>Linked clients</div>
          <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
            <select style={{ ...inputStyle, flex: 1, maxWidth: "280px" }}
              value={linkClientId} onChange={(e) => setLinkClientId(e.target.value)}>
              <option value="">Select a client to link...</option>
              {unlinkableClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button onClick={linkClient} disabled={!linkClientId || linkingClient} className="btn btn-secondary">
              {linkingClient ? "Linking..." : "Link"}
            </button>
          </div>
          {vendor.clients.length === 0 ? (
            <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>No clients linked yet.</div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {vendor.clients.map(c => (
                <div key={c.id} style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  padding: "4px 10px", borderRadius: "20px",
                  border: "0.5px solid var(--color-border-secondary)",
                  fontSize: "13px", background: "var(--color-background-secondary)",
                }}>
                  <span style={{ cursor: "pointer", color: "var(--color-text-primary)" }}
                    onClick={() => router.push(`/clients/${c.id}`)}>
                    {c.name}
                  </span>
                  <button onClick={() => unlinkClient(c.id)} style={{
                    background: "none", border: "none", cursor: "pointer",
                    color: "var(--color-text-secondary)", fontSize: "12px", padding: 0,
                  }}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Contacts */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div style={{ fontSize: "16px", fontWeight: 500 }}>Contacts</div>
          <button
            onClick={() => setShowAddContact(true)}
            className="btn btn-secondary"
          >
            Add contact
          </button>
        </div>

        {showAddContact && (
          <div style={{
            background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-secondary)",
            borderRadius: "10px", padding: "20px", marginBottom: "16px",
          }}>
            <div style={{ fontSize: "14px", fontWeight: 500, marginBottom: "12px" }}>New contact</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
              <div>
                <label style={labelStyle}>Name *</label>
                <input autoFocus style={inputStyle} value={contactForm.name}
                  onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Role</label>
                <input style={inputStyle} value={contactForm.role}
                  onChange={(e) => setContactForm({ ...contactForm, role: e.target.value })}
                  placeholder="e.g. Account Manager" />
              </div>
              <div>
                <label style={labelStyle}>Email</label>
                <input style={inputStyle} value={contactForm.email}
                  onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Phone</label>
                <input style={inputStyle} value={contactForm.phone}
                  onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Mobile</label>
                <input style={inputStyle} value={contactForm.mobile}
                  onChange={(e) => setContactForm({ ...contactForm, mobile: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Notes</label>
                <input style={inputStyle} value={contactForm.notes}
                  onChange={(e) => setContactForm({ ...contactForm, notes: e.target.value })} />
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={addContact} disabled={savingContact} style={{
                fontSize: "14px", fontWeight: 500, padding: "8px 16px", borderRadius: "8px",
                border: "none", background: "var(--color-text-primary)",
                color: "var(--color-background-primary)", cursor: "pointer",
              }}>
                {savingContact ? "Saving..." : "Add contact"}
              </button>
              <button onClick={() => setShowAddContact(false)} className="btn btn-ghost">
                Cancel
              </button>
            </div>
          </div>
        )}

        <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "10px", overflow: "hidden" }}>
          {vendor.contacts.length === 0 ? (
            <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--color-text-secondary)", fontSize: "14px" }}>
              No contacts yet.
            </div>
          ) : vendor.contacts.map((contact, i) => (
            <div key={contact.id} style={{
              padding: "14px 16px",
              borderBottom: i < vendor.contacts.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none",
              background: "var(--color-background-primary)",
            }}>
              {editingContact === contact.id ? (
                <div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
                    {(["name", "role", "email", "phone", "mobile", "notes"] as const).map((field) => (
                      <div key={field}>
                        <label style={labelStyle}>{field.charAt(0).toUpperCase() + field.slice(1)}</label>
                        <input style={inputStyle} value={contactEditForm[field] ?? ""}
                          onChange={(e) => setContactEditForm({ ...contactEditForm, [field]: e.target.value })} />
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button onClick={() => saveContactEdit(contact.id)} style={{
                      fontSize: "13px", fontWeight: 500, padding: "6px 14px", borderRadius: "8px",
                      border: "none", background: "var(--color-text-primary)",
                      color: "var(--color-background-primary)", cursor: "pointer",
                    }}>Save</button>
                    <button onClick={() => setEditingContact(null)} className="btn btn-ghost">Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-text-primary)" }}>{contact.name}</div>
                    {contact.role && <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginTop: "2px" }}>{contact.role}</div>}
                    <div style={{ display: "flex", gap: "16px", marginTop: "6px", flexWrap: "wrap" }}>
                      {contact.email && (
                        <a href={`mailto:${contact.email}`} style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>{contact.email}</a>
                      )}
                      {contact.phone && <span style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>{contact.phone}</span>}
                      {contact.mobile && <span style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>{contact.mobile} (mobile)</span>}
                    </div>
                    {contact.notes && <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginTop: "4px" }}>{contact.notes}</div>}
                  </div>
                  <div style={{ display: "flex", gap: "8px", marginLeft: "16px" }}>
                    <button onClick={() => { setEditingContact(contact.id); setContactEditForm(contact) }} style={{
                      fontSize: "12px", padding: "4px 10px", borderRadius: "6px",
                      border: "0.5px solid var(--color-border-secondary)",
                      background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)",
                    }}>Edit</button>
                    <button onClick={() => deleteContact(contact.id)} className="btn btn-danger btn-sm">Delete</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <VendorContractsPanel vendorId={id} />

        <RelationLinker
          title="Licenses"
          itemNoun="license"
          currentLinks={vendorLicenses.map((l: any) => ({
            id: l.id, label: l.name,
            sublabel: l.client?.name ? `${l.client.name}${l.seats ? ` · ${l.seats} seats` : ""}` : undefined,
            href: `/clients/${l.clientId}?tab=Licenses`,
          }))}
          searchEndpoint={`/api/licenses?excludeVendorId=${id}`}
          mapOption={(r) => ({ id: r.id, label: r.name, sublabel: r.client?.name || undefined })}
          confirmUnlink
          onLink={async (childIds) => {
            const res = await fetch(`/api/vendors/${id}/licenses`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ childIds }),
            })
            if (res.ok) fetchVendorLicenses()
          }}
          onUnlink={async (childId) => {
            const res = await fetch(`/api/vendors/${id}/licenses?childId=${childId}`, { method: "DELETE" })
            if (res.ok) fetchVendorLicenses()
          }}
        />

        <RelationLinker
          title="Applications"
          itemNoun="application"
          currentLinks={vendorApplications.map((a: any) => ({
            id: a.id, label: a.name,
            sublabel: a.clientId ? `client-scoped` : undefined,
            href: `/clients/${a.clientId}?tab=Applications`,
          }))}
          searchEndpoint={`/api/applications?excludeVendorId=${id}`}
          mapOption={(r) => ({ id: r.id, label: r.name })}
          onLink={async (childIds) => {
            const res = await fetch(`/api/vendors/${id}/applications`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ childIds }),
            })
            if (res.ok) fetchVendorApplications()
          }}
          onUnlink={async (childId) => {
            const res = await fetch(`/api/vendors/${id}/applications?childId=${childId}`, { method: "DELETE" })
            if (res.ok) fetchVendorApplications()
          }}
        />

        <AttachmentsPanel entityType="vendor" entityId={id} />
      </div>
    </AppShell>
  )
}
