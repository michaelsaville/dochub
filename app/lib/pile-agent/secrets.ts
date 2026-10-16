/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only"
import { encrypt, decrypt } from "@/lib/crypto"
import { openEntities, SECRET_KEYS_BY_KIND } from "@/lib/notes-intake-secrets"

// Pile Agent secret handles. The model must never be handed a known secret value
// in text: before any note text / prior extraction reaches it, every secret we
// can identify is swapped for an opaque handle ⟦secret:N⟧. Propose tools accept
// handles; the server resolves them at proposal time and seals the payload.
// The map lives sealed on the AgentConversation row.

export type SecretMap = Record<string, string> // handle -> plaintext

export const HANDLE_RE = /⟦secret:(\d+)⟧/g

export function sealJson(v: unknown): string { return encrypt(JSON.stringify(v)) }
export function openJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback
  try { return JSON.parse(decrypt(s)) as T } catch { return fallback }
}

// "pw: hunter22", "password = x", "pin 4411", "passcode: …" — the value after a
// secret-ish label. Conservative: 4–64 non-space chars.
const LABELLED = /\b(pass(?:word|wd|code|phrase)?|pwd|pw|pin|psk|wpa2?|wifi key|key|secret|sip ?pass(?:word)?)\b\s*[:=\-–]?\s*("?)([^\s"]{4,64})\2/gi

function addSecret(map: SecretMap, value: string): string {
  const v = value.trim()
  for (const [h, s] of Object.entries(map)) if (s === v) return h
  const h = `⟦secret:${Object.keys(map).length + 1}⟧`
  map[h] = v
  return h
}

/** Collect known secrets from an item's (sealed) entities into the map. */
export function harvestEntitySecrets(entitiesJson: any, map: SecretMap) {
  for (const e of openEntities(entitiesJson || [])) {
    for (const k of SECRET_KEYS_BY_KIND[e?.kind] || []) {
      const v = e?.fields?.[k]
      if (typeof v === "string" && v.trim().length >= 4) addSecret(map, v)
    }
  }
}

/** Replace every known secret (and labelled-looking secrets) in text with handles. */
export function redactText(text: string, map: SecretMap): string {
  if (!text) return text
  // labelled values first, so they get registered as secrets
  text = text.replace(LABELLED, (m, label, q, val) => {
    if (/^⟦secret:/.test(val)) return m
    const h = addSecret(map, val)
    return m.replace(val, h)
  })
  const known = Object.entries(map).sort((a, b) => b[1].length - a[1].length)
  for (const [h, v] of known) if (v.length >= 4 && text.includes(v)) text = text.split(v).join(h)
  return text
}

/** Recursively redact strings inside a JSON value (for prior extraction etc.). */
export function redactDeep(v: any, map: SecretMap): any {
  if (typeof v === "string") return redactText(v, map)
  if (Array.isArray(v)) return v.map((x) => redactDeep(x, map))
  if (v && typeof v === "object") {
    const out: any = {}
    for (const [k, x] of Object.entries(v)) out[k] = redactDeep(x, map)
    return out
  }
  return v
}

/** Resolve handles inside a model-supplied value to plaintext (server-side only). */
export function resolveHandles(v: string, map: SecretMap): string {
  return v.replace(HANDLE_RE, (h) => map[h] ?? h)
}

/** For UI display: mask any known secret value that slipped into text. */
export function maskForDisplay(text: string, map: SecretMap): string {
  if (!text) return text
  let t = text
  for (const v of Object.values(map).sort((a, b) => b.length - a.length)) if (v.length >= 4) t = t.split(v).join("••••••")
  return t.replace(HANDLE_RE, "••••••")
}
