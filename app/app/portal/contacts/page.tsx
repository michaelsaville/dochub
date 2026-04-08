"use client"

import { useState, useEffect } from "react"
import { usePortalUser } from "../layout"

type Contact = {
  id: string; name: string; role: string | null; email: string | null
  phone: string | null; mobile: string | null; isPrimary: boolean; isBilling: boolean
}

export default function PortalContacts() {
  const user = usePortalUser()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    fetch("/api/portal/contacts").then(r => r.ok ? r.json() : []).then(setContacts).finally(() => setLoading(false))
  }, [user])

  if (!user?.permissions.contacts) return <div style={{ color: "var(--color-text-secondary)" }}>Access not enabled for this section.</div>

  return (
    <div>
      <h1 style={{ fontSize: "20px", fontWeight: 500, marginBottom: "4px" }}>Contacts</h1>
      <p style={{ fontSize: "14px", color: "var(--color-text-secondary)", marginBottom: "24px" }}>Your organisation's contact directory.</p>
      {loading && <div style={{ color: "var(--color-text-secondary)" }}>Loading...</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "12px" }}>
        {contacts.map(c => (
          <div key={c.id} style={{ padding: "16px 18px", borderRadius: "10px", background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <div style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-text-primary)" }}>{c.name}</div>
              {c.isPrimary && <span style={{ fontSize: "10px", padding: "1px 6px", borderRadius: "6px", background: "rgba(61,111,255,0.12)", color: "var(--accent)", fontWeight: 600 }}>PRIMARY</span>}
              {c.isBilling && <span style={{ fontSize: "10px", padding: "1px 6px", borderRadius: "6px", background: "rgba(0,212,170,0.12)", color: "var(--accent2)", fontWeight: 600 }}>BILLING</span>}
            </div>
            {c.role && <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginBottom: "8px" }}>{c.role}</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {c.email && <a href={`mailto:${c.email}`} style={{ fontSize: "13px", color: "var(--accent)", textDecoration: "none" }}>{c.email}</a>}
              {c.phone && <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>{c.phone}</div>}
              {c.mobile && <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>{c.mobile} <span style={{ color: "var(--color-text-muted)", fontSize: "11px" }}>mobile</span></div>}
            </div>
          </div>
        ))}
      </div>
      {!loading && contacts.length === 0 && <div style={{ color: "var(--color-text-secondary)" }}>No contacts found.</div>}
    </div>
  )
}
