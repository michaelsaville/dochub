"use client"

import React, { useEffect, useState } from "react"
import type { JSX } from "react"

// =============================================================================
// BuildAssetModal — "Build asset from this file" AI review modal.
//
// Given a stored ClientAttachment, asks the AI classifier (analyze-existing) for
// candidate matches + a proposed new asset, lets a human review/edit, then
// commits via /api/attachments/[id]/build-asset (create a new asset, or link the
// file to an existing one). Nothing is written until the user confirms.
// =============================================================================

export type BuildAssetFile = {
  id: string
  originalName: string
  mimeType: string
  detectedMime?: string | null
}

// 13 AssetCategory values (mirrors the Prisma enum used by the build endpoint).
const ASSET_CATEGORIES = [
  "NETWORK_GEAR",
  "WIRELESS",
  "SERVER",
  "NAS",
  "COMPUTER",
  "LAPTOP",
  "TABLET",
  "PRINTER",
  "PHONE_SYSTEM",
  "PHONE_ENDPOINT",
  "WEBSITE",
  "VPN",
  "OTHER",
] as const

// Categories where device-detail fields are worth showing up-front.
const DETAIL_HEAVY_CATEGORIES = new Set<string>([
  "NETWORK_GEAR",
  "WIRELESS",
  "SERVER",
  "NAS",
  "PRINTER",
  "PHONE_SYSTEM",
])

// --- analyze-existing response shapes ---
type Candidate = {
  assetId: string | null
  confidence: number
  reasoning: string
  suggestedTitle: string
  suggestedCategory: string
  summary: string
}

type ProposedNewAsset = {
  category: string
  typeName: string
  suggestedName: string
  make: string
  model: string
  serial: string
  ipAddress: string
  macAddress: string
  room: string
  hostname: string
  assetTag: string
  managementUrl: string
  firmwareVersion: string
  portCount: number | null
  os: string
  ram: string
  cpu: string
  storageCapacity: string
  notes: string
  reasoning: string
}

type ExtractedData = {
  serials: string[]
  ipAddresses: string[]
  macAddresses: string[]
  hostnames: string[]
  notableStrings: string[]
}

type AnalyzeResult = {
  clientId: string
  candidates: Candidate[]
  proposedNewAsset: ProposedNewAsset | null
  extractedData: ExtractedData | null
}

type FormDraft = {
  name: string
  category: string
  make: string
  model: string
  serial: string
  ipAddress: string
  macAddress: string
  room: string
  managementUrl: string
  assetTag: string
  firmwareVersion: string
  portCount: string
  os: string
  ram: string
  cpu: string
  storageCapacity: string
  notes: string
}

const EMPTY_DRAFT: FormDraft = {
  name: "",
  category: "OTHER",
  make: "",
  model: "",
  serial: "",
  ipAddress: "",
  macAddress: "",
  room: "",
  managementUrl: "",
  assetTag: "",
  firmwareVersion: "",
  portCount: "",
  os: "",
  ram: "",
  cpu: "",
  storageCapacity: "",
  notes: "",
}

function draftFromProposal(p: ProposedNewAsset | null): FormDraft {
  if (!p) return { ...EMPTY_DRAFT }
  return {
    name: p.suggestedName ?? "",
    category: p.category && (ASSET_CATEGORIES as readonly string[]).includes(p.category) ? p.category : "OTHER",
    make: p.make ?? "",
    model: p.model ?? "",
    serial: p.serial ?? "",
    ipAddress: p.ipAddress ?? "",
    macAddress: p.macAddress ?? "",
    room: p.room ?? "",
    managementUrl: p.managementUrl ?? "",
    assetTag: p.assetTag ?? "",
    firmwareVersion: p.firmwareVersion ?? "",
    portCount: p.portCount != null ? String(p.portCount) : "",
    os: p.os ?? "",
    ram: p.ram ?? "",
    cpu: p.cpu ?? "",
    storageCapacity: p.storageCapacity ?? "",
    notes: p.notes ?? "",
  }
}

