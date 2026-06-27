"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import AppShell from "@/components/AppShell"
import AttachmentsPanel from "@/components/AttachmentsPanel"
import CastButton from "@/components/CastButton"
import { thSiteUrl } from "@/lib/cross-app-urls"

type ThSite = {
  id: string
  name: string
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  isPrimary: boolean
  isBilling: boolean
  thClientId: string
}

type LocationDetail = {
  id: string
  name: string
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  ispName: string | null
  wanIp: string | null
  tailscaleIp: string | null
  notes: string | null
  isActive: boolean
  thSiteId: string | null
  client: { id: string; name: string }
  assets: { id: string; name: string; friendlyName: string | null; category: string; ipAddress: string | null; status: string }[]
  networkDevices: { id: string; name: string; type: string; ipAddress: string | null }[]
  racks: { id: string; name: string }[]
  subnets: { id: string; cidr: string; vlan: string | null; description: string | null }[]
  internetCircuits: { id: string; label: string; role: string; status: string; staticBlockCidr: string | null; wanIp: string | null; ispNameFallback: string | null; vendor: { id: string; name: string } | null }[]
  attachments: { id: string }[]
  thSite: ThSite | null
}

const card: React.CSSProperties = {
  background: "var(--color-background-secondary)",
  border: "0.5px solid var(--color-border-tertiary)",
  borderRadius: "10px",
  padding: "16px",
  marginBottom: "12px",
}
const cardTitle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 600,
  color: "var(--color-text-secondary)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: "10px",
  display: "flex",
  alignItems: "center",
  gap: 6,
}
const countChip: React.CSSProperties = {
  fontSize: 11, padding: "2px 6px", borderRadius: 4,
  background: "var(--color-accent-muted)", color: "var(--color-accent)",
}
const itemRow: React.CSSProperties = {
  padding: "8px 0",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
}
const linkStyle: React.CSSProperties = {
  fontSize: 13, color: "var(--color-text-primary)", textDecoration: "none", fontWeight: 500,
}

function normalize(s: string | null): string {
  return (s ?? "").trim().toLowerCase().replace(/[^\w\d ]/g, " ").replace(/\s+/g, " ").trim()
}

function addressDiffers(loc: LocationDetail, th: ThSite | null): boolean {
  if (!th) return false
  if (normalize(loc.address) !== normalize(th.address)) return true
  if (normalize(loc.city) !== normalize(th.city)) return true
  if ((loc.state ?? "").toUpperCase() !== (th.state ?? "").toUpperCase()) return true
  if ((loc.zip ?? "") !== (th.zip ?? "")) return true
  return false
}

type CircuitLite = LocationDetail["internetCircuits"][number]

// The authoritative circuit for ISP/WAN: prefer the active primary, then any
// primary, then any active, then whatever exists.
function pickPrimaryCircuit(cs: CircuitLite[]): CircuitLite | null {
  if (!cs || cs.length === 0) return null
  return cs.find(c => c.role === "PRIMARY" && c.status === "ACTIVE")
      ?? cs.find(c => c.role === "PRIMARY")
      ?? cs.find(c => c.status === "ACTIVE")
      ?? cs[0]
}

type Match = "match" | "differ" | "only-circuit" | "only-location" | "none"

// Compare a legacy Location column against the value derived from the circuit.
function matchState(locVal: string | null, circuitVal: string | null): Match {
  const a = normalize(locVal), b = normalize(circuitVal)
  if (a && b) return a === b ? "match" : "differ"
  if (b) return "only-circuit"
  if (a) return "only-location"
  return "none"
}

function MatchChip({ state }: { state: Match }) {
  if (state === "match") return (
    <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: "var(--color-background-success, #16a34a22)", color: "var(--color-text-success, #16a34a)" }}>matches circuit ✓</span>
  )
  if (state === "differ") return (
    <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: "var(--color-background-warning, #f59e0b22)", color: "var(--color-text-warning, #b45309)" }}>differs from circuit ⚠</span>
  )
  return null
}

