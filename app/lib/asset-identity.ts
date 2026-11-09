// Normalisation helpers for hardware identity (serial / MAC). Shared by the
// duplicate detector and by sync matching, so "is this the same box?" is
// answered the same way everywhere. Pure — safe in client or server code.

/**
 * Serials that BIOS vendors / RMM agents report when the real one is missing.
 * Compared after normalizeSerial() (uppercase, no whitespace/punctuation).
 */
const PLACEHOLDER_SERIALS = new Set([
  "TOBEFILLEDBYOEM",
  "TOBEFILLEDBYOEMTOBEFILLEDBYOEM",
  "DEFAULTSTRING",
  "SYSTEMSERIALNUMBER",
  "CHASSISSERIALNUMBER",
  "SERIALNUMBER",
  "NONE",
  "NULL",
  "NA",
  "UNKNOWN",
  "NOTAPPLICABLE",
  "NOTSPECIFIED",
  "OEM",
  "INVALID",
  "BASEBOARDSERIALNUMBER",
  "123456789",
  "0123456789",
  "1234567890",
])

/**
 * Uppercase, strip whitespace and separators. Returns null for blanks,
 * placeholders, and all-zero / single-repeated-character strings ("0",
 * "00000000", "XXXXXXXX").
 */
export function normalizeSerial(raw: string | null | undefined): string | null {
  if (!raw) return null
  const s = raw.toUpperCase().replace(/[\s\-_.:/\\]+/g, "")
  if (s.length < 3) return null
  if (PLACEHOLDER_SERIALS.has(s)) return null
  if (/^(.)\1*$/.test(s)) return null // 0000000, FFFFFFF, XXXXXX
  return s
}

/**
 * 12 lowercase hex chars, or null. Rejects all-zero / broadcast and anything
 * that isn't a 48-bit MAC. Accepts "AA:BB:..", "aa-bb-..", "aabb.ccdd.eeff".
 */
export function normalizeMac(raw: string | null | undefined): string | null {
  if (!raw) return null
  const s = raw.toLowerCase().replace(/[^0-9a-f]/g, "")
  if (s.length !== 12) return null
  if (s === "000000000000" || s === "ffffffffffff") return null
  return s
}
