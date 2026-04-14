// ── Report entity / field definitions ────────────────────────────────────────
// Pure TS — no Prisma import. Used by both builder UI and runner API.

export type FieldType = "string" | "date" | "number" | "boolean" | "enum"

export type FieldDef = {
  key: string
  label: string
  type: FieldType
  sortable?: boolean
  filterable?: boolean
  enumValues?: string[]
  getValue: (row: any) => any
  format?: (val: any) => string
}

export type FilterOp =
  | "eq" | "ne"
  | "contains" | "not_contains"
  | "before" | "after" | "within_days" | "overdue"
  | "gt" | "lt"
  | "is_empty" | "is_not_empty"

export type Filter = { field: string; op: FilterOp; value?: string }

export type ReportConfig = {
  clientIds: string[]       // [] = all clients
  columns: string[]
  filters: Filter[]
  sort: { field: string; dir: "asc" | "desc" } | null
  groupBy: string | null
}

export type EntityKey = "assets" | "licenses" | "contacts" | "domains" | "network_devices" | "clients"

export type EntityDef = {
  key: EntityKey
  label: string
  fields: FieldDef[]
  defaultColumns: string[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(val: any, type: FieldType): string {
  if (val == null || val === "") return "—"
  if (type === "date") return new Date(val).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" })
  if (type === "boolean") return val ? "Yes" : "No"
  return String(val)
}

function dateVal(val: any): Date | null {
  if (!val) return null
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d
}

export function applyFilter(row: any, filter: Filter, field: FieldDef): boolean {
  const val = field.getValue(row)
  const fv = filter.value ?? ""

  switch (filter.op) {
    case "eq":           return String(val ?? "").toLowerCase() === fv.toLowerCase()
    case "ne":           return String(val ?? "").toLowerCase() !== fv.toLowerCase()
    case "contains":     return String(val ?? "").toLowerCase().includes(fv.toLowerCase())
    case "not_contains": return !String(val ?? "").toLowerCase().includes(fv.toLowerCase())
    case "is_empty":     return val == null || val === ""
    case "is_not_empty": return val != null && val !== ""
    case "gt":           return Number(val) > Number(fv)
    case "lt":           return Number(val) < Number(fv)
    case "before": {
      const d = dateVal(val)
      return !!d && d < new Date(fv)
    }
    case "after": {
      const d = dateVal(val)
      return !!d && d > new Date(fv)
    }
    case "within_days": {
      const d = dateVal(val)
      if (!d) return false
      const cutoff = new Date(Date.now() + Number(fv) * 86400000)
      return d <= cutoff && d >= new Date()
    }
    case "overdue": {
      const d = dateVal(val)
      return !!d && d < new Date()
    }
    default: return true
  }
}

export function applyFilters(rows: any[], filters: Filter[], entity: EntityDef): any[] {
  if (!filters.length) return rows
  return rows.filter(row =>
    filters.every(f => {
      const field = entity.fields.find(fd => fd.key === f.field)
      return field ? applyFilter(row, f, field) : true
    })
  )
}

export function applySort(rows: any[], sort: ReportConfig["sort"], entity: EntityDef): any[] {
  if (!sort) return rows
  const field = entity.fields.find(f => f.key === sort.field)
  if (!field) return rows
  return [...rows].sort((a, b) => {
    const av = field.getValue(a)
    const bv = field.getValue(b)
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    if (field.type === "date") return (new Date(av).getTime() - new Date(bv).getTime()) * (sort.dir === "asc" ? 1 : -1)
    if (field.type === "number") return (Number(av) - Number(bv)) * (sort.dir === "asc" ? 1 : -1)
    return String(av).localeCompare(String(bv)) * (sort.dir === "asc" ? 1 : -1)
  })
}

export function applyGroup(rows: any[], groupBy: string | null, entity: EntityDef): { label: string; rows: any[] }[] {
  if (!groupBy) return [{ label: "", rows }]
  const field = entity.fields.find(f => f.key === groupBy)
  if (!field) return [{ label: "", rows }]
  const groups = new Map<string, any[]>()
  for (const row of rows) {
    const key = String(field.getValue(row) ?? "—")
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(row)
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, rows]) => ({ label, rows }))
}

