/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma } from "@/lib/prisma"

// Duplicate detection for Notes Intake: given a client + extracted entities,
// find likely-existing DocHub records so the reviewer can Update instead of
// creating a duplicate. Match keys: asset by serial (exact) then name
// (exact/fuzzy); credential by label/username/url; phone extension by number.

export type MatchCandidate = {
  entityIndex: number
  recordType: "asset" | "credential" | "phone_extension"
  targetId: string
  targetLabel: string
  reason: string
  strong: boolean // exact serial / exact name / exact number → default to Update
}

const serialNorm = (s?: string | null) => (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "")
const nameNorm = (s?: string | null) => (s || "").toLowerCase().trim().replace(/\s+/g, " ")

function lev(a: string, b: string): number {
  const m = a.length, n = b.length
  if (!m) return n
  if (!n) return m
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)])
  for (let j = 1; j <= n; j++) d[0][j] = j
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[m][n]
}
function ratio(a: string, b: string): number {
  const max = Math.max(a.length, b.length)
  return max === 0 ? 1 : 1 - lev(a, b) / max
}

// Best-effort client resolution from free text (a CSV folder/name/url) using an
// alias map + fuzzy name match. Returns null when nothing is confident enough.
export function matchClientText(
  text: string | null | undefined,
  clients: { id: string; name: string }[],
  aliasMap: Record<string, { id: string; name: string }>,
): { id: string; name: string; conf: number } | null {
  const t = nameNorm(text)
  if (!t) return null
  if (aliasMap[t]) return { ...aliasMap[t], conf: 0.97 }
  const exact = clients.find((c) => nameNorm(c.name) === t)
  if (exact) return { id: exact.id, name: exact.name, conf: 0.95 }
  let best: any = null, bestR = 0
  for (const c of clients) { const r = ratio(t, nameNorm(c.name)); if (r > bestR) { bestR = r; best = c } }
  if (best && bestR >= 0.85) return { id: best.id, name: best.name, conf: bestR }
  const sub = clients.find((c) => nameNorm(c.name).length >= 4 && t.includes(nameNorm(c.name)))
  if (sub) return { id: sub.id, name: sub.name, conf: 0.7 }
  return null
}

export async function findMatches(clientId: string, entities: any[]): Promise<MatchCandidate[]> {
  const out: MatchCandidate[] = []
  if (!clientId || !Array.isArray(entities) || entities.length === 0) return out

  const kinds = new Set(entities.map((e) => e?.kind))

  const [assets, creds, exts] = await Promise.all([
    kinds.has("asset")
      ? prisma.asset.findMany({ where: { location: { clientId } }, select: { id: true, name: true, serial: true, make: true, model: true } })
      : Promise.resolve([]),
    kinds.has("credential")
      ? prisma.credential.findMany({ where: { clientId }, select: { id: true, label: true, username: true, url: true } })
      : Promise.resolve([]),
    kinds.has("phone_extension")
      ? prisma.phoneExtension.findMany({ where: { system: { clientId } }, select: { id: true, extension: true, displayName: true } })
      : Promise.resolve([]),
  ])

  entities.forEach((e, idx) => {
    if (!e || e.include === false) return
    const f = e.fields || {}

    if (e.kind === "asset") {
      const sn = serialNorm(f.serial)
      // 1) exact serial
      if (sn.length >= 4) {
        const hit = assets.find((a) => serialNorm(a.serial) === sn)
        if (hit) { out.push({ entityIndex: idx, recordType: "asset", targetId: hit.id, targetLabel: hit.name, reason: `same serial ${f.serial}`, strong: true }); return }
      }
      // 2) exact name (case-insensitive)
      const nn = nameNorm(f.name || e.summary)
      if (nn) {
        const exact = assets.find((a) => nameNorm(a.name) === nn)
        if (exact) { out.push({ entityIndex: idx, recordType: "asset", targetId: exact.id, targetLabel: exact.name, reason: `same name "${exact.name}"`, strong: true }); return }
        // 3) fuzzy name (typos / case), pick best ≥ 0.82
        let best: any = null, bestR = 0
        for (const a of assets) { const r = ratio(nn, nameNorm(a.name)); if (r > bestR) { bestR = r; best = a } }
        if (best && bestR >= 0.82) out.push({ entityIndex: idx, recordType: "asset", targetId: best.id, targetLabel: best.name, reason: `similar name "${best.name}" (${Math.round(bestR * 100)}%)`, strong: false })
      }
    } else if (e.kind === "credential") {
      const label = nameNorm(f.label || e.summary)
      const user = nameNorm(f.username)
      const url = nameNorm(f.url)
      let hit: any = null
      if (label) hit = creds.find((c) => nameNorm(c.label) === label)
      if (!hit && user) hit = creds.find((c) => nameNorm(c.username) === user && (!url || nameNorm(c.url) === url))
      if (hit) out.push({ entityIndex: idx, recordType: "credential", targetId: hit.id, targetLabel: hit.label, reason: label && nameNorm(hit.label) === label ? `same label "${hit.label}"` : `same username "${f.username}"`, strong: !!(label && nameNorm(hit.label) === label) })
    } else if (e.kind === "phone_extension") {
      const num = (f.extension || "").toString().trim()
      if (num) {
        const hit = exts.find((x) => (x.extension || "").trim() === num)
        if (hit) out.push({ entityIndex: idx, recordType: "phone_extension", targetId: hit.id, targetLabel: `ext ${hit.extension}${hit.displayName ? " · " + hit.displayName : ""}`, reason: `same extension ${num}`, strong: true })
      }
    }
  })

  return out
}
