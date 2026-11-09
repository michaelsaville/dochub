"use client"

/**
 * Client Overview — the landing page for a client. Built to answer "what do I
 * need for this call?" in one screen: next documentation gap, live status,
 * the credentials and boxes techs reach for first, who to call, docs/SOPs and
 * what changed recently. Settings (lifecycle automation) moved to the
 * "Client settings" section.
 */

import Link from "next/link"
import { useEffect, useState } from "react"
import SecretCopy from "@/components/client/SecretCopy"

type Cred = {
  id: string; label: string; username: string | null; url: string | null
  hasPassword: boolean; hasTotp: boolean; isFavorite: boolean
}
type KeyAsset = {
  id: string; name: string; friendlyName: string | null; make: string | null; model: string | null
  category: string; ipAddress: string | null; managementUrl: string | null; splashtopUrl: string | null
  rdpEnabled: boolean; assetType: { name: string } | null; location: { name: string } | null
}
type Contact = {
  id: string; name: string; email: string | null; phone: string | null; mobile: string | null
  jobTitle: string | null; isPrimary: boolean; isBilling: boolean; isEscalation: boolean
}
type DashData = {
  topCredentials: Cred[]
  keyAssets: KeyAsset[]
  contacts: Contact[]
  recentDocs: { id: string; title: string; updatedAt: string; needsReview: boolean }[]
  sops: { id: string; title: string; updatedAt: string }[]
  notes: string | null
}
export type Completeness = {
  score: number
  checks: { label: string; met: boolean; weight: number }[]
  gaps?: string[]
  nextAction?: string | null
}

function ago(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (d <= 0) return "today"
  if (d === 1) return "yesterday"
  if (d < 30) return `${d}d ago`
  if (d < 365) return `${Math.floor(d / 30)}mo ago`
  return `${Math.floor(d / 365)}y ago`
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, color: "var(--color-text-muted)", padding: "6px 0" }}>{children}</div>
}

