// =============================================================================
// Flexible Assets — shared client-side types + pure helpers.
//
// The typed field ENGINE (render/validate/coerce/encrypt) lives server-side in
// lib/flex-fields.ts (the other agent). This module is the small client-side
// mirror the React surfaces share: the FieldType union, the layout/instance
// shapes returned by /api/flex-* , the relation target → search-endpoint map,
// key derivation for the designer, and date-expiry computation. No server
// imports — safe to pull into every "use client" file.
// =============================================================================

import type { PickerOption } from "@/components/RelationLinker"

export type FieldType =
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

export type FlexField = {
  id?: string
  key: string
  label: string
  type: FieldType
  required?: boolean
  showInList?: boolean
  useForTitle?: boolean
  hint?: string | null
  position?: number
  options?: string[]
  /** "Person" | "Asset" | "Vendor" | "Client" | "FlexAsset" | "FlexLayout:<layoutId>" */
  relationTarget?: string | null
  expires?: boolean
}

export type FlexLayoutSummary = {
  id: string
  name: string
  slug: string
  icon: string
  color: string
  fieldCount: number
  showInNav: boolean
}

export type FlexLayout = {
  id: string
  name: string
  slug?: string
  icon: string
  color: string
  description?: string | null
  fields: FlexField[]
  /** Defensive: some API responses may include an instance count so the
   *  designer can lock field keys once records exist. Optional. */
  instanceCount?: number
  assetCount?: number
}

export type FlexValues = Record<string, unknown>

export type FlexRelationValue = {
  fieldKey: string
  targetType: string
  targetId: string
  label?: string
}

export type FlexAttachment = {
  id: string
  originalName: string
  mimeType: string
  size: number
  flexFieldKey?: string | null
  createdAt?: string
}

export type FlexAssetInstance = {
  id: string
  title: string
  layoutId: string
  clientId: string
  client?: { name: string } | null
  location?: { name: string } | null
  values: FlexValues
  updatedAt: string
}

export type FlexAssetDetail = FlexAssetInstance & {
  resolvedRelations?: FlexRelationValue[]
  attachments?: FlexAttachment[]
}

// ── Field-type catalogue (drives the designer's type <select>) ───────────────
export const FIELD_TYPES: { value: FieldType; label: string; help: string }[] = [
  { value: "text", label: "Text", help: "Single line of text" },
  { value: "textarea", label: "Text area", help: "Multi-line notes" },
  { value: "number", label: "Number", help: "Numeric value" },
  { value: "date", label: "Date", help: "Calendar date (can drive expiry alerts)" },
  { value: "select", label: "Dropdown (one)", help: "Pick one of a fixed list" },
  { value: "multiselect", label: "Multi-select", help: "Pick several of a fixed list" },
  { value: "checkbox", label: "Checkbox", help: "Yes / no toggle" },
  { value: "tags", label: "Tags", help: "Free-form chips" },
  { value: "password", label: "Password", help: "Encrypted secret with reveal" },
  { value: "upload", label: "File / photo upload", help: "Attach files (camera on mobile)" },
  { value: "relation", label: "Relation", help: "Link a Contact / Asset / Vendor / Client / Flex Asset" },
  { value: "website", label: "Website", help: "Auto-linked URL" },
  { value: "header", label: "Section header", help: "Visual divider — not a data field" },
]

export const RELATION_TARGETS: { value: string; label: string; noun: string }[] = [
  { value: "Person", label: "Contact", noun: "contact" },
  { value: "Asset", label: "Asset / Configuration", noun: "asset" },
  { value: "Vendor", label: "Vendor", noun: "vendor" },
  { value: "Client", label: "Client / Organization", noun: "client" },
  { value: "FlexAsset", label: "Other Flexible Asset", noun: "flexible asset" },
]

/** A field type that stores its value in FlexAsset.values (vs. relations/attachments). */
export function isValueField(t: FieldType): boolean {
  return t !== "relation" && t !== "upload" && t !== "header"
}

export function typeNeedsOptions(t: FieldType): boolean {
  return t === "select" || t === "multiselect"
}

