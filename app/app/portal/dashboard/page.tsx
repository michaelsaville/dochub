"use client"

import { usePortalUser } from "../layout"

const SECTION_LINKS = [
  { key: "assets",    label: "Assets",    desc: "View your devices and equipment",      href: "/portal/assets",    icon: "🖥" },
  { key: "documents", label: "Documents", desc: "View documents shared with you",        href: "/portal/documents", icon: "📄" },
  { key: "contacts",  label: "Contacts",  desc: "Your team contact directory",           href: "/portal/contacts",  icon: "👤" },
  { key: "locations", label: "Locations", desc: "Your office and site information",      href: "/portal/locations", icon: "📍" },
  { key: "licenses",  label: "Licenses",  desc: "Your software licenses and renewals",   href: "/portal/licenses",  icon: "🔑" },
  { key: "domains",   label: "Domains",   desc: "Domain and SSL certificate status",     href: "/portal/domains",   icon: "🌐" },
]

export default function PortalDashboard() {
  const user = usePortalUser()

  const available = SECTION_LINKS.filter(s => user?.permissions[s.key])

  return (
    <div>
      <h1 style={{ fontSize: "22px", fontWeight: 500, marginBottom: "4px", color: "var(--color-text-primary)" }}>
        Welcome{user ? `, ${user.name.split(" ")[0]}` : ""}
      </h1>
      <p style={{ fontSize: "14px", color: "var(--color-text-secondary)", marginBottom: "32px" }}>
        {user?.client.name} — Client Portal
      </p>

      {available.length === 0 ? (
        <div style={{ fontSize: "14px", color: "var(--color-text-secondary)" }}>
          No sections have been enabled for your account yet. Contact your IT support team.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "14px" }}>
          {available.map(s => (
            <a key={s.key} href={s.href} style={{ textDecoration: "none" }}>
              <div style={{
                padding: "20px 22px", borderRadius: "12px",
                background: "var(--color-background-secondary)",
                border: "0.5px solid var(--color-border-tertiary)",
                transition: "border-color 0.15s",
                cursor: "pointer",
              }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--accent)")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--color-border-tertiary)")}
              >
                <div style={{ fontSize: "24px", marginBottom: "10px" }}>{s.icon}</div>
                <div style={{ fontSize: "15px", fontWeight: 500, color: "var(--color-text-primary)", marginBottom: "4px" }}>{s.label}</div>
                <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>{s.desc}</div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