// Auto-expand device details if the category is detail-heavy or any detail came back populated.
function shouldExpandDetails(d: FormDraft): boolean {
  if (DETAIL_HEAVY_CATEGORIES.has(d.category)) return true
  return Boolean(
    d.managementUrl ||
      d.assetTag ||
      d.firmwareVersion ||
      d.portCount ||
      d.os ||
      d.ram ||
      d.cpu ||
      d.storageCapacity ||
      d.notes,
  )
}

// --- shared styles (matching the DocHub house style) ---
const inp: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  fontSize: 14,
  border: "0.5px solid var(--color-border-secondary)",
  borderRadius: 8,
  background: "var(--color-background-primary)",
  color: "var(--color-text-primary)",
  boxSizing: "border-box",
}

const label: React.CSSProperties = {
  fontSize: 11,
  color: "var(--color-text-secondary)",
  display: "block",
  marginBottom: 2,
}

const btn: React.CSSProperties = {
  padding: "8px 14px",
  fontSize: 13,
  borderRadius: 8,
  border: "0.5px solid var(--color-border-secondary)",
  background: "var(--color-background-primary)",
  color: "var(--color-text-primary)",
  cursor: "pointer",
}

const btnPrimary: React.CSSProperties = {
  ...btn,
  background: "var(--color-accent, #2563eb)",
  color: "white",
  border: "0.5px solid var(--color-accent, #2563eb)",
}

function confidenceColor(c: number): string {
  if (c >= 0.8) return "#16a34a"
  if (c >= 0.5) return "#d97706"
  return "#6b7280"
}

// A labelled text/number input bound to a FormDraft key.
function Field({
  k,
  text,
  draft,
  setDraft,
  type = "text",
}: {
  k: keyof FormDraft
  text: string
  draft: FormDraft
  setDraft: React.Dispatch<React.SetStateAction<FormDraft>>
  type?: "text" | "number"
}): JSX.Element {
  return (
    <div>
      <label style={label}>{text}</label>
      <input
        style={inp}
        type={type}
        value={draft[k]}
        onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
      />
    </div>
  )
}