// ── Relation target resolution ───────────────────────────────────────────────
export function relationTargetType(rt?: string | null): string {
  if (!rt) return "Person"
  if (rt.startsWith("FlexLayout:")) return "FlexAsset"
  return rt
}

export function relationTargetLayoutId(rt?: string | null): string | null {
  if (rt && rt.startsWith("FlexLayout:")) return rt.slice("FlexLayout:".length)
  return null
}

export function relationNoun(rt?: string | null): string {
  const t = relationTargetType(rt)
  return RELATION_TARGETS.find(r => r.value === t)?.noun ?? "record"
}

/** GET endpoint (returning an array of rows) that RelationLinker searches for a
 *  relation field. Client-scoped where the target lives under a client. */
export function relationSearchEndpoint(rt: string | null | undefined, clientId?: string): string {
  const type = relationTargetType(rt)
  const layoutId = relationTargetLayoutId(rt)
  switch (type) {
    case "Client":
      return "/api/clients"
    case "Vendor":
      return "/api/vendors"
    case "Asset":
      return clientId ? `/api/clients/${clientId}/assets` : "/api/assets"
    case "Person":
      return clientId ? `/api/clients/${clientId}/contacts` : "/api/identity/contacts"
    case "FlexAsset":
      return layoutId
        ? `/api/flex-assets?layoutId=${layoutId}`
        : clientId
          ? `/api/clients/${clientId}/flex-assets`
          : "/api/flex-assets"
    default:
      return clientId ? `/api/clients/${clientId}/assets` : "/api/assets"
  }
}

/** Adapts an arbitrary relation-search row into a RelationLinker PickerOption. */
export function relationMapOption(raw: Record<string, unknown>): PickerOption {
  const g = (k: string) => (raw?.[k] as string) || undefined
  const label = g("title") ?? g("name") ?? g("friendlyName") ?? g("label") ?? "Untitled"
  const sublabel =
    g("email") ??
    g("username") ??
    g("model") ??
    g("role") ??
    (raw?.client as { name?: string })?.name ??
    g("type") ??
    undefined
  return { id: String(raw.id), label, sublabel }
}

/** Where a relation chip links to on the detail view (null = non-navigable). */
export function relationHref(targetType: string, targetId: string): string | null {
  switch (targetType) {
    case "Asset":
      return `/assets/${targetId}`
    case "Vendor":
      return `/vendors/${targetId}`
    case "Client":
      return `/clients/${targetId}`
    case "FlexAsset":
      return `/flex/asset/${targetId}`
    default:
      return null // Person contacts have no standalone page
  }
}

// ── Date expiry ──────────────────────────────────────────────────────────────
export type ExpiryLevel = "expired" | "soon" | "ok"

export function expiryStatus(
  dateStr: unknown,
  warnDays = 30,
): { level: ExpiryLevel; days: number } | null {
  if (!dateStr || typeof dateStr !== "string") return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  const days = Math.ceil((d.getTime() - Date.now()) / 86_400_000)
  if (days < 0) return { level: "expired", days }
  if (days <= warnDays) return { level: "soon", days }
  return { level: "ok", days }
}

export function expiryLabel(s: { level: ExpiryLevel; days: number }): string {
  if (s.level === "expired") {
    const n = Math.abs(s.days)
    return `Expired ${n} day${n === 1 ? "" : "s"} ago`
  }
  if (s.days === 0) return "Expires today"
  return `Expires in ${s.days} day${s.days === 1 ? "" : "s"}`
}

// ── Key derivation (designer) ────────────────────────────────────────────────
export function toKey(label: string): string {
  return (
    label
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "field"
  )
}

export function uniqueKey(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base
  let i = 2
  while (taken.has(`${base}_${i}`)) i++
  return `${base}_${i}`
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

// ── Value emptiness (required-field validation) ──────────────────────────────
export function isEmptyValue(v: unknown): boolean {
  if (v == null) return true
  if (typeof v === "string") return v.trim() === ""
  if (Array.isArray(v)) return v.length === 0
  return false
}
