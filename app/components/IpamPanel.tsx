"use client"

import { useState } from "react"
import VlanPicker from "@/components/VlanPicker"
import { ipToInt, isIpv4 } from "@/lib/cidr"

type IpAssignment = {
  id: string
  ipAddress: string
  hostname: string | null
  notes: string | null
  asset: { id: string; name: string; category: string } | null
  person: { id: string; name: string } | null
}

type Subnet = {
  id: string
  cidr: string
  gateway: string | null
  dns1: string | null
  dns2: string | null
  vlan: string | null
  vlanRefId: string | null
  description: string | null
  notes: string | null
  location: { id: string; name: string } | null
  ipAssignments: IpAssignment[]
}

type Props = {
  subnets: Subnet[]
  locations: { id: string; name: string }[]
  assets: { id: string; name: string; category: string; ipAddress?: string | null }[]
  people: { id: string; name: string }[]
  clientId: string
  onSubnetsChange: (subnets: Subnet[]) => void
}

const input = { width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }
const label = { fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }

export default function IpamPanel({ subnets, locations, assets, people, clientId, onSubnetsChange }: Props) {
  const [expandedSubnets, setExpandedSubnets] = useState<Record<string, boolean>>({})
  const [showAddSubnet, setShowAddSubnet] = useState(false)
  const [subnetForm, setSubnetForm] = useState({ cidr: "", locationId: "", gateway: "", dns1: "", dns2: "", vlan: "", vlanRefId: "", description: "", notes: "" })
  const [savingSubnet, setSavingSubnet] = useState(false)
  const [editingSubnet, setEditingSubnet] = useState<string | null>(null)
  const [subnetEditForm, setSubnetEditForm] = useState<any>({})

  const [addingIpTo, setAddingIpTo] = useState<string | null>(null)
  const [ipForm, setIpForm] = useState({ ipAddress: "", hostname: "", assetId: "", personId: "", notes: "" })
  const [savingIp, setSavingIp] = useState(false)
  const [editingIp, setEditingIp] = useState<string | null>(null)
  const [ipEditForm, setIpEditForm] = useState<any>({})

  function toggleSubnet(id: string) {
    setExpandedSubnets(s => ({ ...s, [id]: !s[id] }))
  }

  // Numeric octet ordering so e.g. .2 sorts before .19 (not lexicographic).
  function cmpIp(a: IpAssignment, b: IpAssignment) {
    if (!isIpv4(a.ipAddress) || !isIpv4(b.ipAddress)) return a.ipAddress.localeCompare(b.ipAddress)
    return ipToInt(a.ipAddress) - ipToInt(b.ipAddress)
  }

  // Cross-subnet duplicate detection: the same IP documented under two different
  // subnets of this client is almost always a data-entry error. Count the distinct
  // subnets each address appears in; size > 1 means it's duplicated across subnets.
  const subnetsByIp = new Map<string, Set<string>>()
  for (const s of subnets) {
    for (const a of s.ipAssignments) {
      const set = subnetsByIp.get(a.ipAddress) ?? new Set<string>()
      set.add(s.id)
      subnetsByIp.set(a.ipAddress, set)
    }
  }
  const crossSubnetDupIps = new Set<string>(
    [...subnetsByIp.entries()].filter(([, set]) => set.size > 1).map(([ip]) => ip)
  )

  async function saveSubnet() {
    if (!subnetForm.cidr.trim()) return
    setSavingSubnet(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/subnets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subnetForm),
      })
      if (res.ok) {
        const created = await res.json()
        onSubnetsChange([...subnets, created])
        setSubnetForm({ cidr: "", locationId: "", gateway: "", dns1: "", dns2: "", vlan: "", vlanRefId: "", description: "", notes: "" })
        setShowAddSubnet(false)
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || "Failed to add subnet")
      }
    } finally { setSavingSubnet(false) }
  }

  async function updateSubnet(subnetId: string) {
    setSavingSubnet(true)
    try {
      const res = await fetch(`/api/subnets/${subnetId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subnetEditForm),
      })
      if (res.ok) {
        const updated = await res.json()
        onSubnetsChange(subnets.map(s => s.id === subnetId ? { ...s, ...updated } : s))
        setEditingSubnet(null)
      }
    } finally { setSavingSubnet(false) }
  }

  async function deleteSubnet(subnetId: string) {
    if (!confirm("Delete this subnet and all its IP assignments?")) return
    await fetch(`/api/subnets/${subnetId}`, { method: "DELETE" })
    onSubnetsChange(subnets.filter(s => s.id !== subnetId))
  }

  async function saveIp(subnetId: string) {
    if (!ipForm.ipAddress.trim()) return
    setSavingIp(true)
    try {
      const res = await fetch(`/api/subnets/${subnetId}/ips`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ipForm),
      })
      if (res.ok) {
        const created = await res.json()
        onSubnetsChange(subnets.map(s => s.id === subnetId ? { ...s, ipAssignments: [...s.ipAssignments, created] } : s))
        setIpForm({ ipAddress: "", hostname: "", assetId: "", personId: "", notes: "" })
        setAddingIpTo(null)
      } else {
        const err = await res.json()
        alert(err.error || "Failed to add IP")
      }
    } finally { setSavingIp(false) }
  }

  async function updateIp(subnetId: string, ipId: string) {
    setSavingIp(true)
    try {
      const res = await fetch(`/api/ips/${ipId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ipEditForm),
      })
      if (res.ok) {
        const updated = await res.json()
        onSubnetsChange(subnets.map(s => s.id === subnetId
          ? { ...s, ipAssignments: s.ipAssignments.map(ip => ip.id === ipId ? updated : ip) }
          : s
        ))
        setEditingIp(null)
      }
    } finally { setSavingIp(false) }
  }

  async function deleteIp(subnetId: string, ipId: string) {
    await fetch(`/api/ips/${ipId}`, { method: "DELETE" })
    onSubnetsChange(subnets.map(s => s.id === subnetId
      ? { ...s, ipAssignments: s.ipAssignments.filter(ip => ip.id !== ipId) }
      : s
    ))
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px" }}>
        <button onClick={() => setShowAddSubnet(true)} style={{ fontSize: "14px", fontWeight: 500, padding: "8px 16px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: "pointer" }}>
          Add subnet
        </button>
      </div>

      {showAddSubnet && (
        <div style={{ background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: "10px", padding: "20px", marginBottom: "16px" }}>
          <div style={{ fontSize: "15px", fontWeight: 500, marginBottom: "16px" }}>New subnet</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
            <div>
              <label style={label}>CIDR *</label>
              <input autoFocus value={subnetForm.cidr} onChange={e => setSubnetForm(f => ({ ...f, cidr: e.target.value }))} placeholder="e.g. 192.168.1.0/24" style={input} />
            </div>
            <div>
              <label style={label}>Location</label>
              <select value={subnetForm.locationId} onChange={e => setSubnetForm(f => ({ ...f, locationId: e.target.value }))} style={input}>
                <option value="">No location</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label style={label}>Gateway</label>
              <input value={subnetForm.gateway} onChange={e => setSubnetForm(f => ({ ...f, gateway: e.target.value }))} placeholder="e.g. 192.168.1.1" style={input} />
            </div>
            <div>
              <VlanPicker clientId={clientId} value={subnetForm.vlanRefId}
                onChange={(refId, v) => setSubnetForm(f => ({ ...f, vlanRefId: refId, vlan: v ? String(v.vlanNumber) : "" }))} />
            </div>
            <div>
              <label style={label}>DNS 1</label>
              <input value={subnetForm.dns1} onChange={e => setSubnetForm(f => ({ ...f, dns1: e.target.value }))} placeholder="e.g. 8.8.8.8" style={input} />
            </div>
            <div>
              <label style={label}>DNS 2</label>
              <input value={subnetForm.dns2} onChange={e => setSubnetForm(f => ({ ...f, dns2: e.target.value }))} placeholder="e.g. 8.8.4.4" style={input} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={label}>Description</label>
              <input value={subnetForm.description} onChange={e => setSubnetForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. LAN, Guest WiFi, Management" style={input} />
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={saveSubnet} disabled={savingSubnet} style={{ fontSize: "14px", fontWeight: 500, padding: "8px 16px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>
              {savingSubnet ? "Saving..." : "Save"}
            </button>
            <button onClick={() => setShowAddSubnet(false)} style={{ fontSize: "14px", padding: "8px 16px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>Cancel</button>
          </div>
        </div>
      )}

      {subnets.length === 0 && !showAddSubnet ? (
        <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>No subnets yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {subnets.map(subnet => (
            <div key={subnet.id} style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "10px", overflow: "hidden" }}>
              {/* Subnet header */}
              {editingSubnet === subnet.id ? (
                <div style={{ padding: "16px", background: "var(--color-background-secondary)" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                    <div>
                      <label style={label}>CIDR</label>
                      <input value={subnetEditForm.cidr ?? ""} onChange={e => setSubnetEditForm((f: any) => ({ ...f, cidr: e.target.value }))} style={input} />
                    </div>
                    <div>
                      <label style={label}>Location</label>
                      <select value={subnetEditForm.locationId ?? ""} onChange={e => setSubnetEditForm((f: any) => ({ ...f, locationId: e.target.value }))} style={input}>
                        <option value="">No location</option>
                        {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={label}>Gateway</label>
                      <input value={subnetEditForm.gateway ?? ""} onChange={e => setSubnetEditForm((f: any) => ({ ...f, gateway: e.target.value }))} style={input} />
                    </div>
                    <div>
                      <VlanPicker clientId={clientId} value={subnetEditForm.vlanRefId ?? ""}
                        onChange={(refId, v) => setSubnetEditForm((f: any) => ({ ...f, vlanRefId: refId, vlan: v ? String(v.vlanNumber) : f.vlan }))} />
                    </div>
                    <div>
                      <label style={label}>DNS 1</label>
                      <input value={subnetEditForm.dns1 ?? ""} onChange={e => setSubnetEditForm((f: any) => ({ ...f, dns1: e.target.value }))} style={input} />
                    </div>
                    <div>
                      <label style={label}>DNS 2</label>
                      <input value={subnetEditForm.dns2 ?? ""} onChange={e => setSubnetEditForm((f: any) => ({ ...f, dns2: e.target.value }))} style={input} />
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label style={label}>Description</label>
                      <input value={subnetEditForm.description ?? ""} onChange={e => setSubnetEditForm((f: any) => ({ ...f, description: e.target.value }))} style={input} />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button onClick={() => updateSubnet(subnet.id)} disabled={savingSubnet} style={{ fontSize: "13px", fontWeight: 500, padding: "6px 14px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>Save</button>
                    <button onClick={() => setEditingSubnet(null)} style={{ fontSize: "13px", padding: "6px 14px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "var(--color-background-secondary)", cursor: "pointer" }}
                  onClick={() => toggleSubnet(subnet.id)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                    <span style={{ fontSize: "15px", fontWeight: 600, fontFamily: "monospace", color: "var(--color-text-primary)" }}>{subnet.cidr}</span>
                    {subnet.description && <span style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>{subnet.description}</span>}
                    {subnet.vlan && <span style={{ fontSize: "11px", padding: "2px 6px", borderRadius: "4px", background: "var(--color-background-hover)", color: "var(--color-text-secondary)" }}>VLAN {subnet.vlan}</span>}
                    {subnet.location && <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>{subnet.location.name}</span>}
                    <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>{subnet.ipAssignments.length} IP{subnet.ipAssignments.length !== 1 ? "s" : ""}</span>
                    {subnet.ipAssignments.some(ip => crossSubnetDupIps.has(ip.ipAddress)) && (
                      <span title="Contains an IP also documented in another subnet" style={{ fontSize: "11px", padding: "2px 6px", borderRadius: "4px", background: "var(--color-background-hover)", color: "var(--color-text-danger)" }}>⚠ duplicate IP</span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }} onClick={e => e.stopPropagation()}>
                    <button onClick={() => { setEditingSubnet(subnet.id); setSubnetEditForm({ cidr: subnet.cidr, locationId: subnet.location?.id ?? "", gateway: subnet.gateway ?? "", vlan: subnet.vlan ?? "", vlanRefId: subnet.vlanRefId ?? "", dns1: subnet.dns1 ?? "", dns2: subnet.dns2 ?? "", description: subnet.description ?? "" }) }}
                      style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Edit</button>
                    <button onClick={() => deleteSubnet(subnet.id)}
                      style={{ fontSize: "12px", color: "var(--color-text-danger)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Delete</button>
                    <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>{expandedSubnets[subnet.id] ? "▲" : "▼"}</span>
                  </div>
                </div>
              )}

              {/* Subnet details + IP table */}
              {expandedSubnets[subnet.id] && (
                <div style={{ background: "var(--color-background-primary)" }}>
                  {/* Subnet metadata row */}
                  <div style={{ display: "flex", gap: "24px", padding: "10px 16px", borderBottom: "0.5px solid var(--color-border-tertiary)", flexWrap: "wrap" }}>
                    {subnet.gateway && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>GW: <span style={{ fontFamily: "monospace" }}>{subnet.gateway}</span></span>}
                    {subnet.dns1 && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>DNS1: <span style={{ fontFamily: "monospace" }}>{subnet.dns1}</span></span>}
                    {subnet.dns2 && <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>DNS2: <span style={{ fontFamily: "monospace" }}>{subnet.dns2}</span></span>}
                  </div>

                  {/* IP assignments table */}
                  {subnet.ipAssignments.length > 0 && (
                    <div>
                      <div style={{ display: "grid", gridTemplateColumns: "140px 160px 1fr 80px", padding: "8px 16px", background: "var(--color-background-secondary)", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                        {["IP Address", "Hostname", "Assigned to", ""].map(h => (
                          <div key={h} style={{ fontSize: "11px", fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</div>
                        ))}
                      </div>
                      {[...subnet.ipAssignments].sort(cmpIp).map((ip, i, arr) => editingIp === ip.id ? (
                        <div key={ip.id} style={{ padding: "12px 16px", borderBottom: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-primary)" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
                            <div>
                              <label style={label}>IP Address</label>
                              <input value={ipEditForm.ipAddress ?? ""} onChange={e => setIpEditForm((f: any) => ({ ...f, ipAddress: e.target.value }))} style={input} />
                            </div>
                            <div>
                              <label style={label}>Hostname</label>
                              <input value={ipEditForm.hostname ?? ""} onChange={e => setIpEditForm((f: any) => ({ ...f, hostname: e.target.value }))} style={input} />
                            </div>
                            <div>
                              <label style={label}>Asset</label>
                              <select value={ipEditForm.assetId ?? ""} onChange={e => setIpEditForm((f: any) => ({ ...f, assetId: e.target.value, personId: "" }))} style={input}>
                                <option value="">None</option>
                                {assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                              </select>
                            </div>
                            <div>
                              <label style={label}>User</label>
                              <select value={ipEditForm.personId ?? ""} onChange={e => setIpEditForm((f: any) => ({ ...f, personId: e.target.value, assetId: "" }))} style={input}>
                                <option value="">None</option>
                                {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                              </select>
                            </div>
                            <div style={{ gridColumn: "1 / -1" }}>
                              <label style={label}>Notes</label>
                              <input value={ipEditForm.notes ?? ""} onChange={e => setIpEditForm((f: any) => ({ ...f, notes: e.target.value }))} style={input} />
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: "8px" }}>
                            <button onClick={() => updateIp(subnet.id, ip.id)} disabled={savingIp} style={{ fontSize: "13px", fontWeight: 500, padding: "6px 14px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>Save</button>
                            <button onClick={() => setEditingIp(null)} style={{ fontSize: "13px", padding: "6px 14px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div key={ip.id} style={{ display: "grid", gridTemplateColumns: "140px 160px 1fr 80px", padding: "10px 16px", borderBottom: i < arr.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none", alignItems: "center" }}>
                          <div style={{ fontFamily: "monospace", fontSize: "13px", color: "var(--color-text-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
                            <span>{ip.ipAddress}</span>
                            {crossSubnetDupIps.has(ip.ipAddress) && <span title="This IP is also documented in another subnet for this client" style={{ fontSize: "11px", color: "var(--color-text-danger)" }}>⚠</span>}
                          </div>
                          <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>{ip.hostname ?? "—"}</div>
                          <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>
                            {ip.asset ? ip.asset.name : ip.person ? ip.person.name : "—"}
                          </div>
                          <div style={{ display: "flex", gap: "8px" }}>
                            <button onClick={() => { setEditingIp(ip.id); setIpEditForm({ ipAddress: ip.ipAddress, hostname: ip.hostname ?? "", assetId: ip.asset?.id ?? "", personId: ip.person?.id ?? "", notes: ip.notes ?? "" }) }}
                              style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Edit</button>
                            <button onClick={() => deleteIp(subnet.id, ip.id)}
                              style={{ fontSize: "12px", color: "var(--color-text-danger)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Remove</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add IP form */}
                  {addingIpTo === subnet.id ? (
                    <div style={{ padding: "14px 16px", borderTop: "0.5px solid var(--color-border-tertiary)" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "10px" }}>
                        <div>
                          <label style={label}>IP Address *</label>
                          <input autoFocus value={ipForm.ipAddress} onChange={e => setIpForm(f => ({ ...f, ipAddress: e.target.value }))} placeholder="e.g. 192.168.1.10" style={input} />
                        </div>
                        <div>
                          <label style={label}>Hostname</label>
                          <input value={ipForm.hostname} onChange={e => setIpForm(f => ({ ...f, hostname: e.target.value }))} placeholder="e.g. server-01" style={input} />
                        </div>
                        <div>
                          <label style={label}>Asset</label>
                          <select value={ipForm.assetId} onChange={e => {
                            const a = assets.find(x => x.id === e.target.value)
                            setIpForm(f => ({ ...f, assetId: e.target.value, personId: "", ipAddress: f.ipAddress || a?.ipAddress || "", hostname: f.hostname || a?.name || "" }))
                          }} style={input}>
                            <option value="">None</option>
                            {assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={label}>User</label>
                          <select value={ipForm.personId} onChange={e => setIpForm(f => ({ ...f, personId: e.target.value, assetId: "" }))} style={input}>
                            <option value="">None</option>
                            {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        </div>
                        <div style={{ gridColumn: "1 / -1" }}>
                          <label style={label}>Notes</label>
                          <input value={ipForm.notes} onChange={e => setIpForm(f => ({ ...f, notes: e.target.value }))} style={input} />
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button onClick={() => saveIp(subnet.id)} disabled={savingIp} style={{ fontSize: "13px", fontWeight: 500, padding: "6px 14px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>
                          {savingIp ? "Saving..." : "Add IP"}
                        </button>
                        <button onClick={() => setAddingIpTo(null)} style={{ fontSize: "13px", padding: "6px 14px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: "10px 16px" }}>
                      <button onClick={() => { setAddingIpTo(subnet.id); setIpForm({ ipAddress: "", hostname: "", assetId: "", personId: "", notes: "" }) }}
                        style={{ fontSize: "13px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                        + Add IP assignment
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
