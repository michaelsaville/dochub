"use client"

import AppShell from "@/components/AppShell"
import { useState, useEffect, useRef } from "react"

// ─── Types ────────────────────────────────────────────────────────────────────

type EntityType = "clients" | "contacts" | "assets" | "credentials" | "licenses"
type Stage = "type" | "upload" | "columns" | "companies" | "preview" | "done"

type FieldDef = {
  key: string
  label: string
  required?: boolean
  isCompany?: boolean  // the "which client does this row belong to" column
}

type EntityConfig = {
  label: string
  description: string
  needsClientMapping: boolean
  fields: FieldDef[]
}

// ─── Entity configs ────────────────────────────────────────────────────────────

const ENTITY_CONFIGS: Record<EntityType, EntityConfig> = {
  clients: {
    label: "Clients",
    description: "Import client companies from ITFlow",
    needsClientMapping: false,
    fields: [
      { key: "name",    label: "Client Name",  required: true },
      { key: "address", label: "Address" },
      { key: "city",    label: "City" },
      { key: "state",   label: "State" },
      { key: "zip",     label: "ZIP / Postcode" },
      { key: "notes",   label: "Notes" },
    ],
  },
  contacts: {
    label: "Contacts",
    description: "Import client contacts from ITFlow",
    needsClientMapping: true,
    fields: [
      { key: "company", label: "Company (ITFlow)", required: true, isCompany: true },
      { key: "name",    label: "Contact Name",     required: true },
      { key: "role",    label: "Title / Role" },
      { key: "email",   label: "Email" },
      { key: "phone",   label: "Phone" },
      { key: "mobile",  label: "Mobile" },
      { key: "notes",   label: "Notes" },
    ],
  },
  assets: {
    label: "Assets",
    description: "Import hardware/software assets from ITFlow",
    needsClientMapping: true,
    fields: [
      { key: "company",   label: "Company (ITFlow)", required: true, isCompany: true },
      { key: "name",      label: "Asset Name",       required: true },
      { key: "assetType", label: "Type / Category" },
      { key: "make",      label: "Make / Manufacturer" },
      { key: "model",     label: "Model" },
      { key: "serial",    label: "Serial Number" },
      { key: "ipAddress", label: "IP Address" },
      { key: "macAddress",label: "MAC Address" },
      { key: "notes",     label: "Notes" },
    ],
  },
  credentials: {
    label: "Passwords / Credentials",
    description: "Import passwords from ITFlow — will be re-encrypted with DocHub vault",
    needsClientMapping: true,
    fields: [
      { key: "company",  label: "Company (ITFlow)", required: true, isCompany: true },
      { key: "label",    label: "Name / Label",     required: true },
      { key: "username", label: "Username" },
      { key: "password", label: "Password (plaintext from ITFlow)" },
      { key: "url",      label: "URL" },
      { key: "notes",    label: "Notes" },
    ],
  },
  licenses: {
    label: "Licenses",
    description: "Import software licenses from ITFlow",
    needsClientMapping: true,
    fields: [
      { key: "company",     label: "Company (ITFlow)", required: true, isCompany: true },
      { key: "name",        label: "License Name",     required: true },
      { key: "licenseKey",  label: "License Key" },
      { key: "seats",       label: "Seats / Quantity" },
      { key: "renewalDate", label: "Renewal Date" },
      { key: "notes",       label: "Notes" },
    ],
  },
}

// ─── Fuzzy matching ────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase()
    .replace(/\b(llc|inc|ltd|co\.|corp|incorporated|limited|company|solutions|services|technologies|technology|group)\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim()
}

