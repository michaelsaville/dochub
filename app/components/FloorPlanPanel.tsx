"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePanZoom } from "@/lib/use-pan-zoom"
import { deviceGlyph, deviceColor } from "@/lib/port-state"

/**
 * Floor plans: an uploaded image with a scaled, drawable SVG overlay.
 *
 * Structure is <img> with an absolutely-positioned <svg> on top, both in
 * plan-pixel coordinates, sharing the rack editor's viewBox pan/zoom hook. Rooms
 * are polygons, devices are pins, and everything is stored against the image's
 * natural dimensions captured at upload — so a re-encode can never silently move
 * every pin.
 *
 * Mutation is gated behind an explicit mode. On an iPad in a wiring closet, a view
 * that reacts to a stray finger by dragging a device to the wrong room is worse
 * than no floor plan at all.
 */

type Room = { id: string; name: string; shortId: string | null; geometry: unknown; color: string | null }
type Floor = {
  id: string; name: string; ordinal: number
  planStorageName: string | null; planWidth: number | null; planHeight: number | null
  pxPerMetre: number | null
  rooms: Room[]
}
type Placed = {
  id: string; name: string; friendlyName: string | null; category: string
  floorId: string | null; roomId: string | null; planX: number | null; planY: number | null; room: string | null
}
type AssetLite = { id: string; name: string; friendlyName: string | null; category: string }

type Mode = "view" | "room" | "place" | "scale"

const pointsOf = (g: unknown): [number, number][] => {
  const p = (g as { points?: unknown })?.points
  return Array.isArray(p) ? (p as [number, number][]) : []
}
const centroid = (pts: [number, number][]) => {
  const n = pts.length || 1
  return [pts.reduce((s, p) => s + p[0], 0) / n, pts.reduce((s, p) => s + p[1], 0) / n] as const
}

