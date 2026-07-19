import crypto from "crypto"
import { prisma } from "@/lib/prisma"
import { matchClientText } from "@/lib/notes-intake-match"
import type { CsvCred } from "@/lib/notes-intake-csv"

// Stage a batch of structured credential rows (from a CSV or an otpauth paste)
// as NoteSuggestions, deterministically matched to a client. No AI. Shared by
// /api/notes-intake/import-csv and /import-otpauth.
export async function stageCredentialSuggestions(
  rows: CsvCred[],
  opts: { source: string; sourceType: string; label: string },
): Promise<{ created: number; matched: number; unmatched: number; dup: number; withTotp: number }> {
  const [clients, aliasRows] = await Promise.all([
    prisma.client.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.clientAlias.findMany({ select: { alias: true, clientId: true, clientName: true } }),
  ])
  const aliasMap: Record<string, { id: string; name: string }> = {}
  for (const a of aliasRows) aliasMap[a.alias] = { id: a.clientId, name: a.clientName || "" }

  const batch = await prisma.noteIntakeBatch.create({ data: { source: opts.source, model: `${opts.source}-import`, status: "RUNNING" } })

  let created = 0, matched = 0, unmatched = 0, dup = 0, withTotp = 0
  for (const row of rows) {
    const hash = crypto.createHash("sha256").update(`${row.name}|${row.username || ""}|${row.url || ""}`).digest("hex").slice(0, 16)
    if (await prisma.noteSuggestion.findFirst({ where: { noteHash: hash }, select: { id: true } })) { dup++; continue }

    let m: { id: string; name: string; conf: number } | null = null
    let on = ""
    for (const [field, val] of [["folder", row.folder], ["name", row.name], ["url", row.url]] as const) {
      if (!val) continue
      const hit = matchClientText(val, clients, aliasMap)
      if (hit) { m = hit; on = field; break }
    }
    if (m) matched++; else unmatched++
    if (row.totp) withTotp++

    const entity = {
      kind: "credential", summary: row.name, confidence: null, include: true, mode: "create",
      sourceSnippet: `${opts.label}: ${row.name}${row.username ? " · " + row.username : ""}`,
      fields: { label: row.name, username: row.username || null, password: row.password || null, totp: row.totp || null, url: row.url || null, notes: row.notes || null },
    }
    await prisma.noteSuggestion.create({
      data: {
        batchId: batch.id, origin: opts.source, sourceType: opts.sourceType,
        sourcePath: `${opts.source}/${opts.label}/${row.name}`.slice(0, 300), sourceFolder: row.folder || opts.label,
        noteTitle: row.name, noteHash: hash,
        rawText: `Imported from ${opts.label}\nName: ${row.name}\nUser: ${row.username || "—"}\nURL: ${row.url || "—"}\nPassword: ${row.password ? "(present)" : "—"}\nTOTP: ${row.totp ? "(present)" : "—"}`,
        status: "PENDING", isRelevant: true, relevanceReason: `Credential from ${opts.label}`,
        matchedClientId: m ? m.id : null, matchedClientName: m ? m.name : null,
        clientConfidence: m ? m.conf : null,
        clientReasoning: m ? `${opts.source} ${on} match` : "No client match — assign manually",
        entitiesJson: [entity],
      },
    })
    created++
  }

  await prisma.noteIntakeBatch.update({ where: { id: batch.id }, data: { status: "DONE", notesTotal: rows.length, notesRelevant: created } })
  return { created, matched, unmatched, dup, withTotp }
}
