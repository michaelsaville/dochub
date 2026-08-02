"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { usePanZoom } from "@/lib/use-pan-zoom"
import {
  portFill, portText, portPattern, deviceColor, deviceGlyph,
  PORT_STATE_LABEL, type PortState,
} from "@/lib/port-state"

/**
 * Rack elevation + patching, as ONE SVG in ONE coordinate system.
 *
 * SVG rather than canvas or absolutely-positioned DOM, for reasons that are not
 * aesthetic:
 *   - print. A rack elevation is the billable as-built deliverable, and an <svg>
 *     drops into the existing @media print path vector-crisp. Canvas cannot.
 *   - cables cross device boundaries. DOM cannot draw a line from a port on one
 *     device to a port on another without a second absolutely-positioned overlay
 *     layer, which is the thing that rots.
 *   - hit testing, text and focus come free.
 *
 * Interaction is TAP A THEN TAP B, not drag. Faster on a touch screen, about a
 * third of the code, and immune to the fact that HTML5 drag-and-drop never fires on
 * iPadOS Safari — which is how the existing RackDiagram's reordering is broken.
 */

const U_HEIGHT = 26
const RACK_W = 620
const RAIL_W = 34
const PORT = 15          // drawn port size
const PORT_GAP = 3
const HIT = 44           // MINIMUM touch target. A 24-port switch at 1:1 on an iPad
                         // Mini is ~8px/port; without hit slop it is unusable.

export type EditorPort = {
  id: string
  side: "FRONT" | "REAR"
  portIndex: number
  label: string | null
  state: PortState
  vlanColor?: string | null
  isPoe?: boolean
  pairedPortId?: string | null
}

export type EditorDevice = {
  assetId: string
  name: string
  kind: string | null
  startU: number
  heightU: number
  ports: EditorPort[]
}

export type EditorLink = {
  id: string
  kind: "BUILDING" | "PATCH"
  aPortId: string
  bPortId: string
  color: string | null
}

type Props = {
  rackName: string
  totalU: number
  devices: EditorDevice[]
  links: EditorLink[]
  onConnect: (aPortId: string, bPortId: string, kind: "BUILDING" | "PATCH") => Promise<void>
  onDisconnect: (linkId: string) => Promise<void>
  onTracePort?: (portId: string) => void
  readOnly?: boolean
}