export default function BuildAssetModal({
  file,
  clientId: _clientId,
  onClose,
  onBuilt,
}: {
  file: BuildAssetFile | null
  clientId: string
  onClose: () => void
  onBuilt: (result: { asset: { id: string; name: string } }) => void
}): JSX.Element | null {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [aiDisabled, setAiDisabled] = useState(false)
  const [result, setResult] = useState<AnalyzeResult | null>(null)

  // Review state.
  const [mode, setMode] = useState<"create" | "link">("create")
  const [linkAssetId, setLinkAssetId] = useState<string | null>(null)
  const [draft, setDraft] = useState<FormDraft>({ ...EMPTY_DRAFT })
  const [detailsOpen, setDetailsOpen] = useState(false)

  const [committing, setCommitting] = useState(false)
  const [commitError, setCommitError] = useState<string | null>(null)

  // Close on Escape.
  useEffect(() => {
    if (!file) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [file, onClose])

  // Analyze when a file is presented (guard against stale responses on file change).
  useEffect(() => {
    if (!file) return
    let cancelled = false

    setLoading(true)
    setLoadError(null)
    setAiDisabled(false)
    setResult(null)
    setMode("create")
    setLinkAssetId(null)
    setDraft({ ...EMPTY_DRAFT })
    setDetailsOpen(false)
    setCommitError(null)

    ;(async () => {
      try {
        const res = await fetch("/api/intake/analyze-existing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ attachmentId: file.id }),
        })

        if (res.status === 503) {
          if (cancelled) return
          setAiDisabled(true)
          setDraft({ ...EMPTY_DRAFT })
          setDetailsOpen(false)
          setLoading(false)
          return
        }

        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          if (cancelled) return
          setLoadError(json?.error || `Analysis failed (HTTP ${res.status})`)
          setLoading(false)
          return
        }

        if (cancelled) return
        const data: AnalyzeResult = {
          clientId: json.clientId,
          candidates: Array.isArray(json.candidates) ? json.candidates : [],
          proposedNewAsset: json.proposedNewAsset ?? null,
          extractedData: json.extractedData ?? null,
        }
        setResult(data)

        // Default into CREATE mode, pre-filled from the proposal (if any).
        const d = draftFromProposal(data.proposedNewAsset)
        setDraft(d)
        setDetailsOpen(shouldExpandDetails(d))
        setMode("create")
        setLinkAssetId(null)
        setLoading(false)
      } catch (err) {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : "Analysis failed")
        setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [file?.id])

  if (!file) return null

  const realCandidates = (result?.candidates ?? []).filter((c) => c.assetId)
  const proposed = result?.proposedNewAsset ?? null
  const extracted = result?.extractedData ?? null
  const hasExtracted =
    extracted &&
    (extracted.serials.length ||
      extracted.ipAddresses.length ||
      extracted.macAddresses.length ||
      extracted.hostnames.length)
  const emptyResult = !aiDisabled && result && realCandidates.length === 0 && !proposed

  function pickCandidate(c: Candidate) {
    if (!c.assetId) return
    setMode("link")
    setLinkAssetId(c.assetId)
    setCommitError(null)
  }

  function pickCreate() {
    setMode("create")
    setLinkAssetId(null)
    setCommitError(null)
  }

  function setCategory(value: string) {
    setDraft((d) => {
      const next = { ...d, category: value }
      if (DETAIL_HEAVY_CATEGORIES.has(value)) setDetailsOpen(true)
      return next
    })
  }

  async function commit() {
    if (!file) return
    setCommitting(true)
    setCommitError(null)
    try {
      let body: Record<string, unknown>
      if (mode === "link") {
        body = { assetId: linkAssetId }
      } else {
        const s = (v: string) => (v.trim() ? v.trim() : null)
        const portCount = draft.portCount.trim() ? Number(draft.portCount) : null
        body = {
          fields: {
            name: draft.name.trim(),
            category: draft.category,
            make: s(draft.make),
            model: s(draft.model),
            serial: s(draft.serial),
            ipAddress: s(draft.ipAddress),
            macAddress: s(draft.macAddress),
            room: s(draft.room),
            managementUrl: s(draft.managementUrl),
            assetTag: s(draft.assetTag),
            firmwareVersion: s(draft.firmwareVersion),
            portCount: typeof portCount === "number" && Number.isFinite(portCount) ? portCount : null,
            os: s(draft.os),
            ram: s(draft.ram),
            cpu: s(draft.cpu),
            storageCapacity: s(draft.storageCapacity),
            notes: s(draft.notes),
          },
        }
      }

      const res = await fetch(`/api/attachments/${file.id}/build-asset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setCommitError(json?.error || `Failed (HTTP ${res.status})`)
        return
      }
      onBuilt({ asset: json.asset })
      onClose()
    } catch (err) {
      setCommitError(err instanceof Error ? err.message : "Failed to build asset")
    } finally {
      setCommitting(false)
    }
  }

  const commitDisabled = committing || (mode === "create" && !draft.name.trim()) || (mode === "link" && !linkAssetId)

  // --- chrome ---
  const backdrop: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 1000,
    background: "rgba(0,0,0,0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  }
  const panel: React.CSSProperties = {
    position: "relative",
    width: "min(640px, 94vw)",
    maxHeight: "88vh",
    display: "flex",
    flexDirection: "column",
    background: "var(--color-background-primary)",
    border: "0.5px solid var(--color-border-secondary)",
    borderRadius: 12,
    overflow: "hidden",
    boxShadow: "0 12px 48px rgba(0,0,0,0.45)",
  }

  return (
    <div style={backdrop} onClick={onClose} role="dialog" aria-modal="true">
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 16px",
            flexShrink: 0,
            borderBottom: "0.5px solid var(--color-border-tertiary)",
            background: "var(--color-background-secondary)",
          }}
        >
          <span style={{ fontSize: 18, flexShrink: 0 }}>🤖</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)" }}>Build asset from file</div>
            <div
              style={{
                fontSize: 12,
                color: "var(--color-text-muted)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {file.originalName}
            </div>
          </div>
          <button
            onClick={onClose}
            title="Close (Esc)"
            style={{ ...btn, padding: "4px 11px", fontSize: 18, lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 16 }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-secondary)", fontSize: 14 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
              Analyzing {file.originalName}…
            </div>
          ) : loadError ? (
            <div
              style={{
                fontSize: 13,
                color: "var(--color-text-danger)",
                padding: 12,
                borderRadius: 8,
                border: "0.5px solid var(--color-border-secondary)",
                background: "var(--color-background-secondary)",
              }}
            >
              Couldn&apos;t analyze this file: {loadError}
            </div>
          ) : (
            <>
              {aiDisabled && (
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--color-text-secondary)",
                    padding: 10,
                    borderRadius: 8,
                    background: "var(--color-background-secondary)",
                    border: "0.5px solid var(--color-border-secondary)",
                    marginBottom: 12,
                  }}
                >
                  ⚠️ AI analysis is off in this workspace — fill the fields manually.
                </div>
              )}

              {emptyResult && (
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--color-text-secondary)",
                    padding: 10,
                    borderRadius: 8,
                    background: "var(--color-background-secondary)",
                    border: "0.5px solid var(--color-border-secondary)",
                    marginBottom: 12,
                  }}
                >
                  No device recognized — fill the fields manually.
                </div>
              )}

              {/* Existing-asset candidates */}
              {realCandidates.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 6 }}>
                    Looks like an existing asset:
                  </div>
                  {realCandidates.map((c, idx) => {
                    const selected = mode === "link" && linkAssetId === c.assetId
                    return (
                      <div
                        key={c.assetId ?? idx}
                        onClick={() => pickCandidate(c)}
                        style={{
                          padding: 10,
                          borderRadius: 8,
                          border: selected
                            ? "2px solid var(--color-accent, #2563eb)"
                            : "0.5px solid var(--color-border-secondary)",
                          marginBottom: 6,
                          cursor: "pointer",
                          background: "var(--color-background-secondary)",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13 }}>
                          <strong style={{ color: "var(--color-text-primary)" }}>
                            {c.suggestedTitle || "Existing asset"}
                          </strong>
                          <span style={{ color: confidenceColor(c.confidence), fontSize: 12, fontWeight: 500, whiteSpace: "nowrap" }}>
                            {(c.confidence * 100).toFixed(0)}% match
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4 }}>
                          {c.reasoning}
                        </div>
                        <div style={{ fontSize: 12, marginTop: 6, color: selected ? "var(--color-accent, #2563eb)" : "var(--color-text-muted)" }}>
                          {selected ? "✓ Linking to this asset" : "Link to this asset"}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Create-new option toggle (only meaningful when there are candidates to switch away from) */}
              {realCandidates.length > 0 && (
                <div
                  onClick={pickCreate}
                  style={{
                    padding: 10,
                    borderRadius: 8,
                    border: mode === "create" ? "2px solid #16a34a" : "1px dashed #16a34a",
                    marginBottom: 12,
                    cursor: "pointer",
                    background: "var(--color-background-secondary)",
                  }}
                >
                  <strong style={{ color: "#16a34a", fontSize: 13 }}>➕ Create a new asset instead</strong>
                  {proposed?.reasoning && (
                    <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4 }}>
                      {proposed.reasoning}
                    </div>
                  )}
                </div>
              )}

              {/* Spotted-in-file chips */}
              {hasExtracted && (
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--color-text-secondary)",
                    padding: 8,
                    background: "var(--color-background-secondary)",
                    borderRadius: 6,
                    marginBottom: 12,
                  }}
                >
                  <strong>Spotted in file:</strong>{" "}
                  {[
                    extracted!.serials.length && `serials: ${extracted!.serials.slice(0, 4).join(", ")}`,
                    extracted!.ipAddresses.length && `IPs: ${extracted!.ipAddresses.slice(0, 4).join(", ")}`,
                    extracted!.macAddresses.length && `MACs: ${extracted!.macAddresses.slice(0, 4).join(", ")}`,
                    extracted!.hostnames.length && `hostnames: ${extracted!.hostnames.slice(0, 4).join(", ")}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              )}

              {/* CREATE form */}
              {mode === "create" && (
                <div>
                  <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr", marginBottom: 8 }}>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label style={label}>Name *</label>
                      <input
                        style={inp}
                        value={draft.name}
                        onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                        placeholder="Asset name"
                      />
                    </div>
                    <div>
                      <label style={label}>Category</label>
                      <select style={inp} value={draft.category} onChange={(e) => setCategory(e.target.value)}>
                        {ASSET_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Field k="make" text="Make" draft={draft} setDraft={setDraft} />
                    <Field k="model" text="Model" draft={draft} setDraft={setDraft} />
                    <Field k="serial" text="Serial" draft={draft} setDraft={setDraft} />
                    <Field k="ipAddress" text="IP address" draft={draft} setDraft={setDraft} />
                    <Field k="macAddress" text="MAC address" draft={draft} setDraft={setDraft} />
                    <Field k="room" text="Room" draft={draft} setDraft={setDraft} />
                  </div>

                  {/* Collapsible device details */}
                  <div
                    onClick={() => setDetailsOpen((v) => !v)}
                    style={{
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: 500,
                      color: "var(--color-text-secondary)",
                      padding: "8px 0",
                      userSelect: "none",
                    }}
                  >
                    {detailsOpen ? "▾" : "▸"} ⚙️ Device details
                  </div>
                  {detailsOpen && (
                    <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr", marginBottom: 8 }}>
                      <div style={{ gridColumn: "1 / -1" }}>
                        <Field k="managementUrl" text="Management URL" draft={draft} setDraft={setDraft} />
                      </div>
                      <Field k="assetTag" text="Asset tag" draft={draft} setDraft={setDraft} />
                      <Field k="firmwareVersion" text="Firmware version" draft={draft} setDraft={setDraft} />
                      <Field k="portCount" text="Port count" draft={draft} setDraft={setDraft} type="number" />
                      <Field k="os" text="OS" draft={draft} setDraft={setDraft} />
                      <Field k="ram" text="RAM" draft={draft} setDraft={setDraft} />
                      <Field k="cpu" text="CPU" draft={draft} setDraft={setDraft} />
                      <Field k="storageCapacity" text="Storage" draft={draft} setDraft={setDraft} />
                      <div style={{ gridColumn: "1 / -1" }}>
                        <label style={label}>Notes</label>
                        <textarea
                          style={{ ...inp, minHeight: 60, fontFamily: "inherit" }}
                          value={draft.notes}
                          onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* LINK summary */}
              {mode === "link" && (
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--color-text-secondary)",
                    padding: 10,
                    borderRadius: 8,
                    background: "var(--color-background-secondary)",
                    border: "0.5px solid var(--color-border-secondary)",
                  }}
                >
                  This file will be filed under the selected existing asset. No new asset is created.
                </div>
              )}

              {commitError && (
                <div style={{ fontSize: 13, color: "var(--color-text-danger)", marginTop: 12 }}>{commitError}</div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!loading && !loadError && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 16px",
              flexShrink: 0,
              borderTop: "0.5px solid var(--color-border-tertiary)",
              background: "var(--color-background-secondary)",
            }}
          >
            <div style={{ flex: 1, fontSize: 11, color: "var(--color-text-muted)" }}>
              Review before saving — nothing is created until you confirm.
            </div>
            <button style={btn} onClick={onClose} disabled={committing}>
              Cancel
            </button>
            <button style={btnPrimary} onClick={commit} disabled={commitDisabled}>
              {committing ? "Saving…" : mode === "link" ? "Link file" : "Create asset"}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