export default function FloorPlanPanel({
  locationId, assets,
}: { locationId: string; assets: AssetLite[] }) {
  const [floors, setFloors] = useState<Floor[]>([])
  const [placed, setPlaced] = useState<Placed[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<Mode>("view")
  const [draft, setDraft] = useState<[number, number][]>([])
  const [placingAssetId, setPlacingAssetId] = useState("")
  const [scalePts, setScalePts] = useState<[number, number][]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const floor = floors.find((f) => f.id === activeId) ?? floors[0] ?? null
  const W = floor?.planWidth ?? 1000
  const H = floor?.planHeight ?? 700
  const pz = usePanZoom(useMemo(() => ({ x: 0, y: 0, w: W, h: H }), [W, H]))

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/locations/${locationId}/floors`)
      if (res.ok) {
        const d = await res.json()
        setFloors(d.floors)
        setPlaced(d.placed)
        setActiveId((cur) => cur ?? d.floors[0]?.id ?? null)
      }
    } finally { setLoading(false) }
  }, [locationId])

  useEffect(() => { load() }, [load])

  async function addFloor() {
    const res = await fetch(`/api/locations/${locationId}/floors`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: floors.length === 0 ? "Ground Floor" : `Floor ${floors.length + 1}` }),
    })
    if (res.ok) { const f = await res.json(); setActiveId(f.id); await load() }
  }

  async function upload(file: File) {
    if (!floor) return
    const fd = new FormData()
    fd.append("file", file)
    const res = await fetch(`/api/floors/${floor.id}`, { method: "POST", body: fd })
    if (res.ok) { setMsg("Plan uploaded — set the scale next."); await load() }
    else setMsg((await res.json()).error ?? "Upload failed")
  }

  // Two taps on a known distance + the real length = pixels per metre.
  async function finishScale(pts: [number, number][]) {
    if (!floor || pts.length < 2) return
    const px = Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1])
    const answer = prompt(`That line is ${px.toFixed(0)} pixels. How long is it in metres?`)
    const metres = Number(answer)
    if (!Number.isFinite(metres) || metres <= 0) { setScalePts([]); setMode("view"); return }
    await fetch(`/api/floors/${floor.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pxPerMetre: px / metres }),
    })
    setScalePts([]); setMode("view"); setMsg(`Scale set: ${(px / metres).toFixed(1)} px/m`)
    await load()
  }

  async function saveRoom(pts: [number, number][]) {
    if (!floor || pts.length < 3) { setDraft([]); return }
    const name = prompt("Room name (e.g. MDF, Exam 3)")
    if (!name?.trim()) { setDraft([]); return }
    await fetch(`/api/floors/${floor.id}/rooms`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, points: pts }),
    })
    setDraft([]); setMode("view")
    await load()
  }

  async function placeAsset(x: number, y: number) {
    if (!floor || !placingAssetId) return
    // Drop into whichever room polygon contains the point, so placing a device
    // also answers "which room is it in" without a second step.
    const hit = floor.rooms.find((r) => pointInPolygon([x, y], pointsOf(r.geometry)))
    await fetch(`/api/assets/${placingAssetId}/placement`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ floorId: floor.id, planX: x, planY: y, ...(hit ? { roomName: hit.name } : {}) }),
    })
    setPlacingAssetId(""); setMode("view")
    await load()
  }

  const onCanvasTap = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (mode === "view" || pz.didPan()) return
    const { x, y } = pz.toLocal(e.clientX, e.clientY)
    if (mode === "room") {
      // Tap the first vertex again to close.
      if (draft.length >= 3 && Math.hypot(draft[0][0] - x, draft[0][1] - y) < Math.max(12, W * 0.012)) {
        saveRoom(draft); return
      }
      setDraft((d) => [...d, [x, y]])
    } else if (mode === "scale") {
      const next: [number, number][] = [...scalePts, [x, y]]
      setScalePts(next)
      if (next.length === 2) finishScale(next)
    } else if (mode === "place") {
      placeAsset(x, y)
    }
  }, [mode, draft, scalePts, pz, W]) // eslint-disable-line react-hooks/exhaustive-deps

  const onFloor = placed.filter((p) => p.floorId === floor?.id && p.planX != null && p.planY != null)
  const unplaced = assets.filter((a) => !placed.some((p) => p.id === a.id && p.floorId === floor?.id))

  if (loading) return <div style={{ fontSize: "14px", color: "var(--color-text-secondary)" }}>Loading floor plans...</div>

  if (floors.length === 0) {
    return (
      <div style={{ border: "1px dashed var(--color-border-secondary)", borderRadius: "10px", padding: "24px", maxWidth: "560px" }}>
        <div style={{ fontSize: "15px", fontWeight: 500, color: "var(--color-text-primary)", marginBottom: "6px" }}>
          No floor plan for this site
        </div>
        <div style={{ fontSize: "13px", color: "var(--color-text-muted)", lineHeight: 1.55, marginBottom: "14px" }}>
          A floor plan is optional — cable runs and rack elevations work without one.
          It earns its keep when someone unfamiliar with the site has to find a jack.
        </div>
        <button className="btn btn-primary" onClick={addFloor} style={{ minHeight: "40px" }}>Add a floor</button>
      </div>
    )
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="no-print" style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginBottom: "12px" }}>
        {floors.length > 1 && (
          <select value={floor?.id ?? ""} onChange={(e) => { setActiveId(e.target.value); setMode("view") }}
            style={{ padding: "9px 12px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)",
                     background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}>
            {floors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        )}
        <button className="btn btn-secondary" onClick={() => fileRef.current?.click()} style={{ minHeight: "40px" }}>
          {floor?.planStorageName ? "Replace plan" : "Upload plan"}
        </button>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = "" }} />

        {/* Explicit edit modes. View mode NEVER mutates on a stray touch. */}
        {(["room", "place", "scale"] as Mode[]).map((m) => (
          <button key={m} className={mode === m ? "btn btn-primary" : "btn btn-ghost"} style={{ minHeight: "40px" }}
            onClick={() => { setMode(mode === m ? "view" : m); setDraft([]); setScalePts([]); setMsg(null) }}
            disabled={!floor?.planStorageName}>
            {m === "room" ? "Draw room" : m === "place" ? "Place device" : "Set scale"}
          </button>
        ))}
        {mode === "place" && (
          <select value={placingAssetId} onChange={(e) => setPlacingAssetId(e.target.value)}
            style={{ padding: "9px 12px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)",
                     background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}>
            <option value="">Choose a device...</option>
            {unplaced.map((a) => <option key={a.id} value={a.id}>{a.friendlyName || a.name}</option>)}
          </select>
        )}
        <button className="btn btn-secondary" onClick={pz.reset} style={{ minHeight: "40px" }}>Fit</button>
        {floor?.pxPerMetre && (
          <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
            {floor.pxPerMetre.toFixed(1)} px/m
          </span>
        )}
        {mode !== "view" && (
          <span style={{ fontSize: "12px", color: "var(--color-text-warning)" }}>
            {mode === "room" ? "Tap corners; tap the first point again to close"
              : mode === "scale" ? "Tap both ends of a known distance"
              : "Tap where the device is"}
          </span>
        )}
        {msg && <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>{msg}</span>}
      </div>

      {!floor?.planStorageName ? (
        <div style={{ border: "1px dashed var(--color-border-secondary)", borderRadius: "10px", padding: "24px", fontSize: "13px", color: "var(--color-text-muted)" }}>
          Upload an image of the floor plan to start. A phone photo of a printed
          drawing is fine — it gets downscaled and re-encoded on upload.
        </div>
      ) : (
        <div style={{ position: "relative", maxWidth: "100%", overflow: "hidden", borderRadius: "8px", border: "1px solid var(--color-border-primary)" }}>
          <img src={`/api/floors/${floor.id}`} alt={`${floor.name} plan`}
            style={{ display: "block", width: "100%", height: "auto" }} />
          <svg
            {...pz.bind}
            onPointerUp={(e) => { pz.bind.onPointerUp(e); onCanvasTap(e) }}
            className="print-graphics"
            style={{ ...pz.bind.style, position: "absolute", inset: 0, width: "100%", height: "100%" }}
          >
            {/* Rooms */}
            {floor.rooms.map((r) => {
              const pts = pointsOf(r.geometry)
              if (pts.length < 3) return null
              const [cx, cy] = centroid(pts)
              return (
                <g key={r.id}>
                  <polygon points={pts.map((p) => p.join(",")).join(" ")}
                    fill={r.color ?? "var(--accent)"} fillOpacity={0.12}
                    stroke={r.color ?? "var(--accent)"} strokeWidth={Math.max(1, W * 0.0016)} />
                  <text x={cx} y={cy} textAnchor="middle" fontSize={Math.max(11, W * 0.014)}
                    fill="var(--color-text-primary)" style={{ pointerEvents: "none" }}>{r.name}</text>
                </g>
              )
            })}

            {/* Draft polygon while drawing */}
            {draft.length > 0 && (
              <g>
                <polyline points={draft.map((p) => p.join(",")).join(" ")} fill="none"
                  stroke="var(--warn)" strokeWidth={Math.max(1.5, W * 0.002)} strokeDasharray="6 4" />
                {draft.map((p, i) => (
                  <circle key={i} cx={p[0]} cy={p[1]} r={Math.max(4, W * 0.005)}
                    fill={i === 0 ? "var(--accent2)" : "var(--warn)"} />
                ))}
              </g>
            )}

            {/* Scale calibration line */}
            {scalePts.map((p, i) => (
              <circle key={i} cx={p[0]} cy={p[1]} r={Math.max(4, W * 0.005)} fill="var(--accent2)" />
            ))}

            {/* Device pins — 2-letter mono badge, which survives greyscale print
                where a colour-only dot would not. */}
            {onFloor.map((p) => {
              const r = Math.max(9, W * 0.012)
              return (
                <g key={p.id}>
                  <circle cx={p.planX!} cy={p.planY!} r={r}
                    fill={deviceColor(p.category)} fillOpacity={0.85}
                    stroke="var(--color-text-primary)" strokeWidth={Math.max(0.6, W * 0.0008)} />
                  <text x={p.planX!} y={p.planY! + r * 0.35} textAnchor="middle"
                    fontSize={r * 0.95} fontFamily="var(--mono)" fill="#fff"
                    style={{ pointerEvents: "none" }}>{deviceGlyph(p.category)}</text>
                  <title>{`${p.friendlyName || p.name}${p.room ? ` — ${p.room}` : ""}`}</title>
                </g>
              )
            })}
          </svg>
        </div>
      )}

      {onFloor.length > 0 && (
        <div style={{ marginTop: "10px", fontSize: "12px", color: "var(--color-text-muted)" }}>
          {onFloor.length} device{onFloor.length === 1 ? "" : "s"} placed · {floor?.rooms.length ?? 0} room
          {(floor?.rooms.length ?? 0) === 1 ? "" : "s"} drawn
        </div>
      )}
    </div>
  )
}

/** Ray casting. Used to resolve which room a dropped pin landed in. */
function pointInPolygon([x, y]: [number, number], pts: [number, number][]): boolean {
  if (pts.length < 3) return false
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]
    const [xj, yj] = pts[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
