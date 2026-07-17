"use client"

import AppShell from "@/components/AppShell"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"

const CATEGORIES = ["ISP", "SOFTWARE", "HARDWARE", "TELECOM", "CLOUD", "SECURITY", "SERVICES", "OTHER"]

type Vendor = {
  id: string
  name: string
  category: string
  supportPhone: string | null
  supportEmail: string | null
  website: string | null
  isActive: boolean
  _count: { contacts: number; clients: number; licenses: number }
}

export default function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("")
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const router = useRouter()

  const [form, setForm] = useState({
    name: "", category: "OTHER", website: "", supportUrl: "", supportPhone: "",
    supportEmail: "", accountNumber: "", portalUrl: "", notes: "",
  })

  useEffect(() => { fetchVendors() }, [])

  async function fetchVendors() {
    setLoading(true)
    try {
      const res = await fetch("/api/vendors")
      setVendors(await res.json())
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function addVendor() {
    if (!form.name.trim()) { setError("Name is required"); return }
    setSaving(true)
    setError("")
    try {
      const res = await fetch("/api/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (!res.ok) { setError("Failed to create vendor"); return }
      const vendor = await res.json()
      setShowAdd(false)
      setForm({ name: "", category: "OTHER", website: "", supportUrl: "", supportPhone: "", supportEmail: "", accountNumber: "", portalUrl: "", notes: "" })
      router.push("/vendors/" + vendor.id)
    } catch (e) {
      setError("Failed to create vendor")
    } finally {
      setSaving(false)
    }
  }

  const filtered = vendors.filter((v) => {
    const matchSearch = v.name.toLowerCase().includes(search.toLowerCase())
    const matchCat = !categoryFilter || v.category === categoryFilter
    return matchSearch && matchCat
  })

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

  return (
    <AppShell>
      <div style={{ padding: "32px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }}>
          <div>
            <h1 style={{ fontSize: "22px", fontWeight: 500, marginBottom: "4px" }}>Vendors</h1>
            <p style={{ fontSize: "14px", color: "var(--color-text-secondary)" }}>
              {loading ? "Loading..." : `${vendors.length} vendors`}
            </p>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="btn btn-secondary"
          >
            Add vendor
          </button>
        </div>

        {showAdd && (
          <div style={{
            background: "var(--color-background-secondary)",
            border: "0.5px solid var(--color-border-secondary)",
            borderRadius: "10px", padding: "20px", marginBottom: "20px", maxWidth: "560px",
          }}>
            <div style={{ fontSize: "15px", fontWeight: 500, marginBottom: "16px" }}>New vendor</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Vendor name *</label>
                <input autoFocus style={inputStyle} value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && addVendor()}
                  placeholder="e.g. Microsoft" />
              </div>
              <div>
                <label style={labelStyle}>Category</label>
                <select style={inputStyle} value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Website</label>
                <input style={inputStyle} value={form.website}
                  onChange={(e) => setForm({ ...form, website: e.target.value })}
                  placeholder="https://..." />
              </div>
              <div>
                <label style={labelStyle}>Support URL</label>
                <input style={inputStyle} value={form.supportUrl}
                  onChange={(e) => setForm({ ...form, supportUrl: e.target.value })}
                  placeholder="https://support..." />
              </div>
              <div>
                <label style={labelStyle}>Portal URL</label>
                <input style={inputStyle} value={form.portalUrl}
                  onChange={(e) => setForm({ ...form, portalUrl: e.target.value })}
                  placeholder="https://portal..." />
              </div>
              <div>
                <label style={labelStyle}>Support phone</label>
                <input style={inputStyle} value={form.supportPhone}
                  onChange={(e) => setForm({ ...form, supportPhone: e.target.value })}
                  placeholder="+1 800 ..." />
              </div>
              <div>
                <label style={labelStyle}>Support email</label>
                <input style={inputStyle} value={form.supportEmail}
                  onChange={(e) => setForm({ ...form, supportEmail: e.target.value })}
                  placeholder="support@..." />
              </div>
              <div>
                <label style={labelStyle}>Account number</label>
                <input style={inputStyle} value={form.accountNumber}
                  onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
                  placeholder="Our account / partner ID" />
              </div>
              <div>
                <label style={labelStyle}>Notes</label>
                <input style={inputStyle} value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            {error && <div style={{ fontSize: "13px", color: "var(--color-text-danger)", marginBottom: "12px" }}>{error}</div>}
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={addVendor} disabled={saving}
                style={{
                  fontSize: "14px", fontWeight: 500, padding: "8px 16px", borderRadius: "8px",
                  border: "none", background: "var(--color-text-primary)",
                  color: "var(--color-background-primary)", cursor: "pointer",
                }}
              >
                {saving ? "Saving..." : "Create vendor"}
              </button>
              <button
                onClick={() => { setShowAdd(false); setError("") }}
                className="btn btn-ghost"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: "12px", marginBottom: "16px", maxWidth: "600px" }}>
          <input
            type="text" placeholder="Search vendors..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="filter-input" style={{ flex: 1 }}
          />
          <select
            value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
            style={{ ...inputStyle, width: "160px", flex: "none" }}
          >
            <option value="">All categories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</option>)}
          </select>
        </div>

        <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "10px", overflow: "hidden" }}>
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 120px 160px 160px 80px",
            padding: "10px 16px", borderBottom: "0.5px solid var(--color-border-tertiary)",
            background: "var(--color-background-secondary)",
          }}>
            {["Vendor", "Category", "Support phone", "Support email", "Linked"].map((h) => (
              <div key={h} style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-secondary)" }}>{h}</div>
            ))}
          </div>

          {loading ? (
            <div style={{ padding: "48px 16px", textAlign: "center", color: "var(--color-text-secondary)", fontSize: "14px" }}>
              Loading vendors...
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: "48px 16px", textAlign: "center", color: "var(--color-text-secondary)", fontSize: "14px" }}>
              {search || categoryFilter ? "No vendors match your filter." : "No vendors yet."}
            </div>
          ) : (
            filtered.map((vendor, i) => (
              <div
                key={vendor.id}
                onClick={() => router.push("/vendors/" + vendor.id)}
                style={{
                  display: "grid", gridTemplateColumns: "1fr 120px 160px 160px 80px",
                  padding: "12px 16px", cursor: "pointer",
                  borderBottom: i < filtered.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none",
                  background: "var(--color-background-primary)",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-background-secondary)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "var(--color-background-primary)")}
              >
                <div>
                  <div style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-text-primary)" }}>{vendor.name}</div>
                  {vendor.website && (
                    <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "2px" }}>{vendor.website}</div>
                  )}
                </div>
                <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", alignSelf: "center" }}>
                  <span style={{
                    fontSize: "11px", padding: "2px 8px", borderRadius: "20px",
                    background: "var(--color-background-hover)",
                    color: "var(--color-text-secondary)",
                  }}>
                    {vendor.category.charAt(0) + vendor.category.slice(1).toLowerCase()}
                  </span>
                </div>
                <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", alignSelf: "center" }}>
                  {vendor.supportPhone ?? "—"}
                </div>
                <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", alignSelf: "center" }}>
                  {vendor.supportEmail ?? "—"}
                </div>
                <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", alignSelf: "center" }}>
                  {vendor._count.clients}c / {vendor._count.licenses}lic
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </AppShell>
  )
}
