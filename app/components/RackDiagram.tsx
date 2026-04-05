"use client"

import { useState } from "react"

type SlotDevice = {
  id: string
  name: string
  type?: string
  category?: string
  make: string | null
  model: string | null
}

type RackSlot = {
  id: string
  startU: number
  heightU: number
  shelfPos: number
  label: string | null
  notes: string | null
  networkDevice: SlotDevice | null
  asset: SlotDevice | null
}

type Rack = {
  id: string
  name: string
  totalU: number
  notes: string | null
  location: { id: string; name: string }
  slots: RackSlot[]
}

type Props = {
  racks: Rack[]
  locations: { id: string; name: string }[]
  networkDevices: { id: string; name: string; type: string; make: string | null; model: string | null }[]
  assets: { id: string; name: string; category: string; make: string | null; model: string | null }[]
  clientId: string
  onRacksChange: (racks: Rack[]) => void
}

const DEVICE_COLORS: Record<string, string> = {
  FIREWALL: "#ef4444",
  ROUTER: "#f97316",
  SWITCH: "#3b82f6",
  ACCESS_POINT: "#8b5cf6",
  UPS: "#f59e0b",
  NAS: "#10b981",
  MODEM: "#6366f1",
  OTHER: "#64748b",
  SERVER: "#0ea5e9",
  COMPUTER: "#14b8a6",
  LAPTOP: "#84cc16",
  PRINTER: "#ec4899",
}

