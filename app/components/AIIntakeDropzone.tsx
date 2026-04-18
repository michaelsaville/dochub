"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

type Candidate = {
  assetId: string | null
  confidence: number
  reasoning: string
  suggestedTitle: string
  suggestedCategory: string
  summary: string
}

type ExtractedData = {
  serials: string[]
  ipAddresses: string[]
  macAddresses: string[]
  hostnames: string[]
  notableStrings: string[]
}

type ProposedNewAsset = {
  category: string
  typeName: string
  suggestedName: string
  make: string | null
  model: string | null
  serial: string | null
  ipAddress: string | null
  macAddress: string | null
  room: string | null
  reasoning: string
}

type CameraActionSetPhoto = { type: "setPhoto"; cameraId: string; reasoning: string }
type CameraActionUpdate = {
  type: "updateCamera"
  cameraId: string
  fields: Partial<Record<"name" | "location" | "coverageNotes" | "resolution" | "make" | "model" | "ipAddress" | "macAddress", string | null>>
  reasoning: string
}
type CameraActionCreate = {
  type: "createCamera"
  systemId: string
  fields: {
    name: string
    cameraType: string
    location: string | null
    coverageNotes: string | null
    resolution: string | null
    make: string | null
    model: string | null
    ipAddress: string | null
    macAddress: string | null
  }
  reasoning: string
}
type CameraAction = CameraActionSetPhoto | CameraActionUpdate | CameraActionCreate

type BulkProposalCreateAssets = {
  kind: "createAssets"
  rationale: string
  items: Array<{
    category: string
    name: string
    make: string | null
    model: string | null
    serial: string | null
    ipAddress: string | null
    macAddress: string | null
    room: string | null
  }>
}
type BulkProposalUpdateAssets = {
  kind: "updateAssets"
  rationale: string
  items: Array<{ assetId: string; fields: Record<string, string | null> }>
}
type BulkProposalCreateCameras = {
  kind: "createCameras"
  rationale: string
  systemId: string
  items: Array<{
    name: string
    cameraType: string
    location: string | null
    coverageNotes: string | null
    resolution: string | null
    make: string | null
    model: string | null
    ipAddress: string | null
    macAddress: string | null
  }>
}
type BulkProposalCreatePhoneExtensions = {
  kind: "createPhoneExtensions"
  rationale: string
  systemId: string
  items: Array<{
    extension: string
    displayName: string
    extensionType: string
    did: string | null
    voicemailEnabled: boolean
  }>
}
type BulkProposalCreateSwitchPorts = {
  kind: "createSwitchPorts"
  rationale: string
  assetId: string
  items: Array<{
    portNumber: number
    label: string | null
    isUplink: boolean
    isPoe: boolean
    vlanNumber: number | null
    notes: string | null
  }>
}
type BulkProposal =
  | BulkProposalCreateAssets
  | BulkProposalUpdateAssets
  | BulkProposalCreateCameras
  | BulkProposalCreatePhoneExtensions
  | BulkProposalCreateSwitchPorts

type Suggestion = {
  id: string
  clientId: string
  status: "PENDING" | "COMMITTED" | "REJECTED" | "FAILED"
  originalName: string
  mimeType: string
  size: number
  candidatesJson: Candidate[] | null
  proposedNewAssetJson: ProposedNewAsset | null
  cameraActionJson: CameraAction | null
  bulkProposalJson: BulkProposal | null
  extractedDataJson: ExtractedData | null
  aiError: string | null
  createdAt: string
  client?: { id: string; name: string } | null
}

type AssetLite = {
  id: string
  name: string
  friendlyName?: string | null
  category: string
  assetType?: { name: string } | null
}

type ClientLite = { id: string; name: string }

type Props = {
  /** Pre-select and lock a client (legacy usage from client detail page). If omitted, the composer shows a client picker. */
  clientId?: string
  onCommitted?: () => void
}

const card: React.CSSProperties = {
  border: "0.5px solid var(--color-border-secondary)",
  borderRadius: 12,
  padding: 14,
  background: "var(--color-background-primary)",
  marginTop: 12,
}

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

