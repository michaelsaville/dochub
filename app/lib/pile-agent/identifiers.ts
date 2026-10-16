import "server-only"

// Deterministic checks on identifiers read off labels/handwriting. The model's
// confidence is never trusted for these: the card shows a warning and the value
// in mono so the operator confirms it character by character.

const AMBIGUOUS = /[O0IL1lS5B8Z2]/

export type IdCheck = { value: string; warn?: string }

export function checkMac(raw: string): IdCheck {
  const v = raw.trim()
  const hex = v.replace(/[^0-9a-zA-Z]/g, "")
  if (/[OILS]/i.test(hex.replace(/[0-9a-f]/gi, ""))) {
    return { value: v, warn: "MAC contains O/I/L/S — probably a misread 0/1/1/5" }
  }
  if (!/^[0-9a-f]{12}$/i.test(hex)) return { value: v, warn: `MAC should be 12 hex digits (got ${hex.length})` }
  const norm = hex.toUpperCase().match(/.{2}/g)!.join(":")
  return { value: norm }
}

export function checkSerial(raw: string): IdCheck {
  const v = raw.trim()
  if (!v) return { value: v }
  if (v.length < 4) return { value: v, warn: "very short serial" }
  if (AMBIGUOUS.test(v)) return { value: v, warn: "contains look-alike characters (0/O, 1/I/l, 5/S, 8/B, 2/Z) — confirm against the photo" }
  return { value: v }
}

export function checkIp(raw: string): IdCheck {
  const v = raw.trim()
  const m = v.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m || m.slice(1).some((o) => Number(o) > 255)) return { value: v, warn: "not a valid IPv4 address" }
  return { value: v }
}

export function normSerial(s: string | null | undefined): string {
  return (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "")
}
export function normMac(s: string | null | undefined): string {
  return (s || "").toUpperCase().replace(/[^0-9A-F]/g, "")
}
