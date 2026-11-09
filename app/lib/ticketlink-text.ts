/**
 * Pure helpers for the TicketHub link (no server-only / prisma imports so
 * they can be unit-checked with plain node). Re-exported from lib/ticketlink.
 */

// ---------------------------------------------------------------------------
// Keyword relevance — deliberately simple. Tokens from the ticket subject (and
// linked asset name) scored against a haystack string.
// ---------------------------------------------------------------------------

const STOP = new Set(
  "the and for with from that this have has not are was were but can cant can't does doesnt doesn't wont won't will into onto out off our your their its it's please need needs help issue issues problem problems working work not new set up setup client user users ticket call called today again still when what why how after before also just".split(
    " ",
  ),
)

export function keywords(...parts: (string | null | undefined)[]): string[] {
  const out = new Set<string>()
  for (const p of parts) {
    if (!p) continue
    for (const raw of p.toLowerCase().split(/[^a-z0-9.\-]+/)) {
      const t = raw.replace(/^[.\-]+|[.\-]+$/g, "")
      if (t.length >= 3 && !STOP.has(t) && !/^\d+$/.test(t)) out.add(t)
    }
  }
  return [...out].slice(0, 20)
}

export function score(tokens: string[], ...hay: (string | null | undefined)[]): number {
  if (!tokens.length) return 0
  const h = hay.filter(Boolean).join(" ").toLowerCase()
  if (!h) return 0
  let s = 0
  for (const t of tokens) if (h.includes(t)) s++
  return s
}

// ---------------------------------------------------------------------------
// Secret scrubbing for text that leaves TicketHub on its way to a model and a
// stored document. Belt-and-braces: TicketHub strips too, and the model is told
// never to write a credential. Errs toward over-redacting.
// ---------------------------------------------------------------------------

// "password: x", "api key = x", "the wifi key is x" — explicit separator.
const KEYWORD_SEP =
  /\b(pass(?:word|wd|code|phrase)?|pwd|pw|pin|secret|api[\s_-]?key|token|wpa2?(?:[\s_-]?key)?|psk|wi-?fi\s+(?:key|password)|network\s+key|(?:license|product|recovery)\s+key)(\s*(?:\bis\b|\bwas\b|=|:|->|=>)\s*)("[^"\n]*"|'[^'\n]*'|\S+)/gi
// "pw Hunter2", "password Hunter2" — whitespace only, for unambiguous words.
const KEYWORD_WS = /\b(password|passwd|pwd|pw|passcode)(\s+)(?!is\b|was\b|reset|change|expired|for\b|to\b|on\b|the\b)("[^"\n]*"|'[^'\n]*'|\S+)/gi

export function redactSecrets(input: string): string {
  if (!input) return input
  let s = input
  // PEM blocks / private keys
  s = s.replace(/-----BEGIN [A-Z ]+-----[\s\S]*?-----END [A-Z ]+-----/g, "[REDACTED KEY BLOCK]")
  // URLs with inline credentials: scheme://user:pass@host
  s = s.replace(/(\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+):[^\s@/]+@/gi, "$1:[REDACTED]@")
  // "password: hunter2", "pw hunter2", "the wifi key is abc123"
  s = s.replace(KEYWORD_SEP, (_m, k: string, sep: string) => `${k}${sep}[REDACTED]`)
  s = s.replace(KEYWORD_WS, (_m, k: string, sep: string) => `${k}${sep}[REDACTED]`)
  // "PIN 4455", "code 1234#" — numeric codes after an obvious word
  s = s.replace(/\b(pin|passcode|alarm\s+code|door\s+code|gate\s+code)(\s+)(\d{3,10}#?)/gi, "$1$2[REDACTED]")
  // Well-known token shapes
  s = s.replace(/\b(sk-[A-Za-z0-9_-]{16,}|sk_live_[A-Za-z0-9]{16,}|rk_live_[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|xox[abpr]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16})\b/g, "[REDACTED]")
  // Long opaque blobs (hex / base64-ish, 32+ chars, mixed class) — keys, hashes, tokens
  s = s.replace(/\b(?=[A-Za-z0-9+/_=-]{32,}\b)(?=[^\s]*\d)(?=[^\s]*[A-Za-z])[A-Za-z0-9+/_=-]{32,}\b/g, "[REDACTED]")
  return s
}

/** reviewDueAt for a save at `from` when an interval is set; null otherwise. */
export function nextReviewDue(intervalDays: number | null | undefined, from = new Date()): Date | null {
  if (!intervalDays || intervalDays <= 0) return null
  return new Date(from.getTime() + intervalDays * 86_400_000)
}

/** Parse a review-interval field from a request body: undefined = untouched, null = cleared. */
export function parseInterval(v: unknown): number | null | undefined {
  if (v === undefined) return undefined
  if (v === null || v === "" || v === 0 || v === "0") return null
  const n = typeof v === "number" ? v : parseInt(String(v), 10)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.min(Math.round(n), 3650)
}

/** ISO-8601 week key, e.g. "2026-W46" — the cron's "one ticket per client per week" bucket. */
export function isoWeekKey(d = new Date()): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`
}