export default function LocationDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id
  const router = useRouter()
  const [loc, setLoc] = useState<LocationDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    fetch(`/api/locations/${id}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(d => setLoc(d))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <AppShell><div style={{ padding: 32 }}>Loading…</div></AppShell>
  if (error || !loc) return <AppShell><div style={{ padding: 32, color: "#ef4444" }}>{error ?? "Not found"}</div></AppShell>

  const drift = addressDiffers(loc, loc.thSite)
  const primaryCircuit = pickPrimaryCircuit(loc.internetCircuits)
  const circuitIsp = primaryCircuit ? (primaryCircuit.vendor?.name ?? primaryCircuit.ispNameFallback ?? null) : null
  const circuitWan = primaryCircuit ? (primaryCircuit.wanIp ?? primaryCircuit.staticBlockCidr ?? null) : null
  const ispMatch = matchState(loc.ispName, circuitIsp)
  const wanMatch = matchState(loc.wanIp, circuitWan)
  const hasDrift = ispMatch === "differ" || wanMatch === "differ"

  return (
    <AppShell>
      <div style={{ padding: 32, maxWidth: 1100 }}>
        {/* Breadcrumb */}
        <div style={{ marginBottom: 8, fontSize: 12, color: "var(--color-text-muted)" }}>
          <a href="/clients" style={{ color: "inherit", textDecoration: "none" }}>Clients</a>
          {" / "}
          <a href={`/clients/${loc.client.id}`} style={{ color: "var(--color-accent)", textDecoration: "none" }}>
            {loc.client.name}
          </a>
          {" / "}
          <span>Locations</span>
        </div>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>{loc.name}</h1>
            <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 4 }}>
              {[loc.address, loc.city, loc.state, loc.zip].filter(Boolean).join(", ") || <em>No address</em>}
            </div>
            {!loc.isActive && (
              <span style={{ display: "inline-block", marginTop: 6, fontSize: 11, padding: "2px 6px", borderRadius: 4, background: "var(--color-background-hover)", color: "var(--color-text-muted)" }}>
                Inactive
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => router.push(`/clients/${loc.client.id}?tab=Locations&edit=${loc.id}`)}
              style={{ fontSize: 12, padding: "6px 12px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "transparent", color: "var(--color-text-secondary)", cursor: "pointer" }}
            >
              Edit
            </button>
          </div>
        </div>

        {/* Cross-app TH_Site card */}
        <div style={{ ...card, background: "var(--color-background-primary)", border: "1px solid var(--color-accent-muted)" }}>
          <div style={cardTitle}>
            TicketHub Site
            {loc.thSite && drift && (
              <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: "var(--color-background-warning, #f59e0b22)", color: "var(--color-text-warning, #b45309)" }}>
                Address differs ⚠
              </span>
            )}
          </div>
          {loc.thSite ? (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{loc.thSite.name}</div>
                  <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 2 }}>
                    {[loc.thSite.address, loc.thSite.city, loc.thSite.state, loc.thSite.zip].filter(Boolean).join(", ") || <em>No address</em>}
                  </div>
                  <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {loc.thSite.isPrimary && <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: "var(--color-accent-muted)", color: "var(--color-accent)" }}>Primary</span>}
                    {loc.thSite.isBilling && <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: "var(--color-background-success, #16a34a22)", color: "var(--color-text-success, #16a34a)" }}>Billing</span>}
                  </div>
                </div>
                <a
                  href={thSiteUrl(loc.thSite.id, loc.thSite.thClientId)}
                  target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 12, padding: "6px 12px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-secondary)", color: "var(--color-accent)", textDecoration: "none", flexShrink: 0 }}
                >
                  Open in TicketHub ↗
                </a>
              </div>
              {drift && (
                <div style={{ marginTop: 10, padding: 10, background: "var(--color-background-warning, #f59e0b22)", borderRadius: 6, fontSize: 12, color: "var(--color-text-warning, #b45309)" }}>
                  The address on this DocHub Location and the matching TicketHub Site don&apos;t match. TicketHub is authoritative for billing tax — update there first, then refresh.
                </div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
              No matching TicketHub site found.
              <a
                href={`https://tickethub.pcc2k.com/clients`}
                target="_blank" rel="noopener noreferrer"
                style={{ marginLeft: 8, color: "var(--color-accent)", textDecoration: "none" }}
              >
                Create in TicketHub ↗
              </a>
            </div>
          )}
        </div>

        {/* Identifying details — ISP/WAN derive from the linked InternetCircuit, not from the legacy Location columns. */}
        <div style={card}>
          <div style={cardTitle}>
            Network details
            {primaryCircuit && (
              <span style={{ fontSize: 11, fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "var(--color-text-muted)" }}>
                from circuit{" "}
                <a href={`/clients/${loc.client.id}?tab=Network&sub=circuits`} style={{ color: "var(--color-accent)", textDecoration: "none" }}>{primaryCircuit.label}</a>
              </span>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: "8px 16px", fontSize: 13 }}>
            <div style={{ color: "var(--color-text-muted)" }}>ISP</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {circuitIsp ?? loc.ispName ?? <em style={{ color: "var(--color-text-muted)" }}>not set</em>}
              {circuitIsp && loc.ispName && <MatchChip state={ispMatch} />}
            </div>
            <div style={{ color: "var(--color-text-muted)" }}>WAN IP</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {circuitWan ?? loc.wanIp
                ? <span style={{ fontFamily: "monospace" }}>{circuitWan ?? loc.wanIp}</span>
                : <em style={{ color: "var(--color-text-muted)" }}>not set</em>}
              {circuitWan && loc.wanIp && <MatchChip state={wanMatch} />}
            </div>
            <div style={{ color: "var(--color-text-muted)" }}>Tailscale IP</div>
            <div style={{ fontFamily: "monospace" }}>{loc.tailscaleIp ?? <em style={{ fontFamily: "inherit", color: "var(--color-text-muted)" }}>not set</em>}</div>
            {loc.notes && (
              <>
                <div style={{ color: "var(--color-text-muted)" }}>Notes</div>
                <div style={{ whiteSpace: "pre-wrap" }}>{loc.notes}</div>
              </>
            )}
          </div>
          {hasDrift && (
            <div style={{ marginTop: 10, padding: 10, background: "var(--color-background-warning, #f59e0b22)", borderRadius: 6, fontSize: 12, color: "var(--color-text-warning, #b45309)" }}>
              Legacy ISP/WAN values on this Location differ from the linked circuit. The circuit is authoritative — manage ISP &amp; WAN under{" "}
              <a href={`/clients/${loc.client.id}?tab=Network&sub=circuits`} style={{ color: "inherit", textDecoration: "underline" }}>Network → Circuits</a>.
            </div>
          )}
          {!primaryCircuit && (loc.ispName || loc.wanIp) && (
            <div style={{ marginTop: 10, padding: 10, background: "var(--color-background-hover)", borderRadius: 6, fontSize: 12, color: "var(--color-text-muted)" }}>
              These ISP/WAN values are legacy Location fields with no linked circuit yet. Promote them under{" "}
              <a href={`/clients/${loc.client.id}?tab=Network&sub=circuits`} style={{ color: "var(--color-accent)", textDecoration: "none" }}>Network → Circuits</a> so they live in one place.
            </div>
          )}
        </div>

        {/* Relation cards (read-only counts that link out) */}
        <RelationCard
          title="Assets"
          clientId={loc.client.id}
          count={loc.assets.length}
          rows={loc.assets.map(a => ({
            id: a.id,
            label: a.friendlyName ?? a.name,
            sublabel: [a.category, a.ipAddress].filter(Boolean).join(" · ") || undefined,
            href: `/assets/${a.id}`,
          }))}
        />

        <RelationCard
          title="Network Devices"
          clientId={loc.client.id}
          count={loc.networkDevices.length}
          rows={loc.networkDevices.map(d => ({
            id: d.id,
            label: d.name,
            sublabel: [d.type, d.ipAddress].filter(Boolean).join(" · ") || undefined,
            href: `/clients/${loc.client.id}?tab=Network`,
          }))}
        />

        <RelationCard
          title="Internet Circuits"
          clientId={loc.client.id}
          count={loc.internetCircuits.length}
          rows={loc.internetCircuits.map(c => ({
            id: c.id,
            label: c.label,
            sublabel: [c.vendor?.name, c.role, c.status, c.staticBlockCidr].filter(Boolean).join(" · "),
            href: `/clients/${loc.client.id}?tab=Network&sub=circuits`,
          }))}
        />

        <RelationCard
          title="Subnets (IPAM)"
          clientId={loc.client.id}
          count={loc.subnets.length}
          rows={loc.subnets.map(s => ({
            id: s.id,
            label: s.cidr,
            sublabel: [s.vlan ? `VLAN ${s.vlan}` : null, s.description].filter(Boolean).join(" · ") || undefined,
            href: `/clients/${loc.client.id}?tab=Network&sub=ipam`,
          }))}
        />

        <RelationCard
          title="Racks"
          clientId={loc.client.id}
          count={loc.racks.length}
          rows={loc.racks.map(r => ({
            id: r.id,
            label: r.name,
            href: `/clients/${loc.client.id}?tab=Network&sub=racks`,
          }))}
        />

        <AttachmentsPanel entityType="location" entityId={loc.id} />
      </div>
    </AppShell>
  )
}

function RelationCard({ title, count, rows, clientId }: { title: string; count: number; rows: { id: string; label: string; sublabel?: string; href: string }[]; clientId?: string }) {
  return (
    <div style={card}>
      <div style={cardTitle}>
        {title}
        <span style={countChip}>{count}</span>
      </div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>None.</div>
      ) : (
        rows.map((r, i) => (
          <div key={r.id} style={{ ...itemRow, borderBottom: i < rows.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none" }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <a href={r.href} style={linkStyle}>{r.label}</a>
              {r.sublabel && <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 1 }}>{r.sublabel}</div>}
            </div>
            <CastButton url={r.href} label={r.label} clientId={clientId} size={22} />
          </div>
        ))
      )}
    </div>
  )
}