export default function ClientOverview({
  clientId,
  counts,
  completeness,
  statusSlot,
  changesSlot,
}: {
  clientId: string
  counts: Record<string, number>
  completeness: Completeness | null
  statusSlot?: React.ReactNode
  changesSlot?: React.ReactNode
}) {
  const [data, setData] = useState<DashData | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let off = false
    fetch(`/api/clients/${clientId}/dashboard`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (!off) setData(d) })
      .catch(() => { if (!off) setFailed(true) })
    return () => { off = true }
  }, [clientId])

  const tab = (t: string, extra = "") => `/clients/${clientId}?tab=${encodeURIComponent(t)}${extra}`
  const next =
    completeness?.nextAction ??
    completeness?.checks.filter((c) => !c.met).sort((a, b) => b.weight - a.weight)[0]?.label ??
    null

  return (
    <div style={{ maxWidth: 1240 }}>
      {next && completeness && completeness.score < 100 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          padding: "10px 14px", marginBottom: 14, borderRadius: 8,
          background: "rgba(61,111,255,0.07)", border: "0.5px solid rgba(61,111,255,0.25)", fontSize: 13,
        }}>
          <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--accent)" }}>NEXT GAP</span>
          <span style={{ flex: 1, minWidth: 180 }}>{next}</span>
          <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{completeness.score}% documented</span>
        </div>
      )}

      {statusSlot}

      {failed && <Empty>Couldn&apos;t load the overview. Refresh to try again.</Empty>}

      <div className="dh-overview-grid">
        {/* ── Left: what you reach for ─────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <section className="dh-card">
            <div className="dh-card-head">
              <span className="dh-card-title">Credentials</span>
              <Link className="dh-card-link" href={tab("Credentials")}>All {counts.Credentials ?? ""} →</Link>
            </div>
            {!data ? <Empty>Loading…</Empty> : data.topCredentials.length === 0 ? (
              <Empty>No credentials yet. <Link href={tab("Credentials", "&new=1")} style={{ color: "var(--accent)" }}>Add one</Link></Empty>
            ) : data.topCredentials.map((c) => (
              <div key={c.id} className="dh-row" style={{ flexWrap: "wrap" }}>
                <Link href={tab("Credentials", `&cred=${c.id}`)} style={{ flex: "1 1 160px", minWidth: 0, textDecoration: "none", color: "var(--text)" }}>
                  <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.isFavorite && <span style={{ color: "#f5b301", marginRight: 4 }}>★</span>}{c.label}
                  </div>
                  {c.username && (
                    <div style={{ fontSize: 11, color: "var(--color-text-muted)", fontFamily: "var(--mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.username}</div>
                  )}
                </Link>
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  {c.username && <SecretCopy credId={c.id} field="username" plainValue={c.username} label="User" compact />}
                  {c.hasPassword && <SecretCopy credId={c.id} field="password" label="Password" compact />}
                  {c.hasTotp && <SecretCopy credId={c.id} field="totp" label="2FA" compact />}
                  {c.url && (
                    <a href={c.url} target="_blank" rel="noopener noreferrer" className="dh-copy-btn compact" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>Open ↗</a>
                  )}
                </div>
              </div>
            ))}
          </section>

          <section className="dh-card">
            <div className="dh-card-head">
              <span className="dh-card-title">Key infrastructure</span>
              <Link className="dh-card-link" href={tab("Assets")}>All {counts.Assets ?? ""} assets →</Link>
            </div>
            {!data ? <Empty>Loading…</Empty> : data.keyAssets.length === 0 ? (
              <Empty>No firewalls, switches, servers or NAS documented yet.</Empty>
            ) : data.keyAssets.map((a) => (
              <div key={a.id} className="dh-row" style={{ flexWrap: "wrap" }}>
                <Link href={`/assets/${a.id}`} style={{ flex: "1 1 180px", minWidth: 0, textDecoration: "none", color: "var(--text)" }}>
                  <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.friendlyName || a.name}</div>
                  <div style={{ fontSize: 11, color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {[a.assetType?.name, [a.make, a.model].filter(Boolean).join(" "), a.location?.name].filter(Boolean).join(" · ")}
                  </div>
                </Link>
                {a.ipAddress && <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--color-text-secondary)" }}>{a.ipAddress}</span>}
                <div style={{ display: "flex", gap: 4 }}>
                  {a.managementUrl && <a href={a.managementUrl} target="_blank" rel="noopener noreferrer" className="dh-copy-btn compact" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>Manage ↗</a>}
                  {a.splashtopUrl && <a href={a.splashtopUrl} className="dh-copy-btn compact" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>Splashtop</a>}
                  {a.rdpEnabled && <a href={`/api/assets/${a.id}/rdp`} className="dh-copy-btn compact" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>RDP</a>}
                </div>
              </div>
            ))}
          </section>
        </div>

        {/* ── Right: who / what / what changed ─────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <section className="dh-card">
            <div className="dh-card-head">
              <span className="dh-card-title">Contacts</span>
              <Link className="dh-card-link" href={tab("People")}>All {counts.People ?? ""} people →</Link>
            </div>
            {!data ? <Empty>Loading…</Empty> : data.contacts.length === 0 ? (
              <Empty>No primary / escalation / billing contact flagged.</Empty>
            ) : data.contacts.map((p) => (
              <div key={p.id} className="dh-row" style={{ alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>
                    {p.name}
                    <span style={{ marginLeft: 6, fontSize: 10, fontFamily: "var(--mono)", color: "var(--color-text-muted)" }}>
                      {[p.isPrimary && "PRIMARY", p.isEscalation && "ESCALATION", p.isBilling && "BILLING"].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                  {p.jobTitle && <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{p.jobTitle}</div>}
                </div>
                <div style={{ textAlign: "right", fontSize: 12, lineHeight: 1.6, minWidth: 0 }}>
                  {(p.mobile || p.phone) && <a href={`tel:${p.mobile || p.phone}`} style={{ color: "var(--color-text-secondary)", textDecoration: "none", display: "block" }}>{p.mobile || p.phone}</a>}
                  {p.email && <a href={`mailto:${p.email}`} style={{ color: "var(--color-text-secondary)", textDecoration: "none", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>{p.email}</a>}
                </div>
              </div>
            ))}
          </section>

          {data?.notes && (
            <section className="dh-card">
              <div className="dh-card-head"><span className="dh-card-title">Notes</span></div>
              <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{data.notes}</div>
            </section>
          )}

          <section className="dh-card">
            <div className="dh-card-head">
              <span className="dh-card-title">Docs & SOPs</span>
              <span style={{ display: "flex", gap: 10 }}>
                <Link className="dh-card-link" href={tab("Documents")}>Docs →</Link>
                <Link className="dh-card-link" href={tab("SOPs")}>SOPs →</Link>
              </span>
            </div>
            {!data ? <Empty>Loading…</Empty> : data.recentDocs.length + data.sops.length === 0 ? (
              <Empty>No documents or SOPs yet.</Empty>
            ) : (
              <>
                {data.sops.map((r) => (
                  <Link key={"s" + r.id} href={`/runbooks/${r.id}`} className="dh-row" style={{ textDecoration: "none", color: "var(--text)", fontSize: 13 }}>
                    <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--accent2, #00d4aa)" }}>SOP</span>
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</span>
                    <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{ago(r.updatedAt)}</span>
                  </Link>
                ))}
                {data.recentDocs.map((d) => (
                  <Link key={"d" + d.id} href={tab("Documents", `&doc=${d.id}`)} className="dh-row" style={{ textDecoration: "none", color: "var(--text)", fontSize: 13 }}>
                    <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--color-text-muted)" }}>DOC</span>
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.title}</span>
                    {d.needsReview && <span style={{ fontSize: 10, color: "var(--warn)" }}>⚑ review</span>}
                    <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{ago(d.updatedAt)}</span>
                  </Link>
                ))}
              </>
            )}
          </section>

          {changesSlot}
        </div>
      </div>
    </div>
  )
}
