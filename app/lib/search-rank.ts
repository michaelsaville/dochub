/**
 * Pure (isomorphic) ranking helpers for the ⌘K palette. No server imports —
 * used by both app/api/search/route.ts and components/SearchModal.tsx.
 *
 *   matchScore(text, q)  100 exact · 80 prefix · 60 word-prefix · 40 substring · 0 none
 *   parseScopedQuery(q)  "queen > printer" → { clientQ: "queen", rest: "printer" }
 */

export function norm(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/\s+/g, " ").trim()
}

export function matchScore(text: string | null | undefined, q: string): number {
  const t = norm(text)
  const n = norm(q)
  if (!t || !n) return 0
  if (t === n) return 100
  if (t.startsWith(n)) return 80
  // word-prefix: query begins at a word boundary inside the text
  // ("printer" in "HP Printer", "1.20" in "10.0.1.20" does not count)
  const idx = t.indexOf(n)
  if (idx > 0) {
    const prev = t[idx - 1]
    if (/[\s\-_./:@()[\],]/.test(prev)) return 60
    return 40
  }
  // every query word prefixes some text word ("queen motors" → "Queen City Motors")
  const qw = n.split(" ")
  if (qw.length > 1) {
    const tw = t.split(/[\s\-_./:@()[\],]+/)
    if (qw.every((w) => tw.some((x) => x.startsWith(w)))) return 50
  }
  return 0
}

/** Explicit client scoping syntax: `<client> > <query>`. */
export function parseScopedQuery(q: string): { clientQ: string; rest: string } | null {
  const m = q.match(/^\s*([^>]{2,}?)\s*>\s*(.*)$/)
  if (!m) return null
  return { clientQ: m[1].trim(), rest: m[2].trim() }
}
