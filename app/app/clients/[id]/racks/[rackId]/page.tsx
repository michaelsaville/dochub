"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams } from "next/navigation"
import AppShell from "@/components/AppShell"
import RackEditor, { type EditorDevice, type EditorLink } from "@/components/RackEditor"

/**
 * Rack elevation + patching, on its OWN route.
 *
 * Deliberately not a tab on the client detail page: that file is already 4,300+
 * lines and mounts eight network sub-tabs. A canvas surface with its own gesture
 * handling, its own fetch and its own error states does not belong inside it.
 */

type Elevation = {
  id: string
  name: string
  totalU: number
  clientId: string | null
  locationName: string | null
  devices: EditorDevice[]
  links: EditorLink[]
}

export default function RackEditorPage() {
  const { id, rackId } = useParams<{ id: string; rackId: string }>()
  const [data, setData] = useState<Elevation | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [trace, setTrace] = useState<{ chain: string; hops: number } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/racks/${rackId}/elevation`)
      if (!res.ok) { setErr((await res.json()).error ?? "Failed to load"); return }
      setData(await res.json())
      setErr(null)
    } catch {
      setErr("Failed to load rack")
    } finally { setLoading(false) }
  }, [rackId])

  useEffect(() => { load() }, [load])

  const connect = useCallback(async (aPortId: string, bPortId: string, kind: "BUILDING" | "PATCH") => {
    const res = await fetch("/api/port-links", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aPortId, bPortId, kind }),
    })
    if (!res.ok) throw new Error((await res.json()).error ?? "Could not connect")
    await load()
  }, [load])

  const disconnect = useCallback(async (linkId: string) => {
    await fetch(`/api/port-links?id=${encodeURIComponent(linkId)}`, { method: "DELETE" })
    await load()
  }, [load])

  // The authoritative chain comes from the server-side recursive CTE, not the
  // client-side highlight walk — the highlight is a visual affordance, this is the
  // answer someone acts on at 2am.
  const tracePort = useCallback(async (portId: string) => {
    try {
      const res = await fetch(`/api/ports/${portId}/trace`)
      if (!res.ok) { setTrace(null); return }
      const t = await res.json()
      setTrace({ chain: t.chain, hops: t.hops.length })
    } catch { setTrace(null) }
  }, [])

  const addPorts = useCallback(async (assetId: string, portCount: number, passthrough: boolean) => {
    await fetch(`/api/assets/${assetId}/device-ports`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ portCount, passthrough }),
    })
    await load()
  }, [load])

  return (
    <AppShell>
      <div style={{ padding: "24px", maxWidth: "1100px" }}>
        <div style={{ marginBottom: "6px" }}>
          <a href={`/clients/${id}?tab=Network&sub=racks`}
             style={{ fontSize: "12px", color: "var(--color-text-secondary)" }} className="no-print">
            ← Back to racks
          </a>
        </div>
        <h1 style={{ fontSize: "22px", fontWeight: 600, color: "var(--color-text-primary)", marginBottom: "2px" }}>
          {data?.name ?? "Rack"}
        </h1>
        <div style={{ fontSize: "13px", color: "var(--color-text-muted)", marginBottom: "18px" }}>
          {data ? `${data.locationName ?? ""} · ${data.totalU}U · ${data.devices.length} device${data.devices.length === 1 ? "" : "s"}` : ""}
        </div>

        {trace && (
          <div style={{
            marginBottom: "14px", padding: "10px 12px", borderRadius: "8px",
            background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-secondary)",
          }}>
            <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", marginBottom: "3px" }}>
              End-to-end path · {trace.hops} hop{trace.hops === 1 ? "" : "s"}
            </div>
            <div style={{ fontFamily: "var(--mono)", fontSize: "13px", color: "var(--color-text-primary)" }}>
              {trace.chain || "Nothing connected to this port yet"}
            </div>
          </div>
        )}

        {/* Devices with no ports yet. Without this the editor is an empty box for
            every rack, since nothing scaffolds DevicePort rows automatically. */}
        {data && data.devices.some(d => d.ports.length === 0) && (
          <div style={{
            marginBottom: "14px", padding: "12px", borderRadius: "8px",
            background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-secondary)",
          }} className="no-print">
            <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginBottom: "8px" }}>
              These devices have no ports yet:
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {data.devices.filter(d => d.ports.length === 0).map(d => (
                <div key={d.assetId} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontSize: "13px", color: "var(--color-text-primary)" }}>{d.name}</span>
                  {[8, 16, 24, 48].map(n => (
                    <button key={n} className="btn btn-ghost" style={{ minHeight: "34px" }}
                      onClick={() => addPorts(d.assetId, n, /PANEL|PATCH/i.test(d.kind ?? ""))}>
                      {n}
                    </button>
                  ))}
                  <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
                    {/PANEL|PATCH/i.test(d.kind ?? "") ? "front+rear, paired" : "front only"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>Loading rack...</div>
        ) : err ? (
          <div style={{ color: "var(--color-text-danger)", fontSize: "14px" }}>{err}</div>
        ) : !data || data.devices.length === 0 ? (
          <div style={{
            border: "1px dashed var(--color-border-secondary)", borderRadius: "10px",
            padding: "24px", maxWidth: "560px",
          }}>
            <div style={{ fontSize: "15px", fontWeight: 500, color: "var(--color-text-primary)", marginBottom: "6px" }}>
              Nothing mounted in this rack yet
            </div>
            <div style={{ fontSize: "13px", color: "var(--color-text-muted)", lineHeight: 1.55 }}>
              Add devices to the rack from the client&apos;s Network → Rack Diagrams tab,
              then come back here to patch them. Ports appear once a device has them
              scaffolded.
            </div>
          </div>
        ) : (
          <RackEditor
            rackName={data.name}
            totalU={data.totalU}
            devices={data.devices}
            links={data.links}
            onConnect={connect}
            onDisconnect={disconnect}
            onTracePort={tracePort}
          />
        )}
      </div>
    </AppShell>
  )
}