export default function RackEditor({
  rackName, totalU, devices, links, onConnect, onDisconnect, onTracePort, readOnly,
}: Props) {
  const height = totalU * U_HEIGHT + 40
  const pz = usePanZoom(useMemo(() => ({ x: 0, y: 0, w: RACK_W, h: height }), [height]))

  const [side, setSide] = useState<"FRONT" | "REAR">("FRONT")
  const [selected, setSelected] = useState<string | null>(null)
  const [pendingKind, setPendingKind] = useState<"BUILDING" | "PATCH">("PATCH")
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  // Port id -> its screen position, so cables can be drawn between any two ports
  // regardless of which device they live on.
  const portPos = useMemo(() => {
    const m = new Map<string, { x: number; y: number; device: EditorDevice; port: EditorPort }>()
    for (const d of devices) {
      const visible = d.ports.filter((p) => p.side === side).sort((a, b) => a.portIndex - b.portIndex)
      const rowY = 20 + (d.startU - 1) * U_HEIGHT
      visible.forEach((p, i) => {
        m.set(p.id, {
          x: RAIL_W + 12 + i * (PORT + PORT_GAP) + PORT / 2,
          y: rowY + (d.heightU * U_HEIGHT) / 2,
          device: d,
          port: p,
        })
      })
    }
    return m
  }, [devices, side])

  // The chain the selected port belongs to — everything else dims. Walked in the
  // client from the flat link list; the authoritative trace lives server-side.
  const highlighted = useMemo(() => {
    if (!selected) return null
    const adj = new Map<string, string[]>()
    const push = (a: string, b: string) => adj.set(a, [...(adj.get(a) ?? []), b])
    for (const l of links) { push(l.aPortId, l.bPortId); push(l.bPortId, l.aPortId) }
    for (const d of devices) for (const p of d.ports) {
      if (p.pairedPortId) { push(p.id, p.pairedPortId); push(p.pairedPortId, p.id) }
    }
    const seen = new Set([selected])
    const queue = [selected]
    while (queue.length) {
      const cur = queue.shift()!
      for (const n of adj.get(cur) ?? []) if (!seen.has(n)) { seen.add(n); queue.push(n) }
    }
    return seen
  }, [selected, links, devices])

  const dim = useCallback(
    (...ids: string[]) => (highlighted && !ids.some((i) => highlighted.has(i)) ? 0.22 : 1),
    [highlighted]
  )

  const tapPort = useCallback(async (portId: string) => {
    if (pz.didPan()) return  // the gesture was a pan, not a tap
    setMsg(null)
    if (readOnly) { setSelected(portId); onTracePort?.(portId); return }
    if (!selected) { setSelected(portId); onTracePort?.(portId); return }
    if (selected === portId) { setSelected(null); return }

    setBusy(true)
    try {
      await onConnect(selected, portId, pendingKind)
      setSelected(null)
    } catch (e) {
      setMsg((e as Error).message)
    } finally { setBusy(false) }
  }, [selected, pendingKind, readOnly, onConnect, onTracePort, pz])

  // Escape clears a half-finished connection — otherwise the next tap anywhere
  // silently patches something.
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") { setSelected(null); setMsg(null) } }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  }, [])

  const rows = Array.from({ length: totalU }, (_, i) => i + 1)

  return (
    <div>
      {/* Controls */}
      <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginBottom: "12px" }}
           className="no-print">
        <div style={{ display: "flex", borderRadius: "6px", overflow: "hidden", border: "0.5px solid var(--color-border-secondary)" }}>
          {(["FRONT", "REAR"] as const).map((s) => (
            <button key={s} onClick={() => { setSide(s); setSelected(null) }} style={{
              padding: "8px 14px", minHeight: "40px", fontSize: "12px", border: "none", cursor: "pointer",
              background: side === s ? "var(--text)" : "transparent",
              color: side === s ? "var(--bg)" : "var(--color-text-secondary)",
            }}>{s === "FRONT" ? "Front" : "Rear"}</button>
          ))}
        </div>
        {!readOnly && (
          <div style={{ display: "flex", borderRadius: "6px", overflow: "hidden", border: "0.5px solid var(--color-border-secondary)" }}>
            {(["PATCH", "BUILDING"] as const).map((k) => (
              <button key={k} onClick={() => setPendingKind(k)} style={{
                padding: "8px 14px", minHeight: "40px", fontSize: "12px", border: "none", cursor: "pointer",
                background: pendingKind === k ? "var(--text)" : "transparent",
                color: pendingKind === k ? "var(--bg)" : "var(--color-text-secondary)",
              }}>{k === "PATCH" ? "Patch cord" : "Building run"}</button>
            ))}
          </div>
        )}
        <button className="btn btn-secondary" onClick={pz.reset} style={{ minHeight: "40px" }}>Fit</button>
        {selected && (
          <span style={{ fontSize: "12px", color: "var(--color-text-warning)" }}>
            {readOnly ? "Showing this run" : `Tap a second port to connect · Esc to cancel`}
          </span>
        )}
        {busy && <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>Saving...</span>}
        {msg && <span style={{ fontSize: "12px", color: "var(--color-text-danger)" }}>{msg}</span>}
      </div>

      <svg
        {...pz.bind}
        width="100%"
        height={height}
        role="img"
        aria-label={`Rack elevation for ${rackName}, ${side.toLowerCase()} view`}
        className="print-graphics"
        style={{ ...pz.bind.style, maxWidth: "100%", background: "var(--color-chassis)", borderRadius: "8px", border: "1px solid var(--color-border-primary)" }}
      >
        <defs>
          {/* Backs up the EMPTY state so it survives greyscale print and colour
              blindness — never encode an actionable state in hue alone. */}
          <pattern id="hatch-empty" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="4" height="4" fill="var(--color-fill-empty)" />
            <line x1="0" y1="0" x2="0" y2="4" stroke="var(--color-on-empty)" strokeWidth="0.7" opacity="0.5" />
          </pattern>
        </defs>

        {/* U rail */}
        <g id="chassis">
          {rows.map((u) => (
            <g key={u}>
              <line x1={RAIL_W} y1={20 + u * U_HEIGHT} x2={RACK_W} y2={20 + u * U_HEIGHT}
                    stroke="var(--color-border-secondary)" strokeWidth="0.5" opacity="0.5" />
              <text x={RAIL_W - 8} y={20 + (u - 0.5) * U_HEIGHT + 3} textAnchor="end"
                    fontSize="9" fontFamily="var(--mono)" fill="var(--color-text-secondary)">{u}</text>
            </g>
          ))}
        </g>

        {/* Devices */}
        <g id="devices">
          {devices.map((d) => {
            const y = 20 + (d.startU - 1) * U_HEIGHT
            const h = d.heightU * U_HEIGHT - 2
            const anyId = d.ports.map((p) => p.id)
            return (
              <g key={d.assetId} opacity={dim(...anyId)}>
                <rect x={RAIL_W} y={y} width={RACK_W - RAIL_W - 6} height={h} rx="3"
                      fill={`${deviceColor(d.kind)}22`} stroke={deviceColor(d.kind)} strokeWidth="1.5" />
                <text x={RAIL_W + 6} y={y + 11} fontSize="8" fontFamily="var(--mono)"
                      fill="var(--color-text-secondary)">{deviceGlyph(d.kind)}</text>
                <text x={RACK_W - 12} y={y + h - 5} textAnchor="end" fontSize="10"
                      fill="var(--color-text-primary)">{d.name}</text>
              </g>
            )
          })}
        </g>

        {/* Ports */}
        <g id="ports">
          {[...portPos.entries()].map(([id, { x, y, port }]) => {
            const isSel = selected === id
            return (
              <g key={id} opacity={dim(id)} style={{ cursor: "pointer" }}>
                <rect x={x - PORT / 2} y={y - PORT / 2} width={PORT} height={PORT} rx="2"
                      fill={portPattern(port.state) ?? portFill(port.state)}
                      stroke={port.vlanColor || (isSel ? "var(--accent)" : "var(--color-border-primary)")}
                      strokeWidth={isSel ? 2.5 : port.vlanColor ? 2 : 0.75} />
                {port.isPoe && (
                  <text x={x} y={y + 3} textAnchor="middle" fontSize="7"
                        fill={portText(port.state)}>⚡</text>
                )}
                {/* Invisible 44px hit target. Drawn AFTER the visual so it wins the
                    hit test, and kept transparent so it never affects print. */}
                <rect x={x - HIT / 2} y={y - HIT / 2} width={HIT} height={HIT} fill="transparent"
                      onPointerUp={() => tapPort(id)}>
                  <title>{`Port ${port.portIndex}${port.label ? ` (${port.label})` : ""} — ${PORT_STATE_LABEL[port.state]}`}</title>
                </rect>
              </g>
            )
          })}
        </g>

        {/* Cables last, so they sit above the devices they connect. */}
        <g id="cables" fill="none">
          {links.map((l) => {
            const a = portPos.get(l.aPortId)
            const b = portPos.get(l.bPortId)
            if (!a || !b) return null   // other side is on the opposite face
            const midX = Math.max(a.x, b.x) + 26 + Math.abs(a.y - b.y) * 0.12
            return (
              <path
                key={l.id}
                d={`M ${a.x} ${a.y} C ${midX} ${a.y}, ${midX} ${b.y}, ${b.x} ${b.y}`}
                stroke={l.color || (l.kind === "BUILDING" ? "var(--color-text-warning)" : "var(--accent)")}
                strokeWidth={2}
                // Dashed = permanent in-wall run, solid = movable cord. Same
                // convention Patchdocs uses, and it reads in monochrome print.
                strokeDasharray={l.kind === "BUILDING" ? "5 3" : undefined}
                opacity={dim(l.aPortId, l.bPortId)}
                style={{ pointerEvents: "stroke", cursor: readOnly ? "default" : "pointer" }}
                onPointerUp={() => {
                  if (readOnly || pz.didPan()) return
                  if (confirm("Disconnect this cable?")) onDisconnect(l.id)
                }}
              />
            )
          })}
        </g>
      </svg>

      {/* Legend — prints with the elevation, which is the point. */}
      <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", marginTop: "10px" }}>
        {(["EMPTY", "CABLED", "PATCHED", "UPLINK"] as PortState[]).map((s) => (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <svg width="12" height="12" aria-hidden>
              <rect width="12" height="12" rx="2" fill={portFill(s)}
                    stroke="var(--color-border-primary)" strokeWidth="0.75" />
            </svg>
            <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>{PORT_STATE_LABEL[s]}</span>
          </div>
        ))}
        <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>— — building run · —— patch cord</span>
      </div>
    </div>
  )
}