const input = { width: "100%", padding: "8px 12px", fontSize: "14px", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", background: "var(--color-background-primary)", color: "var(--color-text-primary)", boxSizing: "border-box" as const }
const lbl = { fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }

function slotColor(slot: RackSlot): string {
  if (slot.networkDevice) return DEVICE_COLORS[slot.networkDevice.type ?? "OTHER"] ?? "#64748b"
  if (slot.asset) return DEVICE_COLORS[slot.asset.category ?? "OTHER"] ?? "#64748b"
  return "#334155"
}

function slotName(slot: RackSlot): string {
  if (slot.label) return slot.label
  if (slot.networkDevice) return slot.networkDevice.name
  if (slot.asset) return slot.asset.name
  return "Unnamed"
}

function slotSub(slot: RackSlot): string {
  const dev = slot.networkDevice ?? slot.asset
  if (!dev) return ""
  return [dev.make, dev.model].filter(Boolean).join(" ")
}

const BLANK_SLOT_FORM = { heightU: "1", label: "", networkDeviceId: "", assetId: "", notes: "" }

export default function RackDiagram({ racks, locations, networkDevices, assets, clientId, onRacksChange }: Props) {
  const [showAddRack, setShowAddRack] = useState(false)
  const [rackForm, setRackForm] = useState({ name: "", locationId: "", totalU: "42", notes: "" })
  const [savingRack, setSavingRack] = useState(false)
  const [editingRack, setEditingRack] = useState<string | null>(null)
  const [rackEditForm, setRackEditForm] = useState<any>({})

  // addingSlotTo: { rackId, startU } — startU=0 means top shelf
  const [addingSlotTo, setAddingSlotTo] = useState<{ rackId: string; startU: number } | null>(null)
  const [slotForm, setSlotForm] = useState(BLANK_SLOT_FORM)
  const [savingSlot, setSavingSlot] = useState(false)
  const [editingSlot, setEditingSlot] = useState<string | null>(null)
  const [slotEditForm, setSlotEditForm] = useState<any>({})
  const [hoveredSlot, setHoveredSlot] = useState<string | null>(null)

  async function saveRack() {
    if (!rackForm.name.trim() || !rackForm.locationId) return
    setSavingRack(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/racks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...rackForm, totalU: Number(rackForm.totalU) }),
      })
      if (res.ok) {
        const created = await res.json()
        onRacksChange([...racks, created])
        setRackForm({ name: "", locationId: "", totalU: "42", notes: "" })
        setShowAddRack(false)
      }
    } finally { setSavingRack(false) }
  }

  async function updateRack(rackId: string) {
    setSavingRack(true)
    try {
      const res = await fetch(`/api/racks/${rackId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rackEditForm),
      })
      if (res.ok) {
        const updated = await res.json()
        onRacksChange(racks.map(r => r.id === rackId ? { ...r, ...updated } : r))
        setEditingRack(null)
      }
    } finally { setSavingRack(false) }
  }

  async function deleteRack(rackId: string) {
    if (!confirm("Delete this rack and all its slot assignments?")) return
    await fetch(`/api/racks/${rackId}`, { method: "DELETE" })
    onRacksChange(racks.filter(r => r.id !== rackId))
  }

  async function saveSlot(rackId: string, startU: number) {
    setSavingSlot(true)
    try {
      const res = await fetch(`/api/racks/${rackId}/slots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startU, ...slotForm, heightU: Number(slotForm.heightU) }),
      })
      if (res.ok) {
        const created = await res.json()
        onRacksChange(racks.map(r => r.id === rackId
          ? { ...r, slots: [...r.slots, created].sort((a, b) => a.startU - b.startU || a.shelfPos - b.shelfPos) }
          : r
        ))
        setSlotForm(BLANK_SLOT_FORM)
        setAddingSlotTo(null)
      } else {
        const err = await res.json()
        alert(err.error || "Failed to add device")
      }
    } finally { setSavingSlot(false) }
  }

  async function updateSlot(rackId: string, slotId: string) {
    setSavingSlot(true)
    try {
      const res = await fetch(`/api/slots/${slotId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(slotEditForm),
      })
      if (res.ok) {
        const updated = await res.json()
        onRacksChange(racks.map(r => r.id === rackId
          ? { ...r, slots: r.slots.map(s => s.id === slotId ? updated : s) }
          : r
        ))
        setEditingSlot(null)
      }
    } finally { setSavingSlot(false) }
  }

  async function deleteSlot(rackId: string, slotId: string) {
    await fetch(`/api/slots/${slotId}`, { method: "DELETE" })
    onRacksChange(racks.map(r => r.id === rackId
      ? { ...r, slots: r.slots.filter(s => s.id !== slotId) }
      : r
    ))
  }

  function renderSlotItem(slot: RackSlot, rackId: string, rowHeight: number, isShelf: boolean) {
    const color = slotColor(slot)
    const isHovered = hoveredSlot === slot.id
    const isEditing = editingSlot === slot.id

    return (
      <div
        key={slot.id}
        style={{
          flex: 1,
          minWidth: 0,
          height: `${rowHeight}px`,
          background: isEditing ? "#1e293b" : `${color}22`,
          borderLeft: `3px solid ${color}`,
          borderRight: isShelf ? "1px solid #1e293b" : undefined,
          position: "relative",
          cursor: "pointer",
        }}
        onMouseEnter={() => setHoveredSlot(slot.id)}
        onMouseLeave={() => setHoveredSlot(null)}
      >
        {isEditing ? (
          <div style={{ padding: "8px 10px", overflowY: "auto", maxHeight: `${rowHeight}px` }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", marginBottom: "6px" }}>
              <div>
                <label style={{ ...lbl, color: "#94a3b8", fontSize: "11px" }}>Label</label>
                <input value={slotEditForm.label ?? ""} onChange={e => setSlotEditForm((f: any) => ({ ...f, label: e.target.value }))} placeholder="Optional" style={{ ...input, background: "#0f172a", color: "#e2e8f0", borderColor: "#334155", fontSize: "11px", padding: "3px 7px" }} />
              </div>
              <div>
                <label style={{ ...lbl, color: "#94a3b8", fontSize: "11px" }}>Notes</label>
                <input value={slotEditForm.notes ?? ""} onChange={e => setSlotEditForm((f: any) => ({ ...f, notes: e.target.value }))} style={{ ...input, background: "#0f172a", color: "#e2e8f0", borderColor: "#334155", fontSize: "11px", padding: "3px 7px" }} />
              </div>
              <div>
                <label style={{ ...lbl, color: "#94a3b8", fontSize: "11px" }}>Network Device</label>
                <select value={slotEditForm.networkDeviceId ?? ""} onChange={e => setSlotEditForm((f: any) => ({ ...f, networkDeviceId: e.target.value, assetId: "" }))} style={{ ...input, background: "#0f172a", color: "#e2e8f0", borderColor: "#334155", fontSize: "11px", padding: "3px 7px" }}>
                  <option value="">None</option>
                  {networkDevices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ ...lbl, color: "#94a3b8", fontSize: "11px" }}>Asset</label>
                <select value={slotEditForm.assetId ?? ""} onChange={e => setSlotEditForm((f: any) => ({ ...f, assetId: e.target.value, networkDeviceId: "" }))} style={{ ...input, background: "#0f172a", color: "#e2e8f0", borderColor: "#334155", fontSize: "11px", padding: "3px 7px" }}>
                  <option value="">None</option>
                  {assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: "flex", gap: "5px" }}>
              <button onClick={() => updateSlot(rackId, slot.id)} disabled={savingSlot} style={{ fontSize: "10px", fontWeight: 500, padding: "3px 8px", borderRadius: "5px", border: "none", background: "#e2e8f0", color: "#0f172a", cursor: "pointer" }}>Save</button>
              <button onClick={() => setEditingSlot(null)} style={{ fontSize: "10px", padding: "3px 8px", borderRadius: "5px", border: "1px solid #334155", background: "transparent", cursor: "pointer", color: "#94a3b8" }}>Cancel</button>
              <button onClick={() => deleteSlot(rackId, slot.id)} style={{ fontSize: "10px", padding: "3px 8px", borderRadius: "5px", border: "none", background: "#7f1d1d", color: "#fca5a5", cursor: "pointer", marginLeft: "auto" }}>Remove</button>
            </div>
          </div>
        ) : (
          <div style={{ padding: "0 8px", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ fontSize: "12px", fontWeight: 500, color: "#e2e8f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {slotName(slot)}
            </div>
            {slotSub(slot) && (
              <div style={{ fontSize: "10px", color: "#94a3b8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {slotSub(slot)}
              </div>
            )}
            {isHovered && (
              <button
                onClick={() => { setEditingSlot(slot.id); setSlotEditForm({ label: slot.label ?? "", notes: slot.notes ?? "", networkDeviceId: slot.networkDevice?.id ?? "", assetId: slot.asset?.id ?? "" }) }}
                style={{ position: "absolute", right: "4px", top: "50%", transform: "translateY(-50%)", fontSize: "10px", padding: "2px 6px", borderRadius: "4px", border: "1px solid #475569", background: "#1e293b", color: "#94a3b8", cursor: "pointer", zIndex: 1 }}
              >
                Edit
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  function renderRack(rack: Rack) {
    const U_HEIGHT = 28

    // Separate top-shelf slots (startU=0) from normal slots
    const topShelfSlots = rack.slots.filter(s => s.startU === 0).sort((a, b) => a.shelfPos - b.shelfPos)

    // Group normal slots by startU
    const slotsByU = new Map<number, RackSlot[]>()
    rack.slots.filter(s => s.startU > 0).forEach(slot => {
      if (!slotsByU.has(slot.startU)) slotsByU.set(slot.startU, [])
      slotsByU.get(slot.startU)!.push(slot)
    })

    // Build rows for the main rack body
    const rows: Array<{ type: "occupied"; u: number; slots: RackSlot[]; height: number } | { type: "empty"; u: number }> = []
    let u = 1
    while (u <= rack.totalU) {
      const slotsAtU = slotsByU.get(u)
      if (slotsAtU && slotsAtU.length > 0) {
        // height = max heightU among all slots at this U (shelf items are always 1U)
        const height = Math.max(...slotsAtU.map(s => s.heightU))
        rows.push({ type: "occupied", u, slots: slotsAtU.sort((a, b) => a.shelfPos - b.shelfPos), height })
        u += height
      } else {
        rows.push({ type: "empty", u })
        u++
      }
    }

    const isAddingTopShelf = addingSlotTo?.rackId === rack.id && addingSlotTo?.startU === 0

    return (
      <div key={rack.id} style={{ marginBottom: "32px" }}>
        {/* Rack header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
          {editingRack === rack.id ? (
            <div style={{ flex: 1, background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: "10px", padding: "16px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 80px", gap: "12px", marginBottom: "12px" }}>
                <div>
                  <label style={lbl}>Name</label>
                  <input value={rackEditForm.name ?? ""} onChange={e => setRackEditForm((f: any) => ({ ...f, name: e.target.value }))} style={input} />
                </div>
                <div>
                  <label style={lbl}>Total U</label>
                  <input type="number" value={rackEditForm.totalU ?? 42} onChange={e => setRackEditForm((f: any) => ({ ...f, totalU: Number(e.target.value) }))} style={input} />
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={() => updateRack(rack.id)} disabled={savingRack} style={{ fontSize: "13px", fontWeight: 500, padding: "6px 14px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>Save</button>
                <button onClick={() => setEditingRack(null)} style={{ fontSize: "13px", padding: "6px 14px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <div>
                <span style={{ fontSize: "15px", fontWeight: 600, color: "var(--color-text-primary)" }}>{rack.name}</span>
                <span style={{ fontSize: "13px", color: "var(--color-text-muted)", marginLeft: "10px" }}>{rack.location.name} · {rack.totalU}U · {rack.slots.filter(s => s.startU > 0).length} device{rack.slots.filter(s => s.startU > 0).length !== 1 ? "s" : ""}{topShelfSlots.length > 0 ? ` + ${topShelfSlots.length} on top shelf` : ""}</span>
              </div>
              <div style={{ display: "flex", gap: "10px" }}>
                <button onClick={() => { setEditingRack(rack.id); setRackEditForm({ name: rack.name, totalU: rack.totalU, notes: rack.notes ?? "" }) }}
                  style={{ fontSize: "12px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Edit</button>
                <button onClick={() => deleteRack(rack.id)}
                  style={{ fontSize: "12px", color: "var(--color-text-danger)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Delete</button>
              </div>
            </>
          )}
        </div>

        {/* Rack visual */}
        <div style={{ maxWidth: "680px" }}>

          {/* Top-of-rack shelf */}
          <div style={{ border: "2px solid #475569", borderBottom: "none", borderRadius: "6px 6px 0 0", background: "#1e293b", padding: "6px 8px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", minHeight: "36px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1, flexWrap: "wrap" }}>
              <span style={{ fontSize: "10px", color: "#64748b", fontFamily: "monospace", flexShrink: 0 }}>TOP</span>
              {topShelfSlots.length === 0 ? (
                <span style={{ fontSize: "11px", color: "#334155", fontStyle: "italic" }}>top shelf empty</span>
              ) : (
                <div style={{ display: "flex", gap: "4px", flex: 1, flexWrap: "wrap" }}>
                  {topShelfSlots.map(slot => {
                    const color = slotColor(slot)
                    const isEditing = editingSlot === slot.id
                    return (
                      <div
                        key={slot.id}
                        style={{ background: `${color}33`, border: `1px solid ${color}88`, borderRadius: "4px", padding: "2px 8px", fontSize: "11px", color: "#e2e8f0", cursor: "pointer", position: "relative" }}
                        onMouseEnter={() => setHoveredSlot(slot.id)}
                        onMouseLeave={() => setHoveredSlot(null)}
                      >
                        {isEditing ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "4px 0", minWidth: "200px" }}>
                            <input value={slotEditForm.label ?? ""} onChange={e => setSlotEditForm((f: any) => ({ ...f, label: e.target.value }))} placeholder="Label" style={{ ...input, background: "#0f172a", color: "#e2e8f0", borderColor: "#334155", fontSize: "11px", padding: "2px 6px" }} />
                            <select value={slotEditForm.networkDeviceId ?? ""} onChange={e => setSlotEditForm((f: any) => ({ ...f, networkDeviceId: e.target.value, assetId: "" }))} style={{ ...input, background: "#0f172a", color: "#e2e8f0", borderColor: "#334155", fontSize: "11px", padding: "2px 6px" }}>
                              <option value="">No device</option>
                              {networkDevices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                            <select value={slotEditForm.assetId ?? ""} onChange={e => setSlotEditForm((f: any) => ({ ...f, assetId: e.target.value, networkDeviceId: "" }))} style={{ ...input, background: "#0f172a", color: "#e2e8f0", borderColor: "#334155", fontSize: "11px", padding: "2px 6px" }}>
                              <option value="">No asset</option>
                              {assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                            <div style={{ display: "flex", gap: "4px" }}>
                              <button onClick={() => updateSlot(rack.id, slot.id)} style={{ fontSize: "10px", padding: "2px 7px", borderRadius: "4px", border: "none", background: "#e2e8f0", color: "#0f172a", cursor: "pointer" }}>Save</button>
                              <button onClick={() => setEditingSlot(null)} style={{ fontSize: "10px", padding: "2px 7px", borderRadius: "4px", border: "1px solid #475569", background: "transparent", cursor: "pointer", color: "#94a3b8" }}>Cancel</button>
                              <button onClick={() => deleteSlot(rack.id, slot.id)} style={{ fontSize: "10px", padding: "2px 7px", borderRadius: "4px", border: "none", background: "#7f1d1d", color: "#fca5a5", cursor: "pointer" }}>Remove</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {slotName(slot)}
                            {hoveredSlot === slot.id && (
                              <button
                                onClick={() => { setEditingSlot(slot.id); setSlotEditForm({ label: slot.label ?? "", notes: slot.notes ?? "", networkDeviceId: slot.networkDevice?.id ?? "", assetId: slot.asset?.id ?? "" }) }}
                                style={{ marginLeft: "6px", fontSize: "10px", padding: "1px 5px", borderRadius: "3px", border: "1px solid #475569", background: "#1e293b", color: "#94a3b8", cursor: "pointer" }}
                              >
                                Edit
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <button
              onClick={() => { setAddingSlotTo({ rackId: rack.id, startU: 0 }); setSlotForm(BLANK_SLOT_FORM) }}
              style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "4px", border: "1px solid #334155", background: "transparent", cursor: "pointer", color: "#64748b", flexShrink: 0 }}
            >
              + add
            </button>
          </div>

          {/* Main rack body */}
          <div style={{ display: "flex", border: "2px solid #334155", borderTop: "1px solid #334155", borderRadius: "0 0 8px 8px", overflow: "hidden", background: "#0f172a" }}>
            {/* U number column */}
            <div style={{ width: "32px", background: "#1e293b", borderRight: "1px solid #334155", flexShrink: 0 }}>
              {rows.map(row => (
                <div key={row.u} style={{
                  height: row.type === "occupied" ? `${row.height * U_HEIGHT}px` : `${U_HEIGHT}px`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "10px", color: "#64748b", fontFamily: "monospace",
                  borderBottom: "1px solid #1e293b"
                }}>
                  {row.u}
                </div>
              ))}
            </div>

            {/* Slot column */}
            <div style={{ flex: 1 }}>
              {rows.map(row => {
                if (row.type === "occupied") {
                  const isShelf = row.slots.length > 1
                  return (
                    <div
                      key={row.u}
                      style={{ height: `${row.height * U_HEIGHT}px`, borderBottom: "1px solid #0f172a", display: "flex" }}
                    >
                      {row.slots.map(slot => renderSlotItem(slot, rack.id, row.height * U_HEIGHT, isShelf))}
                      {/* Add-to-shelf button appears at end of occupied rows */}
                      <div
                        style={{ width: "24px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", opacity: 0.4 }}
                        title="Add another item to this shelf row"
                        onClick={() => { setAddingSlotTo({ rackId: rack.id, startU: row.u }); setSlotForm(BLANK_SLOT_FORM) }}
                        onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                        onMouseLeave={e => (e.currentTarget.style.opacity = "0.4")}
                      >
                        <span style={{ fontSize: "14px", color: "#475569", lineHeight: 1 }}>+</span>
                      </div>
                    </div>
                  )
                }

                // Empty row
                const isAddingHere = addingSlotTo?.rackId === rack.id && addingSlotTo?.startU === row.u
                return (
                  <div
                    key={row.u}
                    style={{ height: `${U_HEIGHT}px`, borderBottom: "1px solid #1a2332", background: "#0f172a", cursor: "pointer", position: "relative" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "#1e293b" }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "#0f172a" }}
                    onClick={() => { if (!isAddingHere) { setAddingSlotTo({ rackId: rack.id, startU: row.u }); setSlotForm(BLANK_SLOT_FORM) } }}
                  >
                    <div style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", fontSize: "10px", color: "#334155" }}>+ add</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Add slot form (shown below rack for any add action) */}
        {addingSlotTo?.rackId === rack.id && (
          <div style={{ marginTop: "8px", background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: "10px", padding: "16px", maxWidth: "680px" }}>
            <div style={{ fontSize: "14px", fontWeight: 500, marginBottom: "12px", color: "var(--color-text-primary)" }}>
              {addingSlotTo.startU === 0
                ? "Add item to top shelf"
                : (() => {
                    const slotsAtU = rack.slots.filter(s => s.startU === addingSlotTo.startU)
                    return slotsAtU.length > 0
                      ? `Add item to shelf at U${addingSlotTo.startU}`
                      : `Add device at U${addingSlotTo.startU}`
                  })()
              }
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 1fr", gap: "12px", marginBottom: "12px" }}>
              {/* Height only shown for new empty slots, not shelf adds */}
              {addingSlotTo.startU > 0 && rack.slots.filter(s => s.startU === addingSlotTo.startU).length === 0 && (
                <div>
                  <label style={lbl}>Height (U)</label>
                  <input type="number" min="1" max={rack.totalU} value={slotForm.heightU} onChange={e => setSlotForm(f => ({ ...f, heightU: e.target.value }))} style={input} />
                </div>
              )}
              <div style={{ gridColumn: addingSlotTo.startU === 0 || rack.slots.filter(s => s.startU === addingSlotTo.startU).length > 0 ? "1 / 2" : undefined }}>
                <label style={lbl}>Network Device</label>
                <select value={slotForm.networkDeviceId} onChange={e => setSlotForm(f => ({ ...f, networkDeviceId: e.target.value, assetId: "" }))} style={input}>
                  <option value="">None</option>
                  {networkDevices.map(d => <option key={d.id} value={d.id}>{d.name}{d.make ? ` (${d.make}${d.model ? " " + d.model : ""})` : ""}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Asset</label>
                <select value={slotForm.assetId} onChange={e => setSlotForm(f => ({ ...f, assetId: e.target.value, networkDeviceId: "" }))} style={input}>
                  <option value="">None</option>
                  {assets.map(a => <option key={a.id} value={a.id}>{a.name}{a.make ? ` (${a.make}${a.model ? " " + a.model : ""})` : ""}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={lbl}>Label (optional — overrides device name in diagram)</label>
                <input value={slotForm.label} onChange={e => setSlotForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. Patch Panel A, 1U Blanking" style={input} />
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => saveSlot(rack.id, addingSlotTo.startU)} disabled={savingSlot} style={{ fontSize: "13px", fontWeight: 500, padding: "6px 14px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>
                {savingSlot ? "Saving..." : "Add to rack"}
              </button>
              <button onClick={() => setAddingSlotTo(null)} style={{ fontSize: "13px", padding: "6px 14px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px" }}>
        <button onClick={() => setShowAddRack(true)} style={{ fontSize: "14px", fontWeight: 500, padding: "8px 16px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: "pointer" }}>
          Add rack
        </button>
      </div>

      {showAddRack && (
        <div style={{ background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: "10px", padding: "20px", marginBottom: "20px" }}>
          <div style={{ fontSize: "15px", fontWeight: 500, marginBottom: "16px" }}>New rack</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px", gap: "12px", marginBottom: "12px" }}>
            <div>
              <label style={lbl}>Name *</label>
              <input autoFocus value={rackForm.name} onChange={e => setRackForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Server Rack A" style={input} />
            </div>
            <div>
              <label style={lbl}>Location *</label>
              <select value={rackForm.locationId} onChange={e => setRackForm(f => ({ ...f, locationId: e.target.value }))} style={input}>
                <option value="">Select location</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Size (U)</label>
              <input type="number" value={rackForm.totalU} onChange={e => setRackForm(f => ({ ...f, totalU: e.target.value }))} style={input} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={lbl}>Notes</label>
              <input value={rackForm.notes} onChange={e => setRackForm(f => ({ ...f, notes: e.target.value }))} style={input} />
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={saveRack} disabled={savingRack} style={{ fontSize: "14px", fontWeight: 500, padding: "8px 16px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>
              {savingRack ? "Saving..." : "Save"}
            </button>
            <button onClick={() => setShowAddRack(false)} style={{ fontSize: "14px", padding: "8px 16px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>Cancel</button>
          </div>
        </div>
      )}

      {racks.length === 0 && !showAddRack ? (
        <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>No racks yet. Add a rack to start building your diagram.</div>
      ) : (
        racks.map(rack => renderRack(rack))
      )}

      {/* Legend */}
      {racks.length > 0 && (
        <div style={{ marginTop: "16px", display: "flex", flexWrap: "wrap", gap: "10px" }}>
          {Object.entries(DEVICE_COLORS).map(([type, color]) => (
            <div key={type} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <div style={{ width: "10px", height: "10px", borderRadius: "2px", background: color }} />
              <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>{type.replace("_", " ")}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
