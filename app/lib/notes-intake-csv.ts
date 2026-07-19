import { parse } from "csv-parse/sync"

// Parse a password-manager / TOTP CSV export into normalized credential rows.
// Handles Bitwarden, 1Password, LastPass, KeePass, Chrome/Edge, and Authy-style
// TOTP exports by mapping columns via header keywords (case-insensitive).

export type CsvCred = {
  name: string
  username?: string
  password?: string
  url?: string
  totp?: string // base32 secret (extracted from otpauth:// if needed)
  notes?: string
  folder?: string
}

const FIELD_KEYS: Record<keyof Omit<CsvCred, "name"> | "name", string[]> = {
  name: ["name", "title", "account", "item name", "entry"],
  username: ["username", "user name", "login_username", "login name", "user", "login"],
  password: ["password", "login_password", "pass"],
  url: ["url", "uri", "login_uri", "website", "web site", "site", "login uri", "urls"],
  totp: ["totp", "otpauth", "login_totp", "otp", "otp_secret", "otpauth url", "otpauth_url", "two-factor secret", "2fa", "authenticator key", "authenticator", "secret"],
  notes: ["notes", "note", "extra", "comments", "comment"],
  folder: ["folder", "grouping", "group", "collection", "category", "vault"],
}

const norm = (s: string) => s.trim().toLowerCase().replace(/^"|"$/g, "")

// Extract a base32 TOTP secret from a raw cell (otpauth:// URI or bare secret).
export function extractTotpSecret(val?: string | null): string | null {
  if (!val) return null
  const v = val.trim()
  if (/^otpauth:\/\//i.test(v)) {
    try {
      const u = new URL(v.replace(/^otpauth:\/\//i, "https://otpauth/"))
      const s = u.searchParams.get("secret")
      return s ? s.replace(/\s/g, "").toUpperCase() : null
    } catch { return null }
  }
  const cleaned = v.replace(/\s/g, "").toUpperCase()
  if (/^[A-Z2-7]{8,}={0,8}$/.test(cleaned)) return cleaned
  return null
}

// Parse a block of pasted otpauth:// lines (what Authy/2FA extractors emit) into
// credential rows: issuer → name/folder, account → username, secret → totp.
export function parseOtpauthText(text: string): CsvCred[] {
  const out: CsvCred[] = []
  for (const raw of text.split(/[\r\n]+/)) {
    const line = raw.trim()
    if (!/^otpauth:\/\//i.test(line)) continue
    const secret = extractTotpSecret(line)
    if (!secret) continue
    let issuer = "", account = ""
    try {
      const u = new URL(line.replace(/^otpauth:\/\//i, "https://otpauth/"))
      issuer = (u.searchParams.get("issuer") || "").trim()
      const label = decodeURIComponent(u.pathname.replace(/^\/(totp|hotp)\//i, ""))
      if (label.includes(":")) { const [a, b] = label.split(":"); if (!issuer) issuer = a.trim(); account = b.trim() }
      else account = label.trim()
    } catch { /* keep defaults */ }
    const name = issuer && account ? `${issuer} (${account})` : issuer || account || "TOTP token"
    out.push({ name, username: account || undefined, totp: secret, folder: issuer || undefined })
  }
  return out
}

export function parseCsvCreds(text: string): { rows: CsvCred[]; headers: string[]; mapped: Record<string, string> } {
  const records: string[][] = parse(text, { columns: false, skip_empty_lines: true, relax_column_count: true, bom: true, trim: true })
  if (records.length < 2) return { rows: [], headers: records[0] || [], mapped: {} }
  const headers = records[0]
  const hnorm = headers.map(norm)

  // Resolve each logical field to a column index.
  const colOf: Partial<Record<keyof CsvCred, number>> = {}
  const mapped: Record<string, string> = {}
  for (const field of Object.keys(FIELD_KEYS) as (keyof CsvCred)[]) {
    const idx = hnorm.findIndex((h) => FIELD_KEYS[field].includes(h))
    if (idx >= 0) { colOf[field] = idx; mapped[field] = headers[idx] }
  }
  // fallbacks
  if (colOf.name === undefined) colOf.name = 0 // first column as a last resort
  if (colOf.username === undefined) {
    const ei = hnorm.findIndex((h) => h.includes("email") || h.includes("e-mail"))
    if (ei >= 0) { colOf.username = ei; mapped.username = headers[ei] }
  }

  const get = (row: string[], f: keyof CsvCred) => (colOf[f] !== undefined ? (row[colOf[f] as number] || "").trim() : "")

  const rows: CsvCred[] = []
  for (let i = 1; i < records.length; i++) {
    const r = records[i]
    const password = get(r, "password")
    const totp = extractTotpSecret(get(r, "totp"))
    const name = get(r, "name") || get(r, "url") || get(r, "username")
    if (!password && !totp) continue // nothing importable
    rows.push({
      name: name || "Imported credential",
      username: get(r, "username") || undefined,
      password: password || undefined,
      url: get(r, "url") || undefined,
      totp: totp || undefined,
      notes: get(r, "notes") || undefined,
      folder: get(r, "folder") || undefined,
    })
  }
  return { rows, headers, mapped }
}