const btn: React.CSSProperties = {
  padding: "6px 12px",
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

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function confidenceColor(c: number): string {
  if (c >= 0.8) return "#16a34a"
  if (c >= 0.5) return "#d97706"
  return "#6b7280"
}

type UploadItem = {
  tempId: string
  filename: string
  size: number
  startedAt: number
  phase: "uploading" | "done" | "error"
  errorMessage?: string
}

export default function AIIntakeDropzone({ clientId: fixedClientId, onCommitted }: Props) {
  const [clients, setClients] = useState<ClientLite[]>([])
  const [selectedClientId, setSelectedClientId] = useState<string>(fixedClientId ?? "")
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [committed, setCommitted] = useState<Suggestion[]>([])
  const [assets, setAssets] = useState<AssetLite[]>([])

  const [text, setText] = useState("")
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [uploads, setUploads] = useState<UploadItem[]>([])
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const effectiveClientId = fixedClientId ?? selectedClientId

  // Load client list when no fixed client.
  useEffect(() => {
    if (fixedClientId) return
    fetch("/api/clients")
      .then((r) => (r.ok ? r.json() : []))
      .then((d: Array<{ id: string; name: string }>) =>
        setClients(d.map((c) => ({ id: c.id, name: c.name }))),
      )
      .catch(() => {})
  }, [fixedClientId])

  const loadSuggestions = useCallback(async () => {
    if (!effectiveClientId) {
      setSuggestions([])
      setCommitted([])
      return
    }
    const [pResp, fResp, cResp] = await Promise.all([
      fetch(`/api/intake?clientId=${effectiveClientId}&status=PENDING`),
      fetch(`/api/intake?clientId=${effectiveClientId}&status=FAILED`),
      fetch(`/api/intake?clientId=${effectiveClientId}&status=COMMITTED`),
    ])
    const pending: Suggestion[] = pResp.ok ? await pResp.json() : []
    const failed: Suggestion[] = fResp.ok ? await fResp.json() : []
    const commit: Suggestion[] = cResp.ok ? await cResp.json() : []
    setSuggestions([...pending, ...failed])
    setCommitted(commit.slice(0, 10))
  }, [effectiveClientId])

  const loadAssets = useCallback(async () => {
    if (!effectiveClientId) {
      setAssets([])
      return
    }
    const resp = await fetch(`/api/clients/${effectiveClientId}/assets`)
    if (!resp.ok) return
    const data = await resp.json()
    setAssets(
      (data as Array<{
        id: string
        name: string
        friendlyName?: string | null
        category: string
        assetType?: { name: string } | null
      }>).map((a) => ({
        id: a.id,
        name: a.name,
        friendlyName: a.friendlyName,
        category: a.category,
        assetType: a.assetType,
      })),
    )
  }, [effectiveClientId])

  useEffect(() => {
    loadSuggestions()
    loadAssets()
  }, [loadSuggestions, loadAssets])

  const canSend = useMemo(
    () => !!effectiveClientId && !sending && (text.trim().length > 0 || pendingFiles.length > 0),
    [effectiveClientId, sending, text, pendingFiles],
  )

  const send = useCallback(async () => {
    if (!canSend || !effectiveClientId) return
    setSending(true)
    const trimmedText = text.trim()
    const filesToSend = pendingFiles
    // Clear composer immediately so user knows their action was accepted.
    setText("")
    setPendingFiles([])
    try {
      if (filesToSend.length === 0) {
        const tempId = `up-${Date.now()}-note`
        setUploads((prev) => [
          ...prev,
          { tempId, filename: "(text note)", size: trimmedText.length, startedAt: Date.now(), phase: "uploading" },
        ])
        const fd = new FormData()
        fd.append("clientId", effectiveClientId)
        fd.append("context", trimmedText)
        try {
          const resp = await fetch("/api/intake/analyze", { method: "POST", body: fd })
          if (!resp.ok) {
            const err = await resp.json().catch(() => ({}))
            setUploads((prev) =>
              prev.map((u) => (u.tempId === tempId ? { ...u, phase: "error", errorMessage: err.error ?? resp.statusText } : u)),
            )
          } else {
            setUploads((prev) => prev.filter((u) => u.tempId !== tempId))
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          setUploads((prev) =>
            prev.map((u) => (u.tempId === tempId ? { ...u, phase: "error", errorMessage: msg } : u)),
          )
        }
      } else {
        // Kick off one request per file in parallel and track each independently.
        await Promise.all(
          filesToSend.map(async (f) => {
            const tempId = `up-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
            setUploads((prev) => [
              ...prev,
              { tempId, filename: f.name, size: f.size, startedAt: Date.now(), phase: "uploading" },
            ])
            const fd = new FormData()
            fd.append("clientId", effectiveClientId)
            fd.append("file", f)
            if (trimmedText) fd.append("context", trimmedText)
            try {
              const resp = await fetch("/api/intake/analyze", { method: "POST", body: fd })
              if (!resp.ok) {
                const err = await resp.json().catch(() => ({}))
                setUploads((prev) =>
                  prev.map((u) => (u.tempId === tempId ? { ...u, phase: "error", errorMessage: err.error ?? resp.statusText } : u)),
                )
              } else {
                setUploads((prev) => prev.filter((u) => u.tempId !== tempId))
              }
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err)
              setUploads((prev) =>
                prev.map((u) => (u.tempId === tempId ? { ...u, phase: "error", errorMessage: msg } : u)),
              )
            }
          }),
        )
      }
      await loadSuggestions()
    } finally {
      setSending(false)
    }
  }, [canSend, effectiveClientId, text, pendingFiles, loadSuggestions])

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragActive(false)
    if (e.dataTransfer.files?.length) {
      setPendingFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files)])
    }
  }, [])

  return (
    <div>
      {!fixedClientId && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>
            Client
          </label>
          <select
            style={inp}
            value={selectedClientId}
            onChange={(e) => setSelectedClientId(e.target.value)}
          >
            <option value="">— pick a client —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Hidden file input — kept at the top level so it's not subject to any
          nested event quirks inside the composer. */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ position: "absolute", width: 0, height: 0, opacity: 0, pointerEvents: "none" }}
        onChange={(e) => {
          const files = e.target.files
          if (files && files.length > 0) {
            const picked = Array.from(files)
            setPendingFiles((prev) => [...prev, ...picked])
          }
          e.target.value = ""
        }}
      />

      {/* Composer */}
      <div
        style={{
          border: dragActive ? "2px solid var(--color-accent, #2563eb)" : "0.5px solid var(--color-border-secondary)",
          borderRadius: 12,
          padding: 12,
          background: "var(--color-background-secondary)",
          opacity: effectiveClientId ? 1 : 0.5,
          pointerEvents: effectiveClientId ? "auto" : "none",
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setDragActive(true)
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
      >
        <textarea
          placeholder={
            effectiveClientId
              ? "Describe what you're documenting, paste config snippets, or use the 📎 button / drop files to attach…"
              : "Pick a client to start."
          }
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send()
          }}
          style={{
            ...inp,
            minHeight: 90,
            border: "none",
            background: "transparent",
            padding: 4,
            fontFamily: "inherit",
            resize: "vertical",
          }}
        />
        {pendingFiles.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {pendingFiles.map((f, idx) => (
              <span
                key={`${f.name}-${idx}`}
                style={{
                  fontSize: 12,
                  padding: "3px 8px",
                  borderRadius: 6,
                  background: "var(--color-background-primary)",
                  border: "0.5px solid var(--color-border-secondary)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                📎 {f.name} <span style={{ color: "var(--color-text-secondary)" }}>{formatBytes(f.size)}</span>
                <button
                  type="button"
                  onClick={() => setPendingFiles((prev) => prev.filter((_, i) => i !== idx))}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-secondary)", padding: 0 }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 10,
            borderTop: "0.5px solid var(--color-border-secondary)",
            paddingTop: 8,
          }}
        >
          <button
            type="button"
            style={btn}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              fileInputRef.current?.click()
            }}
            disabled={!effectiveClientId}
          >
            📎 Attach files
          </button>
          <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
            ⌘/Ctrl+Enter to send · drop files anywhere in this box
          </div>
          <button type="button" style={btnPrimary} onClick={send} disabled={!canSend}>
            {sending ? "Sending..." : "Send to AI"}
          </button>
        </div>
      </div>

      {/* Upload activity — in-flight first */}
      {uploads.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <SectionHeader label="Processing" count={uploads.filter((u) => u.phase === "uploading").length} />
          {uploads.map((u) => (
            <UploadRow key={u.tempId} upload={u} onDismiss={() => setUploads((prev) => prev.filter((x) => x.tempId !== u.tempId))} />
          ))}
        </div>
      )}

      {suggestions.length > 0 ? (
        <div style={{ marginTop: 16 }}>
          <SectionHeader label="Needs review" count={suggestions.filter((s) => s.status === "PENDING").length} />
          {suggestions.map((s) => (
            <SuggestionCard
              key={s.id}
              suggestion={s}
              assets={assets}
              onDone={() => {
                loadSuggestions()
                onCommitted?.()
              }}
            />
          ))}
        </div>
      ) : effectiveClientId && uploads.length === 0 ? (
        <div style={{ marginTop: 16, color: "var(--color-text-secondary)", fontSize: 13 }}>
          No pending suggestions for this client.
        </div>
      ) : null}

      {committed.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <SectionHeader label="Recently committed" count={committed.length} />
          {committed.map((c) => (
            <CommittedRow key={c.id} suggestion={c} />
          ))}
        </div>
      )}
    </div>
  )
}

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div
      style={{
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: "var(--color-text-secondary)",
        fontWeight: 600,
        marginBottom: 6,
      }}
    >
      {label} {count > 0 ? `· ${count}` : ""}
    </div>
  )
}

function UploadRow({ upload, onDismiss }: { upload: UploadItem; onDismiss: () => void }) {
  const elapsed = Math.max(0, Math.floor((Date.now() - upload.startedAt) / 1000))
  const phaseColor =
    upload.phase === "uploading" ? "#d97706" : upload.phase === "error" ? "#991b1b" : "#16a34a"
  const phaseLabel =
    upload.phase === "uploading" ? `Uploading + analyzing… ${elapsed}s` : upload.phase === "error" ? "Failed" : "Done"
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "8px 12px",
        borderRadius: 8,
        background: "var(--color-background-secondary)",
        border: "0.5px solid var(--color-border-secondary)",
        marginBottom: 6,
        fontSize: 13,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <span style={{ fontSize: 16 }}>{upload.phase === "uploading" ? "⏳" : upload.phase === "error" ? "⚠️" : "✅"}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{upload.filename}</div>
          <div style={{ fontSize: 11, color: phaseColor }}>
            {phaseLabel}
            {upload.errorMessage ? ` — ${upload.errorMessage}` : ""}
          </div>
        </div>
      </div>
      {upload.phase !== "uploading" && (
        <button
          type="button"
          onClick={onDismiss}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-secondary)", padding: 4 }}
        >
          ×
        </button>
      )}
    </div>
  )
}

function CommittedRow({ suggestion }: { suggestion: Suggestion }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "8px 12px",
        borderRadius: 8,
        background: "var(--color-background-secondary)",
        border: "0.5px solid var(--color-border-secondary)",
        marginBottom: 4,
        fontSize: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <span>✅</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{suggestion.originalName}</div>
          <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
            {suggestion.mimeType} · {formatBytes(suggestion.size)}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
        {new Date(suggestion.createdAt).toLocaleString()}
      </div>
    </div>
  )
}

function SuggestionCard({
  suggestion,
  assets,
  onDone,
}: {
  suggestion: Suggestion
  assets: AssetLite[]
  onDone: () => void
}) {
  const candidates = suggestion.candidatesJson ?? []
  const proposedNewAsset = suggestion.proposedNewAssetJson
  const cameraAction = suggestion.cameraActionJson
  const bulkProposal = suggestion.bulkProposalJson
  const defaultChoice = candidates[0]?.assetId ?? ""
  // mode=existing when attaching to an existing asset (or client-wide); mode=new when creating an asset
  const [mode, setMode] = useState<"existing" | "new">(
    proposedNewAsset && candidates.length === 0 ? "new" : "existing",
  )
  const [selectedAssetId, setSelectedAssetId] = useState<string>(defaultChoice ?? "")
  const [title, setTitle] = useState<string>(
    candidates[0]?.suggestedTitle ?? suggestion.originalName,
  )
  const [category, setCategory] = useState<string>(candidates[0]?.suggestedCategory ?? "")
  const [notes, setNotes] = useState<string>(candidates[0]?.summary ?? "")

  // Editable new-asset draft (seeded from AI proposal)
  const [newAssetDraft, setNewAssetDraft] = useState({
    name: proposedNewAsset?.suggestedName ?? "",
    category: proposedNewAsset?.category ?? "OTHER",
    make: proposedNewAsset?.make ?? "",
    model: proposedNewAsset?.model ?? "",
    serial: proposedNewAsset?.serial ?? "",
    ipAddress: proposedNewAsset?.ipAddress ?? "",
    macAddress: proposedNewAsset?.macAddress ?? "",
    room: proposedNewAsset?.room ?? "",
  })

  // Camera action state — start enabled if AI proposed one, user can toggle off
  const [applyCameraAction, setApplyCameraAction] = useState(!!cameraAction)
  const [cameraActionDraft, setCameraActionDraft] = useState<CameraAction | null>(cameraAction)

  // Bulk proposal state — one editable copy + a checked mask
  const [applyBulk, setApplyBulk] = useState(!!bulkProposal)
  const [bulkDraft, setBulkDraft] = useState<BulkProposal | null>(bulkProposal)
  const [bulkChecked, setBulkChecked] = useState<boolean[]>(
    bulkProposal ? bulkProposal.items.map(() => true) : [],
  )

  const [busy, setBusy] = useState(false)

  const commit = async () => {
    setBusy(true)
    try {
      const body: Record<string, unknown> = {
        title,
        category: category || null,
        notes: notes || null,
      }
      if (mode === "new") {
        body.newAsset = {
          name: newAssetDraft.name,
          category: newAssetDraft.category,
          make: newAssetDraft.make || null,
          model: newAssetDraft.model || null,
          serial: newAssetDraft.serial || null,
          ipAddress: newAssetDraft.ipAddress || null,
          macAddress: newAssetDraft.macAddress || null,
          room: newAssetDraft.room || null,
        }
      } else {
        body.assetId = selectedAssetId || null
      }
      if (applyCameraAction && cameraActionDraft) {
        body.cameraAction = cameraActionDraft
      }
      if (applyBulk && bulkDraft) {
        // Filter to only checked rows.
        const selected = bulkDraft.items.filter((_, i) => bulkChecked[i])
        if (selected.length > 0) {
          const bulkOp: Record<string, unknown> = { kind: bulkDraft.kind, rows: selected }
          if ("systemId" in bulkDraft) bulkOp.systemId = bulkDraft.systemId
          if ("assetId" in bulkDraft) bulkOp.assetId = bulkDraft.assetId
          body.bulkOperation = bulkOp
        }
      }
      const resp = await fetch(`/api/intake/${suggestion.id}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        alert(`Commit failed: ${err.error ?? resp.statusText}`)
        return
      }
      const j = await resp.json().catch(() => ({})) as {
        cameraActionResult?: { ok: boolean; error?: string }
        bulkResult?: { kind: string; ok: number; failed: number; errors: Array<{ rowIndex: number; error: string }> }
      }
      if (j.cameraActionResult && !j.cameraActionResult.ok) {
        alert(`Document committed, but camera action failed: ${j.cameraActionResult.error}`)
      }
      if (j.bulkResult && j.bulkResult.failed > 0) {
        const top = j.bulkResult.errors.slice(0, 3).map((e) => `row ${e.rowIndex + 1}: ${e.error}`).join("\n")
        alert(
          `Bulk ${j.bulkResult.kind}: ${j.bulkResult.ok} succeeded, ${j.bulkResult.failed} failed.\n\nFirst errors:\n${top}`,
        )
      }
      onDone()
    } finally {
      setBusy(false)
    }
  }

  const reject = async () => {
    if (!confirm("Reject and delete this upload?")) return
    setBusy(true)
    try {
      const resp = await fetch(`/api/intake/${suggestion.id}`, { method: "DELETE" })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        alert(`Reject failed: ${err.error ?? resp.statusText}`)
        return
      }
      onDone()
    } finally {
      setBusy(false)
    }
  }

  const extracted = suggestion.extractedDataJson
  const hasExtracted =
    extracted &&
    (extracted.serials.length ||
      extracted.ipAddresses.length ||
      extracted.macAddresses.length ||
      extracted.hostnames.length ||
      extracted.notableStrings.length)

  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <div>
          <strong>{suggestion.originalName}</strong>
          <span style={{ color: "var(--color-text-secondary)", marginLeft: 8, fontSize: 12 }}>
            {suggestion.mimeType} · {formatBytes(suggestion.size)}
          </span>
        </div>
        <span
          style={{
            fontSize: 11,
            padding: "2px 8px",
            borderRadius: 10,
            background: suggestion.status === "FAILED" ? "#fee2e2" : "#fef3c7",
            color: suggestion.status === "FAILED" ? "#991b1b" : "#92400e",
          }}
        >
          {suggestion.status}
        </span>
      </div>

      {suggestion.status === "FAILED" ? (
        <div style={{ fontSize: 13, color: "#991b1b" }}>
          AI analysis failed: {suggestion.aiError ?? "unknown error"}. You can still attach it manually below.
        </div>
      ) : null}

      {(candidates.length > 0 || proposedNewAsset) ? (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 4 }}>AI suggestions:</div>
          {candidates.map((c, idx) => {
            const matchedAsset = c.assetId ? assets.find((a) => a.id === c.assetId) : null
            const isSelected = mode === "existing" && (c.assetId ?? "") === selectedAssetId
            return (
              <div
                key={idx}
                onClick={() => {
                  setMode("existing")
                  setSelectedAssetId(c.assetId ?? "")
                  setTitle(c.suggestedTitle)
                  setCategory(c.suggestedCategory)
                  setNotes(c.summary)
                }}
                style={{
                  padding: 10,
                  borderRadius: 8,
                  border: isSelected
                    ? "2px solid var(--color-accent, #2563eb)"
                    : "0.5px solid var(--color-border-secondary)",
                  marginBottom: 6,
                  cursor: "pointer",
                  background: "var(--color-background-secondary)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <strong>
                    {c.assetId
                      ? matchedAsset
                        ? `${matchedAsset.friendlyName ?? matchedAsset.name} (${matchedAsset.assetType?.name ?? matchedAsset.category})`
                        : `Asset ${c.assetId} (not in current list)`
                      : "No specific asset — client-wide document"}
                  </strong>
                  <span style={{ color: confidenceColor(c.confidence), fontSize: 12, fontWeight: 500 }}>
                    {(c.confidence * 100).toFixed(0)}% confidence
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4 }}>{c.reasoning}</div>
              </div>
            )
          })}
          {proposedNewAsset && (
            <div
              onClick={() => setMode("new")}
              style={{
                padding: 10,
                borderRadius: 8,
                border: mode === "new"
                  ? "2px solid #16a34a"
                  : "1px dashed #16a34a",
                marginBottom: 6,
                cursor: "pointer",
                background: "var(--color-background-secondary)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <strong style={{ color: "#16a34a" }}>
                  ➕ Create new asset: {proposedNewAsset.suggestedName} ({proposedNewAsset.typeName})
                </strong>
              </div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4 }}>
                {proposedNewAsset.reasoning}
              </div>
            </div>
          )}
        </div>
      ) : suggestion.status === "PENDING" ? (
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 8 }}>
          AI could not identify a match. Pick an asset manually, or attach as a client-wide document.
        </div>
      ) : null}

      {mode === "new" && (
        <div
          style={{
            padding: 12,
            borderRadius: 8,
            background: "var(--color-background-secondary)",
            border: "0.5px solid var(--color-border-secondary)",
            marginBottom: 10,
          }}
        >
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 8, fontWeight: 500 }}>
            New asset details (editable):
          </div>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
            <div>
              <label style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>Name *</label>
              <input
                style={inp}
                value={newAssetDraft.name}
                onChange={(e) => setNewAssetDraft((d) => ({ ...d, name: e.target.value }))}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>Category</label>
              <select
                style={inp}
                value={newAssetDraft.category}
                onChange={(e) => setNewAssetDraft((d) => ({ ...d, category: e.target.value }))}
              >
                {[
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
                ].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>Make</label>
              <input
                style={inp}
                value={newAssetDraft.make ?? ""}
                onChange={(e) => setNewAssetDraft((d) => ({ ...d, make: e.target.value }))}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>Model</label>
              <input
                style={inp}
                value={newAssetDraft.model ?? ""}
                onChange={(e) => setNewAssetDraft((d) => ({ ...d, model: e.target.value }))}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>Serial</label>
              <input
                style={inp}
                value={newAssetDraft.serial ?? ""}
                onChange={(e) => setNewAssetDraft((d) => ({ ...d, serial: e.target.value }))}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>IP</label>
              <input
                style={inp}
                value={newAssetDraft.ipAddress ?? ""}
                onChange={(e) => setNewAssetDraft((d) => ({ ...d, ipAddress: e.target.value }))}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>MAC</label>
              <input
                style={inp}
                value={newAssetDraft.macAddress ?? ""}
                onChange={(e) => setNewAssetDraft((d) => ({ ...d, macAddress: e.target.value }))}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>Room</label>
              <input
                style={inp}
                value={newAssetDraft.room ?? ""}
                onChange={(e) => setNewAssetDraft((d) => ({ ...d, room: e.target.value }))}
              />
            </div>
          </div>
          <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 6 }}>
            Asset will be created under the client's first active location.
          </div>
        </div>
      )}

      {cameraAction && (
        <div
          style={{
            padding: 10,
            borderRadius: 8,
            background: "var(--color-background-secondary)",
            border: "0.5px solid var(--color-border-secondary)",
            marginBottom: 10,
          }}
        >
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={applyCameraAction}
              onChange={(e) => setApplyCameraAction(e.target.checked)}
            />
            <strong>📹 Also apply camera action:</strong>{" "}
            <span style={{ color: "var(--color-text-secondary)" }}>
              {cameraAction.type === "setPhoto" && `Set thumbnail for camera ${cameraAction.cameraId.slice(0, 8)}`}
              {cameraAction.type === "updateCamera" &&
                `Update fields on camera ${cameraAction.cameraId.slice(0, 8)}: ${Object.entries(
                  cameraAction.fields,
                )
                  .filter(([, v]) => v)
                  .map(([k]) => k)
                  .join(", ")}`}
              {cameraAction.type === "createCamera" && `Create new camera under system ${cameraAction.systemId.slice(0, 8)}`}
            </span>
          </label>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 6, paddingLeft: 24 }}>
            {cameraAction.reasoning}
          </div>
          {applyCameraAction && cameraAction.type === "updateCamera" && (
            <div style={{ fontSize: 12, paddingLeft: 24, marginTop: 6 }}>
              {Object.entries(cameraAction.fields)
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k}>
                    <strong>{k}:</strong> {String(v)}
                  </div>
                ))}
            </div>
          )}
          {applyCameraAction && cameraAction.type === "createCamera" && (
            <div style={{ fontSize: 12, paddingLeft: 24, marginTop: 6 }}>
              {Object.entries(cameraAction.fields).map(([k, v]) =>
                v ? (
                  <div key={k}>
                    <strong>{k}:</strong> {String(v)}
                  </div>
                ) : null,
              )}
            </div>
          )}
        </div>
      )}

      {bulkProposal && bulkDraft && (
        <BulkProposalPanel
          proposal={bulkDraft}
          checked={bulkChecked}
          applying={applyBulk}
          onToggleApply={setApplyBulk}
          onChecked={setBulkChecked}
          onUpdateRow={(rowIdx, patch) => {
            setBulkDraft((prev) => {
              if (!prev) return prev
              const items = prev.items.map((it, i) => (i === rowIdx ? { ...it, ...patch } : it))
              return { ...prev, items } as BulkProposal
            })
          }}
        />
      )}

      {hasExtracted ? (
        <div
          style={{
            fontSize: 12,
            color: "var(--color-text-secondary)",
            padding: 8,
            background: "var(--color-background-secondary)",
            borderRadius: 6,
            marginBottom: 8,
          }}
        >
          <strong>Extracted:</strong>{" "}
          {[
            extracted!.serials.length && `serials: ${extracted!.serials.slice(0, 4).join(", ")}`,
            extracted!.ipAddresses.length && `IPs: ${extracted!.ipAddresses.slice(0, 4).join(", ")}`,
            extracted!.macAddresses.length && `MACs: ${extracted!.macAddresses.slice(0, 4).join(", ")}`,
            extracted!.hostnames.length && `hostnames: ${extracted!.hostnames.slice(0, 4).join(", ")}`,
            extracted!.notableStrings.length && `notable: ${extracted!.notableStrings.slice(0, 3).join("; ")}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr", marginBottom: 8 }}>
        {mode === "existing" ? (
          <div>
            <label style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Attach to asset</label>
            <select style={inp} value={selectedAssetId} onChange={(e) => setSelectedAssetId(e.target.value)}>
              <option value="">— no asset (client-wide) —</option>
              {assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.friendlyName ?? a.name} ({a.assetType?.name ?? a.category})
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Attach to</label>
            <div style={{ ...inp, padding: "8px 12px", color: "#16a34a" }}>
              ➕ New asset: {newAssetDraft.name || "(name required)"}
            </div>
          </div>
        )}
        <div>
          <label style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Category</label>
          <input style={inp} value={category} onChange={(e) => setCategory(e.target.value)} />
        </div>
      </div>

      <div style={{ marginBottom: 8 }}>
        <label style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Document title</label>
        <input style={inp} value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      <div style={{ marginBottom: 8 }}>
        <label style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Attachment notes (AI summary)</label>
        <textarea
          style={{ ...inp, minHeight: 60, fontFamily: "inherit" }}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button style={btn} disabled={busy} onClick={reject}>
          Reject
        </button>
        <button
          style={btnPrimary}
          disabled={busy || !title.trim() || (mode === "new" && !newAssetDraft.name.trim())}
          onClick={commit}
        >
          {busy ? "Committing..." : "Commit"}
        </button>
      </div>
    </div>
  )
}

// ── Bulk Proposal Panel ───────────────────────────────────────────────────────

function BulkProposalPanel({
  proposal,
  checked,
  applying,
  onToggleApply,
  onChecked,
  onUpdateRow,
}: {
  proposal: BulkProposal
  checked: boolean[]
  applying: boolean
  onToggleApply: (v: boolean) => void
  onChecked: (next: boolean[]) => void
  onUpdateRow: (rowIdx: number, patch: Partial<BulkProposal["items"][number]>) => void
}) {
  const selectedCount = checked.filter(Boolean).length
  const kindLabel: Record<BulkProposal["kind"], string> = {
    createAssets: "➕ Bulk create assets",
    updateAssets: "✏️ Bulk update assets",
    createCameras: "📹 Bulk create cameras",
    createPhoneExtensions: "☎️ Bulk create phone extensions",
    createSwitchPorts: "🔌 Bulk create switch ports",
  }

  return (
    <div
      style={{
        padding: 12,
        borderRadius: 8,
        background: "var(--color-background-secondary)",
        border: "0.5px solid var(--color-border-secondary)",
        marginBottom: 10,
      }}
    >
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", marginBottom: 6 }}>
        <input type="checkbox" checked={applying} onChange={(e) => onToggleApply(e.target.checked)} />
        <strong>{kindLabel[proposal.kind]}</strong>
        <span style={{ color: "var(--color-text-secondary)" }}>
          ({selectedCount} of {proposal.items.length} selected)
        </span>
      </label>
      <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 8, paddingLeft: 24 }}>
        {proposal.rationale}
      </div>

      {applying && (
        <div style={{ paddingLeft: 24 }}>
          <div style={{ fontSize: 11, marginBottom: 6 }}>
            <button
              type="button"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--color-accent, #2563eb)",
                cursor: "pointer",
                padding: 0,
                marginRight: 10,
                fontSize: 11,
              }}
              onClick={() => onChecked(proposal.items.map(() => true))}
            >
              all
            </button>
            <button
              type="button"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--color-accent, #2563eb)",
                cursor: "pointer",
                padding: 0,
                fontSize: 11,
              }}
              onClick={() => onChecked(proposal.items.map(() => false))}
            >
              none
            </button>
          </div>
          <div
            style={{
              maxHeight: 300,
              overflowY: "auto",
              border: "0.5px solid var(--color-border-secondary)",
              borderRadius: 6,
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead
                style={{
                  position: "sticky",
                  top: 0,
                  background: "var(--color-background-primary)",
                  borderBottom: "0.5px solid var(--color-border-secondary)",
                }}
              >
                <tr>
                  <th style={{ width: 28, padding: 6 }}></th>
                  <BulkHeader proposal={proposal} />
                </tr>
              </thead>
              <tbody>
                {proposal.items.map((row, i) => (
                  <tr
                    key={i}
                    style={{
                      borderBottom: "0.5px solid var(--color-border-secondary)",
                      background: checked[i] ? "transparent" : "var(--color-background-secondary)",
                      opacity: checked[i] ? 1 : 0.5,
                    }}
                  >
                    <td style={{ padding: 6, textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={checked[i] ?? false}
                        onChange={(e) => {
                          const next = [...checked]
                          next[i] = e.target.checked
                          onChecked(next)
                        }}
                      />
                    </td>
                    <BulkRow
                      proposal={proposal}
                      row={row as never}
                      onPatch={(patch) => onUpdateRow(i, patch as never)}
                    />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function BulkHeader({ proposal }: { proposal: BulkProposal }) {
  const thS: React.CSSProperties = { padding: "6px 8px", textAlign: "left", fontWeight: 600, fontSize: 11, color: "var(--color-text-secondary)" }
  if (proposal.kind === "createAssets") {
    return (
      <>
        <th style={thS}>Name</th>
        <th style={thS}>Category</th>
        <th style={thS}>Make/Model</th>
        <th style={thS}>Serial</th>
        <th style={thS}>IP/MAC</th>
        <th style={thS}>Room</th>
      </>
    )
  }
  if (proposal.kind === "updateAssets") {
    return (
      <>
        <th style={thS}>Asset</th>
        <th style={thS}>Fields to update</th>
      </>
    )
  }
  if (proposal.kind === "createCameras") {
    return (
      <>
        <th style={thS}>Name</th>
        <th style={thS}>Type</th>
        <th style={thS}>Location</th>
        <th style={thS}>Resolution</th>
        <th style={thS}>IP</th>
      </>
    )
  }
  if (proposal.kind === "createPhoneExtensions") {
    return (
      <>
        <th style={thS}>Ext</th>
        <th style={thS}>Display Name</th>
        <th style={thS}>Type</th>
        <th style={thS}>DID</th>
        <th style={thS}>VM</th>
      </>
    )
  }
  // createSwitchPorts
  return (
    <>
      <th style={thS}>Port</th>
      <th style={thS}>Label</th>
      <th style={thS}>VLAN</th>
      <th style={thS}>Uplink</th>
      <th style={thS}>PoE</th>
    </>
  )
}

const tdS: React.CSSProperties = { padding: "4px 8px", verticalAlign: "top" }
const smallInp: React.CSSProperties = {
  width: "100%",
  padding: "3px 6px",
  fontSize: 12,
  border: "0.5px solid var(--color-border-tertiary, rgba(128,128,128,0.3))",
  borderRadius: 4,
  background: "var(--color-background-primary)",
  color: "var(--color-text-primary)",
  boxSizing: "border-box",
}

function BulkRow({
  proposal,
  row,
  onPatch,
}: {
  proposal: BulkProposal
  row: BulkProposal["items"][number]
  onPatch: (patch: Partial<BulkProposal["items"][number]>) => void
}) {
  if (proposal.kind === "createAssets") {
    const r = row as BulkProposalCreateAssets["items"][number]
    return (
      <>
        <td style={tdS}>
          <input style={smallInp} value={r.name} onChange={(e) => onPatch({ name: e.target.value })} />
        </td>
        <td style={tdS}>
          <code style={{ fontSize: 11 }}>{r.category}</code>
        </td>
        <td style={tdS}>
          <span style={{ color: "var(--color-text-secondary)" }}>
            {[r.make, r.model].filter(Boolean).join(" ") || "—"}
          </span>
        </td>
        <td style={tdS}>
          <span style={{ fontFamily: "var(--mono, monospace)", fontSize: 11 }}>{r.serial ?? "—"}</span>
        </td>
        <td style={tdS}>
          <span style={{ fontFamily: "var(--mono, monospace)", fontSize: 11 }}>
            {[r.ipAddress, r.macAddress].filter(Boolean).join(" / ") || "—"}
          </span>
        </td>
        <td style={tdS}>
          <span style={{ color: "var(--color-text-secondary)" }}>{r.room ?? "—"}</span>
        </td>
      </>
    )
  }
  if (proposal.kind === "updateAssets") {
    const r = row as BulkProposalUpdateAssets["items"][number]
    const populated = Object.entries(r.fields).filter(([, v]) => v)
    return (
      <>
        <td style={tdS}>
          <code style={{ fontSize: 11 }}>{r.assetId.slice(0, 10)}</code>
        </td>
        <td style={tdS}>
          {populated.length === 0 ? (
            <span style={{ color: "var(--color-text-secondary)" }}>(no fields)</span>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {populated.map(([k, v]) => (
                <span
                  key={k}
                  style={{
                    padding: "1px 6px",
                    borderRadius: 4,
                    background: "var(--color-background-primary)",
                    fontSize: 11,
                  }}
                >
                  <strong>{k}:</strong> {String(v)}
                </span>
              ))}
            </div>
          )}
        </td>
      </>
    )
  }
  if (proposal.kind === "createCameras") {
    const r = row as BulkProposalCreateCameras["items"][number]
    return (
      <>
        <td style={tdS}>
          <input style={smallInp} value={r.name} onChange={(e) => onPatch({ name: e.target.value })} />
        </td>
        <td style={tdS}>
          <code style={{ fontSize: 11 }}>{r.cameraType}</code>
        </td>
        <td style={tdS}>
          <span style={{ color: "var(--color-text-secondary)" }}>{r.location ?? "—"}</span>
        </td>
        <td style={tdS}>{r.resolution ?? "—"}</td>
        <td style={tdS}>
          <span style={{ fontFamily: "var(--mono, monospace)", fontSize: 11 }}>{r.ipAddress ?? "—"}</span>
        </td>
      </>
    )
  }
  if (proposal.kind === "createPhoneExtensions") {
    const r = row as BulkProposalCreatePhoneExtensions["items"][number]
    return (
      <>
        <td style={tdS}>
          <input
            style={{ ...smallInp, width: 60 }}
            value={r.extension}
            onChange={(e) => onPatch({ extension: e.target.value })}
          />
        </td>
        <td style={tdS}>
          <input
            style={smallInp}
            value={r.displayName}
            onChange={(e) => onPatch({ displayName: e.target.value })}
          />
        </td>
        <td style={tdS}>
          <code style={{ fontSize: 11 }}>{r.extensionType}</code>
        </td>
        <td style={tdS}>
          <span style={{ fontFamily: "var(--mono, monospace)", fontSize: 11 }}>{r.did ?? "—"}</span>
        </td>
        <td style={tdS}>{r.voicemailEnabled ? "✓" : "—"}</td>
      </>
    )
  }
  // createSwitchPorts
  const r = row as BulkProposalCreateSwitchPorts["items"][number]
  return (
    <>
      <td style={tdS}>
        <input
          type="number"
          style={{ ...smallInp, width: 60 }}
          value={r.portNumber}
          onChange={(e) => onPatch({ portNumber: Number(e.target.value) || 1 })}
        />
      </td>
      <td style={tdS}>
        <input
          style={smallInp}
          value={r.label ?? ""}
          onChange={(e) => onPatch({ label: e.target.value || null })}
        />
      </td>
      <td style={tdS}>{r.vlanNumber ?? "—"}</td>
      <td style={tdS}>{r.isUplink ? "✓" : "—"}</td>
      <td style={tdS}>{r.isPoe ? "✓" : "—"}</td>
    </>
  )
}
