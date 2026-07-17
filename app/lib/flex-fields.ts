// ─── Flexible Assets field-type registry ────────────────────────────────────
// Server-safe (NO react, NO crypto import) reusable engine shared by the layout
// designer, instance create/edit/detail, list rendering and search. Passwords
// are flagged here (isSecretField) but ENCRYPTED by the route via lib/crypto —
// this module never handles the key so it stays import-safe everywhere.

export type FlexFieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "select"
  | "multiselect"
  | "checkbox"
  | "tags"
  | "password"
  | "upload"
  | "relation"
  | "header"
  | "website"

/** The relation targets a `relation` field may point at (relationTarget). */
export const RELATION_TARGETS = ["Person", "Asset", "Vendor", "Client", "FlexAsset"] as const
export type RelationTarget = (typeof RELATION_TARGETS)[number]

/** Minimal field shape shared by FlexLayoutField rows and designer input. */
export interface FlexFieldDef {
  key: string
  label: string
  type: string
  required?: boolean
  showInList?: boolean
  useForTitle?: boolean
  hint?: string | null
  position?: number
  options?: string[]
  relationTarget?: string | null
  expires?: boolean
}

export type FlexValues = Record<string, unknown>

// ─── Type metadata ──────────────────────────────────────────────────────────
export interface FlexFieldTypeMeta {
  type: FlexFieldType
  label: string
  hasOptions: boolean // select/multiselect consume options[]
  isRelation: boolean // relation — value lives in FlexAssetRelation, not values Json
  isSecret: boolean // password — value ENCRYPTED, never in searchText/title
  isUpload: boolean // upload — value lives in ClientAttachment, not values Json
  isDate: boolean // date — eligible for expiry alerts
}

export const FLEX_FIELD_TYPES: FlexFieldTypeMeta[] = [
  { type: "text", label: "Text", hasOptions: false, isRelation: false, isSecret: false, isUpload: false, isDate: false },
  { type: "textarea", label: "Text Area", hasOptions: false, isRelation: false, isSecret: false, isUpload: false, isDate: false },
  { type: "number", label: "Number", hasOptions: false, isRelation: false, isSecret: false, isUpload: false, isDate: false },
  { type: "date", label: "Date", hasOptions: false, isRelation: false, isSecret: false, isUpload: false, isDate: true },
  { type: "select", label: "Dropdown", hasOptions: true, isRelation: false, isSecret: false, isUpload: false, isDate: false },
  { type: "multiselect", label: "Multi-Select", hasOptions: true, isRelation: false, isSecret: false, isUpload: false, isDate: false },
  { type: "checkbox", label: "Checkbox", hasOptions: false, isRelation: false, isSecret: false, isUpload: false, isDate: false },
  { type: "tags", label: "Tags", hasOptions: false, isRelation: false, isSecret: false, isUpload: false, isDate: false },
  { type: "password", label: "Password", hasOptions: false, isRelation: false, isSecret: true, isUpload: false, isDate: false },
  { type: "upload", label: "Upload", hasOptions: false, isRelation: false, isSecret: false, isUpload: true, isDate: false },
  { type: "relation", label: "Relation", hasOptions: false, isRelation: true, isSecret: false, isUpload: false, isDate: false },
  { type: "header", label: "Header / Divider", hasOptions: false, isRelation: false, isSecret: false, isUpload: false, isDate: false },
  { type: "website", label: "Website", hasOptions: false, isRelation: false, isSecret: false, isUpload: false, isDate: false },
]

const META_BY_TYPE = new Map<string, FlexFieldTypeMeta>(FLEX_FIELD_TYPES.map((m) => [m.type, m]))

/** Metadata for a field type, or undefined for an unknown type string. */
export function getFieldMeta(type: string): FlexFieldTypeMeta | undefined {
  return META_BY_TYPE.get(type)
}

/** Is this a known, valid field-type string? */
export function isValidFieldType(type: string): boolean {
  return META_BY_TYPE.has(type)
}

/** Password (encrypted) field — value must never land in values Json plaintext. */
export function isSecretField(field: FlexFieldDef): boolean {
  return getFieldMeta(field.type)?.isSecret ?? false
}

/** header = visual divider, holds no data. */
function isDataless(field: FlexFieldDef): boolean {
  const t = field.type
  return t === "header" || t === "relation" || t === "upload"
}

function isEmptyValue(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  )
}

// ─── Validation ─────────────────────────────────────────────────────────────
/**
 * Returns an error message when `value` is invalid for `field`, else null.
 * header/relation/upload carry no value in the values Json so they always pass
 * (relation/upload required-ness is enforced at the route, not here).
 */
