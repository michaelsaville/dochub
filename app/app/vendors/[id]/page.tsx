"use client"

import AppShell from "@/components/AppShell"
import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"

type VendorContact = {
  id: string
  name: string
  role: string | null
  email: string | null
  phone: string | null
  mobile: string | null
  notes: string | null
}

type Vendor = {
  id: string
  name: string
  website: string | null
  supportUrl: string | null
  supportPhone: string | null
  supportEmail: string | null
  accountNumber: string | null
  notes: string | null
  isActive: boolean
  contacts: VendorContact[]
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

  useEffect(() => { fetchVendor() }, [id])

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
              <h1 style={{ fontSize: "22px", fontWeight: 500, marginBottom: "4px" }}>{vendor.name}</h1>
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
                style={{
                  fontSize: "13px", padding: "6px 14px", borderRadius: "8px",
                  border: "0.5px solid var(--color-border-secondary)",
                  background: "var(--color-background-primary)", cursor: "pointer", color: "var(--color-text-primary)",
                }}
              >
                Edit
              </button>
              <button
                onClick={deleteVendor}
                style={{
                  fontSize: "13px", padding: "6px 14px", borderRadius: "8px",
                  border: "0.5px solid var(--color-border-secondary)",
                  background: "transparent", cursor: "pointer", color: "var(--color-text-danger)",
                }}
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
              <button onClick={() => setEditing(false)} style={{
                fontSize: "14px", padding: "8px 16px", borderRadius: "8px",
                border: "0.5px solid var(--color-border-secondary)",
                background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)",
              }}>
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
              { label: "Account number", value: vendor.accountNumber },
              { label: "Notes", value: vendor.notes },
            ].map(({ label, value }) => value ? (
              <div key={label}>
                <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginBottom: "2px" }}>{label}</div>
                <div style={{ fontSize: "14px", color: "var(--color-text-primary)" }}>
                  {label === "Support URL" || label === "Website" ? (
                    <a href={value} target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-text-primary)" }}>{value}</a>
                  ) : value}
                </div>
              </div>
            ) : null)}
          </div>
        )}

        {/* Contacts */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div style={{ fontSize: "16px", fontWeight: 500 }}>Contacts</div>
          <button
            onClick={() => setShowAddContact(true)}
            style={{
              fontSize: "13px", padding: "6px 14px", borderRadius: "8px",
              border: "0.5px solid var(--color-border-secondary)",
              background: "var(--color-background-primary)", cursor: "pointer", color: "var(--color-text-primary)",
            }}
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
              <button onClick={() => setShowAddContact(false)} style={{
                fontSize: "14px", padding: "8px 16px", borderRadius: "8px",
                border: "0.5px solid var(--color-border-secondary)",
                background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)",
              }}>
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
                    <button onClick={() => setEditingContact(null)} style={{
                      fontSize: "13px", padding: "6px 14px", borderRadius: "8px",
                      border: "0.5px solid var(--color-border-secondary)",
                      background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)",
                    }}>Cancel</button>
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
                    <button onClick={() => deleteContact(contact.id)} style={{
                      fontSize: "12px", padding: "4px 10px", borderRadius: "6px",
                      border: "0.5px solid var(--color-border-secondary)",
                      background: "transparent", cursor: "pointer", color: "var(--color-text-danger)",
                    }}>Delete</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  )
}