export function formatCell(row: any, field: FieldDef): string {
  const val = field.getValue(row)
  if (field.format) return field.format(val) || "—"
  return fmt(val, field.type)
}

// ── Entity definitions ────────────────────────────────────────────────────────

export const ENTITIES: Record<EntityKey, EntityDef> = {

  assets: {
    key: "assets",
    label: "Assets",
    defaultColumns: ["name", "category", "make", "model", "serial", "location", "warrantyExpiry"],
    fields: [
      { key: "client",        label: "Client",        type: "string",  sortable: true,  filterable: true,  getValue: r => r.location?.client?.name },
      { key: "name",          label: "Hostname",      type: "string",  sortable: true,  filterable: true,  getValue: r => r.name },
      { key: "friendlyName",  label: "Friendly Name", type: "string",  sortable: true,  filterable: true,  getValue: r => r.friendlyName },
      { key: "category",      label: "Category",      type: "enum",    sortable: true,  filterable: true,  getValue: r => r.category,
        enumValues: ["NETWORK_GEAR","WIRELESS","SERVER","NAS","COMPUTER","LAPTOP","TABLET","PRINTER","PHONE_SYSTEM","PHONE_ENDPOINT","WEBSITE","VPN","OTHER"],
        format: v => v ? v.replace(/_/g, " ") : "—" },
      { key: "assetType",     label: "Asset Type",    type: "string",  sortable: true,  filterable: true,  getValue: r => r.assetType?.name },
      { key: "status",        label: "Status",        type: "enum",    sortable: true,  filterable: true,  getValue: r => r.status,
        enumValues: ["ACTIVE","RETIRING","SUNSET","RETIRED","IN_REPAIR","IN_STORAGE","STOLEN","LOST","DISPOSED"],
        format: v => v ? v.replace(/_/g, " ") : "—" },
      { key: "make",          label: "Make",          type: "string",  sortable: true,  filterable: true,  getValue: r => r.make },
      { key: "model",         label: "Model",         type: "string",  sortable: true,  filterable: true,  getValue: r => r.model },
      { key: "serial",        label: "Serial",        type: "string",  filterable: true, getValue: r => r.serial },
      { key: "assetTag",      label: "Asset Tag",     type: "string",  filterable: true, getValue: r => r.assetTag },
      { key: "ipAddress",     label: "IP Address",    type: "string",  filterable: true, getValue: r => r.ipAddress },
      { key: "room",          label: "Room",          type: "string",  sortable: true,  filterable: true,  getValue: r => r.room },
      { key: "location",      label: "Location",      type: "string",  sortable: true,  filterable: true,  getValue: r => r.location?.name },
      { key: "purchaseDate",  label: "Purchase Date", type: "date",    sortable: true,  filterable: true,  getValue: r => r.purchaseDate,    format: v => v ? new Date(v).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" }) : "—" },
      { key: "warrantyExpiry",label: "Warranty Expiry",type:"date",    sortable: true,  filterable: true,  getValue: r => r.warrantyExpiry,  format: v => v ? new Date(v).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" }) : "—" },
    ],
  },

  licenses: {
    key: "licenses",
    label: "Licenses & Subscriptions",
    defaultColumns: ["client", "name", "vendor", "seats", "assignedSeats", "expiryDate"],
    fields: [
      { key: "client",        label: "Client",        type: "string",  sortable: true,  filterable: true,  getValue: r => r.client?.name },
      { key: "name",          label: "Name",          type: "string",  sortable: true,  filterable: true,  getValue: r => r.name },
      { key: "vendor",        label: "Vendor",        type: "string",  sortable: true,  filterable: true,  getValue: r => r.vendor },
      { key: "seats",         label: "Seats (Total)", type: "number",  sortable: true,                    getValue: r => r.seats },
      { key: "assignedSeats", label: "Seats (Used)",  type: "number",  sortable: true,                    getValue: r => r.assignedSeats },
      { key: "billingTerm",   label: "Billing Term",  type: "string",  sortable: true,  filterable: true,  getValue: r => r.billingTerm },
      { key: "cost",          label: "Cost",          type: "number",  sortable: true,                    getValue: r => r.cost, format: v => v != null ? `$${Number(v).toFixed(2)}` : "—" },
      { key: "purchaseDate",  label: "Purchase Date", type: "date",    sortable: true,  filterable: true,  getValue: r => r.purchaseDate,    format: v => v ? new Date(v).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" }) : "—" },
      { key: "expiryDate",    label: "Expiry Date",   type: "date",    sortable: true,  filterable: true,  getValue: r => r.expiryDate,      format: v => v ? new Date(v).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" }) : "—" },
      { key: "renewalDate",   label: "Renewal Date",  type: "date",    sortable: true,  filterable: true,  getValue: r => r.renewalDate,     format: v => v ? new Date(v).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" }) : "—" },
    ],
  },

  contacts: {
    key: "contacts",
    label: "People",
    defaultColumns: ["client", "name", "role", "email", "phone", "isPrimary"],
    fields: [
      { key: "client",      label: "Client",     type: "string",  sortable: true,  filterable: true,  getValue: r => r.client?.name },
      { key: "name",        label: "Name",       type: "string",  sortable: true,  filterable: true,  getValue: r => r.name },
      { key: "role",        label: "Role",       type: "string",  sortable: true,  filterable: true,  getValue: r => r.role },
      { key: "email",       label: "Email",      type: "string",  sortable: true,  filterable: true,  getValue: r => r.email },
      { key: "phone",       label: "Phone",      type: "string",  filterable: true,                   getValue: r => r.phone },
      { key: "mobile",      label: "Mobile",     type: "string",  filterable: true,                   getValue: r => r.mobile },
      { key: "isPrimary",   label: "Primary",    type: "boolean", sortable: true,  filterable: true,  getValue: r => r.isPrimary,   format: v => v ? "Yes" : "No" },
      { key: "isBilling",   label: "Billing",    type: "boolean", sortable: true,  filterable: true,  getValue: r => r.isBilling,   format: v => v ? "Yes" : "No" },
      { key: "isEscalation",label: "Escalation", type: "boolean", sortable: true,  filterable: true,  getValue: r => r.isEscalation,format: v => v ? "Yes" : "No" },
    ],
  },

  domains: {
    key: "domains",
    label: "Domains & SSL",
    defaultColumns: ["client", "domain", "registrar", "expiresAt", "sslExpiresAt", "autoRenew"],
    fields: [
      { key: "client",     label: "Client",       type: "string",  sortable: true,  filterable: true,  getValue: r => r.client?.name },
      { key: "domain",     label: "Domain",       type: "string",  sortable: true,  filterable: true,  getValue: r => r.domain },
      { key: "registrar",  label: "Registrar",    type: "string",  sortable: true,  filterable: true,  getValue: r => r.registrar },
      { key: "autoRenew",  label: "Auto-Renew",   type: "boolean", sortable: true,                     getValue: r => r.autoRenew, format: v => v ? "Yes" : "No" },
      { key: "expiresAt",  label: "Domain Expiry",type: "date",    sortable: true,  filterable: true,  getValue: r => r.expiresAt,   format: v => v ? new Date(v).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" }) : "—" },
      { key: "sslExpiresAt",label:"SSL Expiry",   type: "date",    sortable: true,  filterable: true,  getValue: r => r.sslExpiresAt,format: v => v ? new Date(v).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" }) : "—" },
      { key: "sslIssuer",  label: "SSL Issuer",   type: "string",  sortable: true,  filterable: true,  getValue: r => r.sslIssuer },
    ],
  },

  network_devices: {
    key: "network_devices",
    label: "Network Devices",
    defaultColumns: ["client", "name", "type", "make", "model", "ipAddress", "firmwareVersion"],
    fields: [
      { key: "client",          label: "Client",          type: "string",  sortable: true,  filterable: true,  getValue: r => r.client?.name },
      { key: "name",            label: "Name",            type: "string",  sortable: true,  filterable: true,  getValue: r => r.name },
      { key: "type",            label: "Type",            type: "enum",    sortable: true,  filterable: true,  getValue: r => r.type,
        enumValues: ["SWITCH","FIREWALL","ROUTER","ACCESS_POINT","NAS","UPS","MODEM","OTHER"],
        format: v => v ? v.replace(/_/g, " ") : "—" },
      { key: "make",            label: "Make",            type: "string",  sortable: true,  filterable: true,  getValue: r => r.make },
      { key: "model",           label: "Model",           type: "string",  sortable: true,  filterable: true,  getValue: r => r.model },
      { key: "ipAddress",       label: "IP Address",      type: "string",  filterable: true,                   getValue: r => r.ipAddress },
      { key: "macAddress",      label: "MAC Address",     type: "string",  filterable: true,                   getValue: r => r.macAddress },
      { key: "serial",          label: "Serial",          type: "string",  filterable: true,                   getValue: r => r.serial },
      { key: "firmwareVersion", label: "Firmware",        type: "string",  sortable: true,  filterable: true,  getValue: r => r.firmwareVersion },
      { key: "location",        label: "Location",        type: "string",  sortable: true,  filterable: true,  getValue: r => r.location?.name },
      { key: "lastSeenAt",      label: "Last Seen",       type: "date",    sortable: true,                     getValue: r => r.lastSeenAt, format: v => v ? new Date(v).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" }) : "—" },
    ],
  },

  clients: {
    key: "clients",
    label: "Clients",
    defaultColumns: ["name", "type", "isActive"],
    fields: [
      { key: "name",     label: "Name",    type: "string",  sortable: true,  filterable: true,  getValue: r => r.name },
      { key: "type",     label: "Type",    type: "enum",    sortable: true,  filterable: true,  getValue: r => r.type, enumValues: ["BUSINESS","RESIDENTIAL"] },
      { key: "isActive", label: "Active",  type: "boolean", sortable: true,  filterable: true,  getValue: r => r.isActive, format: v => v ? "Active" : "Inactive" },
      { key: "notes",    label: "Notes",   type: "string",  filterable: true,                   getValue: r => r.notes },
    ],
  },
}

export const FILTER_OPS: { op: FilterOp; label: string; types: FieldType[]; hasValue: boolean }[] = [
  { op: "eq",           label: "equals",              types: ["string","enum","number","boolean"], hasValue: true  },
  { op: "ne",           label: "does not equal",      types: ["string","enum","number","boolean"], hasValue: true  },
  { op: "contains",     label: "contains",            types: ["string"],                           hasValue: true  },
  { op: "not_contains", label: "does not contain",    types: ["string"],                           hasValue: true  },
  { op: "is_empty",     label: "is empty",            types: ["string","date","number"],           hasValue: false },
  { op: "is_not_empty", label: "is not empty",        types: ["string","date","number"],           hasValue: false },
  { op: "before",       label: "before (date)",       types: ["date"],                             hasValue: true  },
  { op: "after",        label: "after (date)",        types: ["date"],                             hasValue: true  },
  { op: "within_days",  label: "within N days",       types: ["date"],                             hasValue: true  },
  { op: "overdue",      label: "overdue (past today)", types: ["date"],                            hasValue: false },
  { op: "gt",           label: "greater than",        types: ["number"],                           hasValue: true  },
  { op: "lt",           label: "less than",           types: ["number"],                           hasValue: true  },
]
