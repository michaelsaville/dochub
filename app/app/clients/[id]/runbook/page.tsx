"use client"

import AppShell from "@/components/AppShell"
import { useState, useEffect, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { marked } from "marked"

const ALL_MODULES = [
  { id: "assets",      label: "Assets",       icon: "💻" },
  { id: "credentials", label: "Credentials",  icon: "🔑" },
  { id: "licenses",    label: "Licenses",     icon: "📋" },
  { id: "vendors",     label: "Vendors",      icon: "🏢" },
  { id: "network",     label: "Network / IPAM", icon: "🌐" },
  { id: "contacts",    label: "Contacts",     icon: "👥" },
  { id: "users",       label: "Users",        icon: "👤" },
  { id: "locations",   label: "Locations",    icon: "📍" },
  { id: "websites",    label: "Websites",     icon: "🔗" },
  { id: "sops",        label: "SOPs",         icon: "📄" },
]

function fmt(d: string | null | undefined) {
  if (!d) return "—"
  return new Date(d).toLocaleDateString()
}

export default function RunbookPage() {
  const { id } = useParams()
  const router = useRouter()
  const [clientName, setClientName] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set(["assets", "credentials", "licenses", "vendors", "network", "contacts"]))
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<any>(null)
  const [generated, setGenerated] = useState(false)
  const reportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(`/api/clients/${id}`)
      .then(r => r.json())
      .then(c => setClientName(c.name ?? ""))
  }, [id])

  function toggle(mod: string) {
    setSelected(s => {
      const n = new Set(s)
      n.has(mod) ? n.delete(mod) : n.add(mod)
      return n
    })
  }

  async function generate() {
    if (selected.size === 0) return
    setLoading(true)
    setGenerated(false)
    try {
      const res = await fetch(`/api/clients/${id}/report?modules=${[...selected].join(",")}`)
      const json = await res.json()
      setData(json)
      setGenerated(true)
      setTimeout(() => reportRef.current?.scrollIntoView({ behavior: "smooth" }), 100)
    } finally {
      setLoading(false)
    }
  }

  function printReport() {
    window.print()
  }

  const generatedAt = new Date().toLocaleString()

  return (
    <>
      {/* Print styles — hidden in screen, visible in print */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-root { padding: 0 !important; }
          body { background: white !important; color: black !important; font-family: Arial, sans-serif; }
          .report-section { page-break-inside: avoid; }
          .report-table { width: 100%; border-collapse: collapse; font-size: 11px; }
          .report-table th { background: #1e293b; color: white; padding: 6px 8px; text-align: left; }
          .report-table td { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; }
          .report-table tr:nth-child(even) td { background: #f8fafc; }
          .report-header { border-bottom: 2px solid #1e293b; padding-bottom: 12px; margin-bottom: 24px; }
          .section-title { font-size: 14px; font-weight: bold; color: #1e293b; margin: 20px 0 8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; }
          .credential-password { font-family: monospace; background: #fef9c3; padding: 1px 4px; border-radius: 3px; }
        }
        @media screen {
          .report-table { width: 100%; border-collapse: collapse; font-size: 13px; }
          .report-table th { background: var(--color-background-secondary); color: var(--color-text-secondary); padding: 8px 10px; text-align: left; font-weight: 600; font-size: 12px; border-bottom: 1px solid var(--color-border-tertiary); }
          .report-table td { padding: 8px 10px; border-bottom: 0.5px solid var(--color-border-tertiary); color: var(--color-text-primary); }
          .section-title { font-size: 15px; font-weight: 600; color: var(--color-text-primary); margin: 28px 0 12px; }
          .report-header { border-bottom: 1px solid var(--color-border-tertiary); padding-bottom: 16px; margin-bottom: 24px; }
          .credential-password { font-family: monospace; background: #fef9c3; color: #713f12; padding: 1px 6px; border-radius: 4px; font-size: 12px; }
        }
      `}</style>

      <AppShell>
        <div className="print-root" style={{ padding: "32px", maxWidth: "960px" }}>

          {/* Config panel — hidden on print */}
          <div className="no-print">
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
              <button onClick={() => router.back()} style={{ fontSize: "13px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>← Back</button>
            </div>
            <div style={{ marginBottom: "6px" }}>
              <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--color-text-primary)" }}>Generate Runbook</div>
              {clientName && <div style={{ fontSize: "14px", color: "var(--color-text-secondary)", marginTop: "2px" }}>{clientName}</div>}
            </div>
            <p style={{ fontSize: "13px", color: "var(--color-text-muted)", marginTop: "8px", marginBottom: "24px" }}>
              Select the modules to include, then generate a printable report. Use your browser's Print (Ctrl+P / ⌘+P) to save as PDF.
            </p>

            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: "10px" }}>Modules</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "8px", marginBottom: "24px" }}>
              {ALL_MODULES.map(m => (
                <label key={m.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", borderRadius: "8px", border: `1px solid ${selected.has(m.id) ? "var(--color-text-primary)" : "var(--color-border-tertiary)"}`, background: selected.has(m.id) ? "var(--color-background-secondary)" : "var(--color-background-primary)", cursor: "pointer", userSelect: "none" }}>
                  <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} style={{ cursor: "pointer", accentColor: "var(--color-text-primary)" }} />
                  <span style={{ fontSize: "13px" }}>{m.icon}</span>
                  <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-primary)" }}>{m.label}</span>
                </label>
              ))}
            </div>

            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <button
                onClick={generate}
                disabled={loading || selected.size === 0}
                style={{ fontSize: "14px", fontWeight: 500, padding: "10px 24px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: loading || selected.size === 0 ? "not-allowed" : "pointer", opacity: loading || selected.size === 0 ? 0.6 : 1 }}
              >
                {loading ? "Generating..." : "Generate Report"}
              </button>
              {generated && (
                <button
                  onClick={printReport}
                  style={{ fontSize: "14px", fontWeight: 500, padding: "10px 24px", borderRadius: "8px", border: "1px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-primary)" }}
                >
                  🖨 Print / Save PDF
                </button>
              )}
            </div>
          </div>

          {/* Report output */}
          {generated && data && (
            <div ref={reportRef} style={{ marginTop: "40px" }}>

              {/* Report header */}
              <div className="report-header">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: "22px", fontWeight: 700, color: "var(--color-text-primary)" }}>{data.client.name}</div>
                    <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginTop: "4px" }}>
                      {data.client.type && <span style={{ marginRight: "16px" }}>{data.client.type}</span>}
                      {data.client.phone && <span style={{ marginRight: "16px" }}>📞 {data.client.phone}</span>}
                      {data.client.email && <span>✉️ {data.client.email}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", fontSize: "11px", color: "var(--color-text-muted)" }}>
                    <div style={{ fontWeight: 600, fontSize: "13px", marginBottom: "2px" }}>Client Runbook</div>
                    <div>Generated {generatedAt}</div>
                    <div style={{ marginTop: "4px", fontSize: "11px" }}>CONFIDENTIAL — Internal Use Only</div>
                  </div>
                </div>
                {data.client.notes && (
                  <div style={{ marginTop: "12px", fontSize: "13px", color: "var(--color-text-secondary)", background: "var(--color-background-secondary)", padding: "10px 14px", borderRadius: "6px", borderLeft: "3px solid var(--color-border-secondary)" }}>
                    {data.client.notes}
                  </div>
                )}
              </div>

              {/* Locations */}
              {data.locations?.length > 0 && (
                <div className="report-section">
                  <div className="section-title">Locations</div>
                  <table className="report-table">
                    <thead><tr><th>Name</th><th>Address</th><th>Phone</th></tr></thead>
                    <tbody>
                      {data.locations.map((l: any) => (
                        <tr key={l.id}>
                          <td style={{ fontWeight: 500 }}>{l.name}</td>
                          <td>{[l.address, l.city, l.state, l.zip].filter(Boolean).join(", ") || "—"}</td>
                          <td>{l.phone || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Contacts */}
              {data.contacts?.length > 0 && (
                <div className="report-section">
                  <div className="section-title">Contacts</div>
                  <table className="report-table">
                    <thead><tr><th>Name</th><th>Title</th><th>Email</th><th>Phone</th></tr></thead>
                    <tbody>
                      {data.contacts.map((c: any) => (
                        <tr key={c.id}>
                          <td style={{ fontWeight: 500 }}>{c.name}</td>
                          <td>{c.title || "—"}</td>
                          <td>{c.email || "—"}</td>
                          <td>{c.phone || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Users */}
              {data.users?.length > 0 && (
                <div className="report-section">
                  <div className="section-title">Users</div>
                  <table className="report-table">
                    <thead><tr><th>Name</th><th>Email</th><th>Title</th><th>Department</th></tr></thead>
                    <tbody>
                      {data.users.map((u: any) => (
                        <tr key={u.id}>
                          <td style={{ fontWeight: 500 }}>{u.name}</td>
                          <td>{u.email || "—"}</td>
                          <td>{u.title || "—"}</td>
                          <td>{u.department || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Assets */}
              {data.assets?.length > 0 && (
                <div className="report-section">
                  <div className="section-title">Assets</div>
                  <table className="report-table">
                    <thead><tr><th>Name</th><th>Type</th><th>Make / Model</th><th>Serial</th><th>IP</th><th>Assigned To</th><th>Warranty</th></tr></thead>
                    <tbody>
                      {data.assets.map((a: any) => (
                        <tr key={a.id}>
                          <td style={{ fontWeight: 500 }}>{a.name}</td>
                          <td>{a.assetType?.name || a.category || "—"}</td>
                          <td>{[a.make, a.model].filter(Boolean).join(" ") || "—"}</td>
                          <td style={{ fontFamily: "monospace", fontSize: "11px" }}>{a.serialNumber || "—"}</td>
                          <td style={{ fontFamily: "monospace", fontSize: "11px" }}>{a.ipAddress || "—"}</td>
                          <td>{a.primaryUser?.name || "—"}</td>
                          <td>{fmt(a.warrantyExpiry)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Credentials */}
              {data.credentials?.length > 0 && (
                <div className="report-section">
                  <div className="section-title">Credentials</div>
                  <table className="report-table">
                    <thead><tr><th>Label</th><th>Username</th><th>Password</th><th>URL</th><th>Notes</th></tr></thead>
                    <tbody>
                      {data.credentials.map((c: any) => (
                        <tr key={c.id}>
                          <td style={{ fontWeight: 500 }}>{c.label}</td>
                          <td style={{ fontFamily: "monospace", fontSize: "12px" }}>{c.username || "—"}</td>
                          <td><span className="credential-password">{c.password || "—"}</span></td>
                          <td style={{ fontSize: "11px" }}>{c.url || "—"}</td>
                          <td>{c.notes || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Licenses */}
              {data.licenses?.length > 0 && (
                <div className="report-section">
                  <div className="section-title">Licenses</div>
                  <table className="report-table">
                    <thead><tr><th>Name</th><th>Vendor</th><th>Key</th><th>Seats</th><th>Renewal</th><th>Cost</th></tr></thead>
                    <tbody>
                      {data.licenses.map((l: any) => (
                        <tr key={l.id}>
                          <td style={{ fontWeight: 500 }}>{l.name}</td>
                          <td>{l.vendorRef?.name || l.vendor || "—"}</td>
                          <td style={{ fontFamily: "monospace", fontSize: "11px" }}>{l.licenseKey || "—"}</td>
                          <td>{l.seats ?? "—"}</td>
                          <td>{fmt(l.renewalDate)}</td>
                          <td>{l.cost ? `$${l.cost}` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Vendors */}
              {data.vendors?.length > 0 && (
                <div className="report-section">
                  <div className="section-title">Vendors</div>
                  {data.vendors.map((v: any) => (
                    <div key={v.id} style={{ marginBottom: "16px" }}>
                      <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "4px" }}>{v.name}</div>
                      <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginBottom: v.contacts?.length ? "6px" : 0 }}>
                        {v.phone && <span style={{ marginRight: "14px" }}>📞 {v.phone}</span>}
                        {v.email && <span style={{ marginRight: "14px" }}>✉️ {v.email}</span>}
                        {v.website && <span>{v.website}</span>}
                        {v.accountNumber && <span style={{ marginLeft: "14px" }}>Acct: {v.accountNumber}</span>}
                      </div>
                      {v.contacts?.length > 0 && (
                        <table className="report-table" style={{ marginLeft: "12px" }}>
                          <thead><tr><th>Contact</th><th>Title</th><th>Email</th><th>Phone</th></tr></thead>
                          <tbody>
                            {v.contacts.map((c: any) => (
                              <tr key={c.id}>
                                <td>{c.name}</td>
                                <td>{c.title || "—"}</td>
                                <td>{c.email || "—"}</td>
                                <td>{c.phone || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Network Devices */}
              {data.network?.length > 0 && (
                <div className="report-section">
                  <div className="section-title">Network Devices</div>
                  <table className="report-table">
                    <thead><tr><th>Name</th><th>Type</th><th>Make / Model</th><th>IP</th><th>MAC</th><th>Location</th></tr></thead>
                    <tbody>
                      {data.network.map((d: any) => (
                        <tr key={d.id}>
                          <td style={{ fontWeight: 500 }}>{d.name}</td>
                          <td>{d.type}</td>
                          <td>{[d.make, d.model].filter(Boolean).join(" ") || "—"}</td>
                          <td style={{ fontFamily: "monospace", fontSize: "11px" }}>{d.ipAddress || "—"}</td>
                          <td style={{ fontFamily: "monospace", fontSize: "11px" }}>{d.macAddress || "—"}</td>
                          <td>{d.location?.name || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Subnets / IPAM */}
              {data.subnets?.length > 0 && (
                <div className="report-section">
                  <div className="section-title">Subnets / IPAM</div>
                  {data.subnets.map((s: any) => (
                    <div key={s.id} style={{ marginBottom: "16px" }}>
                      <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "4px" }}>
                        {s.cidr}
                        {s.description && <span style={{ fontWeight: 400, color: "var(--color-text-secondary)", marginLeft: "10px" }}>{s.description}</span>}
                        {s.vlan && <span style={{ fontWeight: 400, color: "var(--color-text-muted)", marginLeft: "10px" }}>VLAN {s.vlan}</span>}
                      </div>
                      {s.ipAssignments?.length > 0 && (
                        <table className="report-table" style={{ marginLeft: "12px" }}>
                          <thead><tr><th>IP</th><th>Hostname</th><th>Notes</th></tr></thead>
                          <tbody>
                            {s.ipAssignments.map((ip: any) => (
                              <tr key={ip.id}>
                                <td style={{ fontFamily: "monospace", fontSize: "11px" }}>{ip.ipAddress}</td>
                                <td>{ip.hostname || "—"}</td>
                                <td>{ip.notes || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Websites */}
              {data.websites?.length > 0 && (
                <div className="report-section">
                  <div className="section-title">Websites</div>
                  <table className="report-table">
                    <thead><tr><th>URL</th><th>Registrar</th><th>Expiry</th><th>Host</th><th>Notes</th></tr></thead>
                    <tbody>
                      {data.websites.map((w: any) => (
                        <tr key={w.id}>
                          <td style={{ fontSize: "12px" }}>{w.url}</td>
                          <td>{w.registrar || "—"}</td>
                          <td>{fmt(w.expiryDate)}</td>
                          <td>{w.host || "—"}</td>
                          <td>{w.notes || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* SOPs */}
              {(data.sops?.length > 0 || data.globalSops?.length > 0) && (
                <div className="report-section">
                  <div className="section-title">SOPs</div>
                  {[...(data.sops ?? []).map((s: any) => ({ ...s, _scope: "Client" })), ...(data.globalSops ?? []).map((s: any) => ({ ...s, _scope: "Global" }))].map((sop: any) => (
                    <div key={sop.id} style={{ marginBottom: "20px", paddingBottom: "20px", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
                        <span style={{ fontSize: "14px", fontWeight: 600 }}>{sop.title}</span>
                        <span style={{ fontSize: "11px", padding: "1px 6px", borderRadius: "8px", background: "var(--color-background-hover)", color: "var(--color-text-muted)" }}>{sop._scope}</span>
                        {sop.category && (
                          <span style={{ fontSize: "11px", padding: "1px 6px", borderRadius: "8px", background: sop.category.color + "22", color: sop.category.color }}>{sop.category.name}</span>
                        )}
                      </div>
                      {sop.summary && <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginBottom: "8px" }}>{sop.summary}</div>}
                      {sop.steps?.length > 0 && (
                        <ol style={{ margin: "0 0 8px 16px", padding: 0, fontSize: "13px", color: "var(--color-text-primary)" }}>
                          {sop.steps.map((st: any, i: number) => (
                            <li key={st.id} style={{ marginBottom: "4px" }}>
                              <span style={{ fontWeight: 500 }}>{st.title}</span>
                              {st.notes && <span style={{ color: "var(--color-text-muted)", marginLeft: "6px", fontSize: "12px" }}>— {st.notes}</span>}
                            </li>
                          ))}
                        </ol>
                      )}
                      {sop.content && (
                        <div className="markdown-body" style={{ fontSize: "12px", lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: marked(sop.content) as string }} />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Footer */}
              <div style={{ marginTop: "40px", paddingTop: "16px", borderTop: "1px solid var(--color-border-tertiary)", fontSize: "11px", color: "var(--color-text-muted)", display: "flex", justifyContent: "space-between" }}>
                <span>PCC2K — {data.client.name} — Client Runbook</span>
                <span>Generated {generatedAt} — CONFIDENTIAL</span>
              </div>
            </div>
          )}
        </div>
      </AppShell>
    </>
  )
}