export function validateValue(field: FlexFieldDef, value: unknown): string | null {
  if (field.type === "header") return null
  if (field.type === "relation" || field.type === "upload") return null

  const empty = isEmptyValue(value)
  if (field.required && empty) return `${field.label} is required`
  if (empty) return null

  switch (field.type) {
    case "number":
      if (typeof value === "boolean" || value === "" || isNaN(Number(value as any)))
        return `${field.label} must be a number`
      return null
    case "date": {
      const d = new Date(value as any)
      if (isNaN(d.getTime())) return `${field.label} must be a valid date`
      return null
    }
    case "checkbox":
      if (typeof value !== "boolean") return `${field.label} must be true or false`
      return null
    case "select":
      if (field.options && field.options.length && !field.options.includes(String(value)))
        return `${field.label} must be one of: ${field.options.join(", ")}`
      return null
    case "multiselect":
      if (!Array.isArray(value)) return `${field.label} must be a list`
      if (field.options && field.options.length) {
        const bad = value.find((v) => !field.options!.includes(String(v)))
        if (bad !== undefined) return `${field.label} has an invalid option: ${String(bad)}`
      }
      return null
    case "tags":
      if (!Array.isArray(value)) return `${field.label} must be a list of tags`
      return null
    case "text":
    case "textarea":
    case "website":
    case "password":
      return null
    default:
      return null
  }
}

// ─── Coercion ───────────────────────────────────────────────────────────────
/**
 * Normalise a raw input value into its stored form. Passwords are returned as a
 * plain string here — the route encrypts the result before persisting.
 */
export function coerceValue(field: FlexFieldDef, value: unknown): unknown {
  if (value === null || value === undefined) return null
  switch (field.type) {
    case "number": {
      if (value === "") return null
      const n = Number(value as any)
      return isNaN(n) ? null : n
    }
    case "checkbox":
      return value === true || value === "true" || value === "on" || value === 1
    case "multiselect":
    case "tags": {
      const arr = Array.isArray(value)
        ? value
        : typeof value === "string" && value.trim()
        ? [value]
        : []
      return arr.map((v) => String(v).trim()).filter((v) => v.length > 0)
    }
    case "date":
      return value === "" ? null : String(value)
    case "password":
      // Do NOT trim — secrets may legitimately contain leading/trailing spaces.
      return String(value)
    case "text":
    case "textarea":
    case "website":
    case "select":
      return typeof value === "string" ? value.trim() : String(value)
    default:
      return value
  }
}

// ─── Display / search flattening ────────────────────────────────────────────
/** Human-readable rendering of a scalar/array/boolean value (for titles/cells). */
export function displayValue(field: FlexFieldDef, value: unknown): string {
  if (value === null || value === undefined) return ""
  if (Array.isArray(value)) return value.filter((v) => v !== null && v !== undefined && v !== "").map(String).join(", ")
  if (typeof value === "boolean") return value ? "Yes" : "No"
  return String(value)
}

/**
 * Flatten one field's value into plain search text. ALWAYS returns "" for
 * secrets, relations, uploads and headers so encrypted/opaque data never leaks
 * into searchText.
 */
export function flattenForSearch(field: FlexFieldDef, value: unknown): string {
  if (isSecretField(field)) return ""
  if (field.type === "relation" || field.type === "upload" || field.type === "header") return ""
  if (value === null || value === undefined) return ""
  if (Array.isArray(value)) return value.filter((v) => v !== null && v !== undefined && v !== "").map(String).join(" ")
  if (typeof value === "boolean") return value ? field.label : ""
  return String(value)
}

/**
 * Derive a FlexAsset.title by concatenating useForTitle fields in position
 * order (secrets/relations/uploads/headers skipped). Falls back to `fallback`
 * (pass the layout name) then "Untitled".
 */
export function deriveTitle(fields: FlexFieldDef[], values: FlexValues, fallback = ""): string {
  const titleFields = fields
    .filter((f) => f.useForTitle && !isSecretField(f) && !isDataless(f))
    .slice()
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))

  const parts: string[] = []
  for (const f of titleFields) {
    const s = displayValue(f, values?.[f.key]).trim()
    if (s) parts.push(s)
  }
  const title = parts.join(" · ").trim()
  return title || fallback.trim() || "Untitled"
}

/** Denormalised, secret-free flattened text of every value, for /api/search. */
export function buildSearchText(fields: FlexFieldDef[], values: FlexValues): string {
  const parts: string[] = []
  for (const f of fields) {
    const s = flattenForSearch(f, values?.[f.key])
    if (s) parts.push(s)
  }
  return parts.join(" ").replace(/\s+/g, " ").trim()
}

/**
 * Return a copy of `values` with every secret (password) field removed, so the
 * ciphertext never travels in list/detail payloads. Callers surface presence
 * separately (see secretState).
 */
export function stripSecretValues(fields: FlexFieldDef[], values: FlexValues): FlexValues {
  const out: FlexValues = { ...(values ?? {}) }
  for (const f of fields) {
    if (isSecretField(f)) delete out[f.key]
  }
  return out
}

/** `{ [passwordKey]: true|false }` — whether a secret value is set, without exposing it. */
export function secretState(fields: FlexFieldDef[], values: FlexValues): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  for (const f of fields) {
    if (isSecretField(f)) out[f.key] = !isEmptyValue(values?.[f.key])
  }
  return out
}

/** url-safe slug from arbitrary text. */
export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "layout"
  )
}

/** Stable machine key from a label (used when the designer omits an explicit key). */
export function keyify(label: string): string {
  const parts = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length === 0) return "field"
  const camel = parts[0] + parts.slice(1).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("")
  return camel.slice(0, 60)
}