function similarity(a: string, b: string): number {
  const na = normalize(a), nb = normalize(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  if (na.includes(nb) || nb.includes(na)) return 0.85
  // bigram similarity
  const bigrams = (s: string) => new Set(Array.from({ length: s.length - 1 }, (_, i) => s.slice(i, i + 2)))
  const ba = bigrams(na), bb = bigrams(nb)
  const intersection = [...ba].filter(x => bb.has(x)).length
  const denom = ba.size + bb.size
  return denom === 0 ? 0 : (2 * intersection) / denom
}

function topMatches(name: string, clients: { id: string; name: string }[], n = 3) {
  return clients
    .map(c => ({ ...c, score: similarity(name, c.name) }))
    .filter(c => c.score > 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
}

// ─── CSV parser ────────────────────────────────────────────────────────────────

function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (ch === '"') inQuotes = false
      else field += ch
    } else {
      if (ch === '"') inQuotes = true
      else if (ch === ",") { row.push(field); field = "" }
      else if (ch === "\n" || (ch === "\r" && text[i + 1] === "\n")) {
        if (ch === "\r") i++
        row.push(field); field = ""
        if (row.some(f => f.trim())) rows.push(row)
        row = []
      } else field += ch
    }
  }
  if (field || row.length) { row.push(field); if (row.some(f => f.trim())) rows.push(row) }
  return rows
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const inputStyle = {
  width: "100%", padding: "8px 12px", fontSize: "14px",
  border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px",
  background: "var(--color-background-primary)", color: "var(--color-text-primary)",
  boxSizing: "border-box" as const,
}
const selectStyle = { ...inputStyle }
const labelStyle: React.CSSProperties = { fontSize: "13px", color: "var(--color-text-secondary)", display: "block", marginBottom: "4px" }

// ─── Main component ────────────────────────────────────────────────────────────

