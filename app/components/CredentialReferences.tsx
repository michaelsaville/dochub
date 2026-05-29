"use client"

import { useEffect, useState } from "react"

type Refs = {
  asset: { id: string; name: string; friendlyName: string | null } | null
  person: { id: string; name: string } | null
  vpnGateways: { id: string; name: string; clientId: string | null }[]
  vpnAccessors: { id: string; vendor: { id: string; name: string } | null }[]
  phoneSystems: { id: string; name: string; clientId: string | null }[]
  phoneExtensions: { id: string; extension: string; displayName: string }[]
  voicemailExtensions: { id: string; extension: string; displayName: string }[]
  wifiControllers: { id: string; name: string; clientId: string | null }[]
  wifiNetworks: { id: string; ssid: string; controller: { clientId: string } | null }[]
  cameraSystems: { id: string; name: string; clientId: string | null }[]
  internetCircuits: { id: string; label: string; clientId: string | null }[]
  adDomains: { id: string; name: string; clientId: string | null }[]
  ptpLinks: { id: string; name: string; clientId: string | null }[]
  assetInterfaces: { id: string; name: string; asset: { id: string; name: string; friendlyName: string | null } | null }[]
  total: number
}

/**
 * Inline "What uses this credential?" panel. Lazy-loads on expand so
 * we don't fire N extra queries on every credentials tab mount.
 */
export default function CredentialReferences({ credentialId }: { credentialId: string }) {
  const [open, setOpen] = useState(false)
  const [refs, setRefs] = useState<Refs | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || refs) return
    setLoading(true)
    fetch(`/api/credentials/${credentialId}/references`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setRefs(d))
      .finally(() => setLoading(false))
  }, [open, credentialId, refs])

  return (
    <div style={{ marginTop: 6 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          fontSize: 11, color: "var(--color-text-muted)",
          background: "none", border: "none", cursor: "pointer", padding: 0,
        }}
      >
        {open ? "▼" : "▶"} What uses this credential?
        {refs && refs.total > 0 && (
          <span style={{ marginLeft: 6, color: "var(--color-text-secondary)" }}>
            ({refs.total})
          </span>
        )}
      </button>
      {open && (
        <div style={{
          marginTop: 6, padding: "8px 12px",
          background: "var(--color-background-secondary)",
          border: "0.5px solid var(--color-border-tertiary)",
          borderRadius: 6, fontSize: 12,
        }}>
          {loading && <span style={{ color: "var(--color-text-muted)" }}>Loading...</span>}
          {refs && refs.total === 0 && (
            <span style={{ color: "var(--color-text-muted)" }}>Not linked to any system yet.</span>
          )}
          {refs && refs.total > 0 && (
            <ul style={{ margin: 0, paddingLeft: 16, color: "var(--color-text-secondary)" }}>
              {refs.asset && (
                <li>
                  Asset: <a href={`/assets/${refs.asset.id}`} style={{ color: "#3b82f6", textDecoration: "none" }}>
                    {refs.asset.friendlyName ?? refs.asset.name}
                  </a>
                </li>
              )}
              {refs.person && (
                <li>Person: {refs.person.name}</li>
              )}
              {refs.vpnGateways.map(g => (
                <li key={g.id}>VPN gateway: {g.name}</li>
              ))}
              {refs.vpnAccessors.map(a => (
                <li key={a.id}>VPN accessor{a.vendor ? ` — ${a.vendor.name}` : ""}</li>
              ))}
              {refs.phoneSystems.map(p => (
                <li key={p.id}>Phone system: {p.name}</li>
              ))}
              {refs.phoneExtensions.map(e => (
                <li key={e.id}>Phone ext {e.extension}{e.displayName ? ` — ${e.displayName}` : ""}</li>
              ))}
              {refs.voicemailExtensions.map(e => (
                <li key={`vm-${e.id}`}>Voicemail ext {e.extension}{e.displayName ? ` — ${e.displayName}` : ""}</li>
              ))}
              {refs.wifiControllers.map(w => (
                <li key={w.id}>WiFi controller: {w.name}</li>
              ))}
              {refs.wifiNetworks.map(w => (
                <li key={w.id}>WiFi PSK: {w.ssid}</li>
              ))}
              {refs.cameraSystems.map(c => (
                <li key={c.id}>Camera system: {c.name}</li>
              ))}
              {refs.internetCircuits.map(c => (
                <li key={c.id}>Circuit: {c.label}</li>
              ))}
              {refs.adDomains.map(d => (
                <li key={d.id}>AD domain: {d.name}</li>
              ))}
              {refs.ptpLinks.map(p => (
                <li key={p.id}>PTP link: {p.name}</li>
              ))}
              {refs.assetInterfaces.map(i => (
                <li key={i.id}>
                  Interface {i.name}{i.asset ? <> on <a href={`/assets/${i.asset.id}`} style={{ color: "#3b82f6", textDecoration: "none" }}>{i.asset.friendlyName ?? i.asset.name}</a></> : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