export default function ImportPage() {
  const [stage, setStage] = useState<Stage>("type")
  const [entityType, setEntityType] = useState<EntityType | null>(null)

  // CSV data
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvRows, setCsvRows] = useState<string[][]>([])   // data rows (no header)

  // Column mapping: docHub field key → csv column index (string)
  const [columnMap, setColumnMap] = useState<Record<string, string>>({})

  // Existing DocHub clients (loaded once)
  const [existingClients, setExistingClients] = useState<{ id: string; name: string }[]>([])

  // Company mapping: ITFlow company name → DocHub client id | "skip"
  const [companyMap, setCompanyMap] = useState<Record<string, string>>({})

  // Row actions for clients import: rowIndex → "create" | "skip" | matchClientId
  const [rowActions, setRowActions] = useState<Record<number, string>>({})

  // Import result
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null)

  const fileRef = useRef<HTMLInputElement>(null)

  const config = entityType ? ENTITY_CONFIGS[entityType] : null

  // Load existing clients once
  useEffect(() => {
    fetch("/api/clients")
      .then(r => r.json())
      .then(data => setExistingClients(Array.isArray(data) ? data.map((c: any) => ({ id: c.id, name: c.name })) : []))
      .catch(() => {})
  }, [])

  // ── Helpers ────────────────────────────────────────────────────────────────

  function getCellValue(row: string[], fieldKey: string): string {
    const colIdx = columnMap[fieldKey]
    if (colIdx === undefined || colIdx === "") return ""
    return row[parseInt(colIdx)] ?? ""
  }

  function getMappedRow(row: string[]): Record<string, string> {
    const result: Record<string, string> = {}
    if (!config) return result
    for (const field of config.fields) {
      result[field.key] = getCellValue(row, field.key)
    }
    return result
  }

  // Auto-guess column mappings based on header names
  function autoMapColumns(headers: string[]) {
    if (!config) return
    const guesses: Record<string, string> = {}
    for (const field of config.fields) {
      const fieldNorm = field.key.toLowerCase().replace(/[^a-z]/g, "")
      const labelNorm = field.label.toLowerCase().replace(/[^a-z]/g, "")
      const idx = headers.findIndex(h => {
        const hn = h.toLowerCase().replace(/[^a-z]/g, "")
        return hn === fieldNorm || hn === labelNorm ||
          hn.includes(fieldNorm) || fieldNorm.includes(hn) ||
          hn.includes(labelNorm) || labelNorm.includes(hn)
      })
      if (idx >= 0) guesses[field.key] = String(idx)
    }
    setColumnMap(guesses)
  }

  // Get unique company names from CSV for the company field
  function getUniqueCompanies(): string[] {
    const companyIdx = columnMap["company"]
    if (companyIdx === undefined) return []
    const seen = new Set<string>()
    const names: string[] = []
    for (const row of csvRows) {
      const name = (row[parseInt(companyIdx)] ?? "").trim()
      if (name && !seen.has(name)) { seen.add(name); names.push(name) }
    }
    return names.sort()
  }

  // ── File upload ────────────────────────────────────────────────────────────

  function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = e => {
      const text = e.target?.result as string
      const allRows = parseCSV(text)
      if (allRows.length < 2) return alert("CSV appears to be empty or has only a header row.")
      const headers = allRows[0]
      const dataRows = allRows.slice(1)
      setCsvHeaders(headers)
      setCsvRows(dataRows)
      autoMapColumns(headers)
      setStage("columns")
    }
    reader.readAsText(file)
  }

  // ── Proceed from column mapping ────────────────────────────────────────────

  function proceedFromColumns() {
    if (!config) return
    // Check required fields are mapped
    for (const field of config.fields.filter(f => f.required)) {
      if (!columnMap[field.key] && columnMap[field.key] !== "0") {
        return alert(`Please map the required field: ${field.label}`)
      }
    }
    if (config.needsClientMapping) {
      // Pre-populate company map with best fuzzy matches
      const companies = getUniqueCompanies()
      const initial: Record<string, string> = {}
      for (const company of companies) {
        const matches = topMatches(company, existingClients)
        initial[company] = matches[0]?.score >= 0.7 ? matches[0].id : ""
      }
      setCompanyMap(initial)
      setStage("companies")
    } else {
      // Clients — set default row actions with fuzzy pre-fill
      const actions: Record<number, string> = {}
      csvRows.forEach((row, i) => {
        const name = getCellValue(row, "name")
        const matches = topMatches(name, existingClients)
        actions[i] = matches[0]?.score >= 0.85 ? matches[0].id : "create"
      })
      setRowActions(actions)
      setStage("preview")
    }
  }

  // ── Preview rows for non-client types ─────────────────────────────────────

  function getPreviewRows() {
    if (!config) return []
    return csvRows.map((row, i) => {
      const data = getMappedRow(row)
      const company = data.company?.trim() ?? ""
      const clientId = companyMap[company] ?? ""
      const clientName = existingClients.find(c => c.id === clientId)?.name ?? ""
      return { index: i, data, company, clientId, clientName, skip: clientId === "skip" || !clientId }
    })
  }

  // ── Execute import ─────────────────────────────────────────────────────────

  async function executeImport() {
    if (!entityType) return
    setImporting(true)
    try {
      let rows: any[]
      if (entityType === "clients") {
        rows = csvRows.map((row, i) => {
          const data = getMappedRow(row)
          const action = rowActions[i] ?? "create"
          if (action === "skip") return { action: "skip", data }
          if (action === "create") return { action: "create", data }
          return { action: "match", matchClientId: action, data }
        })
      } else {
        rows = csvRows.map((row) => {
          const data = getMappedRow(row)
          const company = data.company?.trim() ?? ""
          const clientId = companyMap[company]
          if (!clientId || clientId === "skip") return { action: "skip", clientId: null, data }
          return { action: "create", clientId, data }
        })
      }
      const res = await fetch("/api/import/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: entityType, rows }),
      })
      const result = await res.json()
      setImportResult(result)
      setStage("done")
    } catch (e: any) {
      alert("Import failed: " + e.message)
    } finally {
      setImporting(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <AppShell>
      <div style={{ padding: "32px", maxWidth: "900px" }}>
        <div style={{ marginBottom: "24px" }}>
          <div style={{ fontSize: "20px", fontWeight: 600, color: "var(--color-text-primary)", marginBottom: "4px" }}>Import from ITFlow</div>
          <div style={{ fontSize: "14px", color: "var(--color-text-secondary)" }}>
            Export your data from ITFlow as CSV, then import it here. Each entity type is imported separately.
          </div>
        </div>

        {/* Progress breadcrumb */}
        <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "32px", fontSize: "13px" }}>
          {(["type", "upload", "columns", config?.needsClientMapping ? "companies" : null, "preview", "done"] as (Stage | null)[])
            .filter(Boolean)
            .map((s, i, arr) => (
              <span key={s}>
                <span style={{ color: stage === s ? "var(--color-text-primary)" : "var(--color-text-muted)", fontWeight: stage === s ? 600 : 400 }}>
                  {{ type: "Entity", upload: "Upload", columns: "Columns", companies: "Map Clients", preview: "Preview", done: "Done" }[s!]}
                </span>
                {i < arr.length - 1 && <span style={{ color: "var(--color-text-muted)", marginLeft: "8px" }}>›</span>}
              </span>
            ))}
        </div>

        {/* ── Stage: type ── */}
        {stage === "type" && (
          <div>
            <div style={{ fontSize: "15px", fontWeight: 500, marginBottom: "16px" }}>What are you importing?</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", maxWidth: "600px" }}>
              {(Object.entries(ENTITY_CONFIGS) as [EntityType, EntityConfig][]).map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => { setEntityType(key); setStage("upload"); setCsvHeaders([]); setCsvRows([]); setColumnMap({}); setCompanyMap({}); setRowActions({}); setImportResult(null) }}
                  style={{
                    padding: "16px", borderRadius: "10px", border: "0.5px solid var(--color-border-secondary)",
                    background: "var(--color-background-secondary)", cursor: "pointer", textAlign: "left",
                  }}
                >
                  <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-text-primary)", marginBottom: "4px" }}>{cfg.label}</div>
                  <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{cfg.description}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Stage: upload ── */}
        {stage === "upload" && config && (
          <div>
            <div style={{ fontSize: "15px", fontWeight: 500, marginBottom: "8px" }}>Upload {config.label} CSV</div>
            <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginBottom: "20px" }}>
              In ITFlow: go to the {config.label} list → Export → CSV. Then upload it here.
            </div>
            <div
              style={{ border: "2px dashed var(--color-border-secondary)", borderRadius: "12px", padding: "48px", textAlign: "center", cursor: "pointer", background: "var(--color-background-secondary)" }}
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
            >
              <div style={{ fontSize: "14px", color: "var(--color-text-secondary)", marginBottom: "8px" }}>Drop your CSV here or click to browse</div>
              <div style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>.csv files only</div>
              <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
            </div>
            <button onClick={() => setStage("type")} style={{ marginTop: "16px", fontSize: "13px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>← Back</button>
          </div>
        )}

        {/* ── Stage: columns ── */}
        {stage === "columns" && config && (
          <div>
            <div style={{ fontSize: "15px", fontWeight: 500, marginBottom: "4px" }}>Map columns</div>
            <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginBottom: "20px" }}>
              {csvRows.length} rows detected. Match each DocHub field to the correct column from your CSV.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "24px" }}>
              {config.fields.map(field => (
                <div key={field.key}>
                  <label style={labelStyle}>{field.label}{field.required && <span style={{ color: "var(--color-text-danger)" }}> *</span>}</label>
                  <select value={columnMap[field.key] ?? ""} onChange={e => setColumnMap(m => ({ ...m, [field.key]: e.target.value }))} style={selectStyle}>
                    <option value="">— not mapped —</option>
                    {csvHeaders.map((h, i) => <option key={i} value={String(i)}>{h || `Column ${i + 1}`}</option>)}
                  </select>
                  {/* Preview first value */}
                  {columnMap[field.key] !== undefined && columnMap[field.key] !== "" && csvRows[0] && (
                    <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "3px", fontFamily: "monospace" }}>
                      Preview: "{csvRows[0][parseInt(columnMap[field.key])] ?? ""}"
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={proceedFromColumns} style={{ fontSize: "14px", fontWeight: 500, padding: "8px 20px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}>
                Continue →
              </button>
              <button onClick={() => setStage("upload")} style={{ fontSize: "14px", padding: "8px 16px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>← Back</button>
            </div>
          </div>
        )}

        {/* ── Stage: companies ── */}
        {stage === "companies" && config && (
          <div>
            <div style={{ fontSize: "15px", fontWeight: 500, marginBottom: "4px" }}>Map company names to DocHub clients</div>
            <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginBottom: "20px" }}>
              Each unique company name from your CSV needs to be matched to a DocHub client. We've pre-filled best guesses — review and adjust.
            </div>
            <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "10px", overflow: "hidden", marginBottom: "24px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", padding: "10px 16px", background: "var(--color-background-secondary)", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-secondary)" }}>ITFlow company name</div>
                <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-secondary)" }}>DocHub client</div>
              </div>
              {getUniqueCompanies().map(company => {
                const matches = topMatches(company, existingClients)
                const current = companyMap[company] ?? ""
                return (
                  <div key={company} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", padding: "10px 16px", borderBottom: "0.5px solid var(--color-border-tertiary)", alignItems: "center", background: "var(--color-background-primary)" }}>
                    <div>
                      <div style={{ fontSize: "14px", color: "var(--color-text-primary)" }}>{company}</div>
                      {matches[0] && (
                        <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "2px" }}>
                          Best match: {matches[0].name} ({Math.round(matches[0].score * 100)}%)
                        </div>
                      )}
                    </div>
                    <select
                      value={current}
                      onChange={e => setCompanyMap(m => ({ ...m, [company]: e.target.value }))}
                      style={{ ...selectStyle, borderColor: !current ? "var(--color-text-danger)" : undefined }}
                    >
                      <option value="">— select client —</option>
                      <option value="skip">⊘ Skip all rows for this company</option>
                      <optgroup label="── DocHub clients ──">
                        {existingClients.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name}{matches.find(m => m.id === c.id) ? ` (${Math.round((matches.find(m => m.id === c.id)?.score ?? 0) * 100)}% match)` : ""}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>
                )
              })}
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => setStage("preview")}
                style={{ fontSize: "14px", fontWeight: 500, padding: "8px 20px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}
              >
                Preview import →
              </button>
              <button onClick={() => setStage("columns")} style={{ fontSize: "14px", padding: "8px 16px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>← Back</button>
            </div>
          </div>
        )}

        {/* ── Stage: preview ── */}
        {stage === "preview" && config && (
          <div>
            <div style={{ fontSize: "15px", fontWeight: 500, marginBottom: "4px" }}>Review before importing</div>
            <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginBottom: "20px" }}>
              {entityType === "clients"
                ? "For each row, choose: create as new client, match to an existing one, or skip."
                : `${csvRows.length} rows ready. Rows with unmapped companies are marked as skip.`}
            </div>

            {/* Clients: per-row action */}
            {entityType === "clients" && (
              <div>
                <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                  <button onClick={() => { const a: Record<number, string> = {}; csvRows.forEach((_, i) => a[i] = "create"); setRowActions(a) }} style={{ fontSize: "12px", padding: "4px 10px", borderRadius: "6px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>Set all → Create new</button>
                  <button onClick={() => { const a: Record<number, string> = {}; csvRows.forEach((_, i) => a[i] = "skip"); setRowActions(a) }} style={{ fontSize: "12px", padding: "4px 10px", borderRadius: "6px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>Set all → Skip</button>
                </div>
                <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "10px", overflow: "hidden", marginBottom: "20px", maxHeight: "500px", overflowY: "auto" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 200px", padding: "10px 16px", background: "var(--color-background-secondary)", borderBottom: "0.5px solid var(--color-border-tertiary)", position: "sticky", top: 0 }}>
                    <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-secondary)" }}>Client name from CSV</div>
                    <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-secondary)" }}>Action</div>
                  </div>
                  {csvRows.map((row, i) => {
                    const name = getCellValue(row, "name")
                    const action = rowActions[i] ?? "create"
                    const matches = topMatches(name, existingClients)
                    return (
                      <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 200px", padding: "10px 16px", borderBottom: "0.5px solid var(--color-border-tertiary)", alignItems: "center", background: action === "skip" ? "var(--color-background-secondary)" : "var(--color-background-primary)" }}>
                        <div>
                          <div style={{ fontSize: "14px", color: action === "skip" ? "var(--color-text-muted)" : "var(--color-text-primary)", textDecoration: action === "skip" ? "line-through" : "none" }}>{name || <span style={{ color: "var(--color-text-muted)" }}>—</span>}</div>
                          {matches[0] && action !== "skip" && (
                            <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "2px" }}>
                              Possible duplicate: {matches[0].name} ({Math.round(matches[0].score * 100)}%)
                            </div>
                          )}
                        </div>
                        <select value={action} onChange={e => setRowActions(a => ({ ...a, [i]: e.target.value }))} style={{ ...selectStyle, fontSize: "12px", padding: "5px 8px" }}>
                          <option value="create">✦ Create new</option>
                          <option value="skip">⊘ Skip</option>
                          <optgroup label="── Match to existing ──">
                            {existingClients.map(c => <option key={c.id} value={c.id}>= {c.name}</option>)}
                          </optgroup>
                        </select>
                      </div>
                    )
                  })}
                </div>
                <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginBottom: "16px" }}>
                  {Object.values(rowActions).filter(a => a === "create").length} will be created ·{" "}
                  {Object.values(rowActions).filter(a => a !== "create" && a !== "skip").length} matched to existing ·{" "}
                  {Object.values(rowActions).filter(a => a === "skip").length} skipped
                </div>
              </div>
            )}

            {/* Other types: summary table */}
            {entityType !== "clients" && (
              <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "10px", overflow: "hidden", marginBottom: "20px", maxHeight: "500px", overflowY: "auto" }}>
                <div style={{ display: "grid", gridTemplateColumns: "180px 1fr 100px", padding: "10px 16px", background: "var(--color-background-secondary)", borderBottom: "0.5px solid var(--color-border-tertiary)", position: "sticky", top: 0 }}>
                  <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-secondary)" }}>DocHub client</div>
                  <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-secondary)" }}>
                    {{ contacts: "Contact name", assets: "Asset name", credentials: "Label", licenses: "License name" }[entityType as string]}
                  </div>
                  <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-secondary)" }}>Status</div>
                </div>
                {getPreviewRows().map(({ index, data, clientName, skip }) => (
                  <div key={index} style={{ display: "grid", gridTemplateColumns: "180px 1fr 100px", padding: "9px 16px", borderBottom: "0.5px solid var(--color-border-tertiary)", alignItems: "center", background: skip ? "var(--color-background-secondary)" : "var(--color-background-primary)" }}>
                    <div style={{ fontSize: "13px", color: skip ? "var(--color-text-muted)" : "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{clientName || data.company || "—"}</div>
                    <div style={{ fontSize: "13px", color: skip ? "var(--color-text-muted)" : "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: skip ? "line-through" : "none" }}>
                      {data.name || data.label || "—"}
                    </div>
                    <div style={{ fontSize: "12px", color: skip ? "var(--color-text-muted)" : "var(--accent2)" }}>{skip ? "skip" : "import"}</div>
                  </div>
                ))}
              </div>
            )}

            {entityType !== "clients" && (
              <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginBottom: "16px" }}>
                {getPreviewRows().filter(r => !r.skip).length} will be imported ·{" "}
                {getPreviewRows().filter(r => r.skip).length} skipped (unmapped company)
              </div>
            )}

            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={executeImport}
                disabled={importing}
                style={{ fontSize: "14px", fontWeight: 500, padding: "10px 24px", borderRadius: "8px", border: "none", background: "var(--accent2)", color: "#fff", cursor: importing ? "not-allowed" : "pointer", opacity: importing ? 0.7 : 1 }}
              >
                {importing ? "Importing..." : "Confirm & import"}
              </button>
              <button onClick={() => setStage(config.needsClientMapping ? "companies" : "columns")} style={{ fontSize: "14px", padding: "8px 16px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>← Back</button>
            </div>
          </div>
        )}

        {/* ── Stage: done ── */}
        {stage === "done" && importResult && config && (
          <div>
            <div style={{ fontSize: "18px", fontWeight: 600, color: "var(--color-text-primary)", marginBottom: "16px" }}>Import complete</div>
            <div style={{ display: "flex", gap: "24px", marginBottom: "24px" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "32px", fontWeight: 700, color: "var(--accent2)" }}>{importResult.created}</div>
                <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>Created</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "32px", fontWeight: 700, color: "var(--color-text-muted)" }}>{importResult.skipped}</div>
                <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>Skipped</div>
              </div>
              {importResult.errors.length > 0 && (
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "32px", fontWeight: 700, color: "var(--danger)" }}>{importResult.errors.length}</div>
                  <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>Errors</div>
                </div>
              )}
            </div>
            {importResult.errors.length > 0 && (
              <div style={{ background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: "8px", padding: "16px", marginBottom: "20px" }}>
                <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-primary)", marginBottom: "8px" }}>Errors</div>
                {importResult.errors.map((e, i) => (
                  <div key={i} style={{ fontSize: "12px", color: "var(--danger)", fontFamily: "monospace", marginBottom: "4px" }}>{e}</div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => { setStage("type"); setEntityType(null); setImportResult(null) }}
                style={{ fontSize: "14px", fontWeight: 500, padding: "8px 20px", borderRadius: "8px", border: "none", background: "var(--color-text-primary)", color: "var(--color-background-primary)", cursor: "pointer" }}
              >
                Import another entity
              </button>
              <a href="/clients" style={{ fontSize: "14px", padding: "8px 16px", borderRadius: "8px", border: "0.5px solid var(--color-border-secondary)", background: "transparent", color: "var(--color-text-secondary)", textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
                View clients →
              </a>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
