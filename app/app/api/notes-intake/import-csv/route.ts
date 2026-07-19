/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server"
import crypto from "crypto"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { parseCsvCreds } from "@/lib/notes-intake-csv"
import { matchClientText } from "@/lib/notes-intake-match"

// POST /api/notes-intake/import-csv — multipart CSV (password-manager / TOTP
// export). Each row becomes a credential suggestion, deterministically matched
// to a client (folder → name → url). No AI, so it works without API credits.
export async function POST(req: Request) {
  const { error } = await requireAuth()
  if (error) return error

  let formData: FormData
  try { formData = await req.formData() } catch { return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 }) }
  const file = (formData.getAll("files").find((f) => f instanceof File) || formData.get("file")) as File | null
  if (!file) return NextResponse.json({ error: "No CSV file" }, { status: 400 })

  const text = Buffer.from(await file.arrayBuffer()).toString("utf-8")
  let parsed
  try { parsed = parseCsvCreds(text) } catch (e: any) { return NextResponse.json({ error: `CSV parse failed: ${e?.message || e}` }, { status: 400 }) }
  if (parsed.rows.length === 0) {
    return NextResponse.json({ error: `No importable rows. Detected columns: ${parsed.headers.join(", ")}. Need at least a password or TOTP column.` }, { status: 400 })
  }

  const [clients, aliasRows] = await Promise.all([
    prisma.client.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.clientAlias.findMany({ select: { alias: true, clientId: true, clientName: true } }),
  ])
  const aliasMap: Record<string, { id: string; name: string }> = {}
  for (const a of aliasRows) aliasMap[a.alias] = { id: a.clientId, name: a.clientName || "" }

  const batch = await prisma.noteIntakeBatch.create({ data: { source: "csv", model: "csv-import", status: "RUNNING" } })

  let created = 0, matched = 0, unmatched = 0, dup = 0, withTotp = 0
  for (const row of parsed.rows) {
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
      sourceSnippet: `CSV row: ${row.name}${row.username ? " · " + row.username : ""}`,
      fields: { label: row.name, username: row.username || null, password: row.password || null, totp: row.totp || null, url: row.url || null, notes: row.notes || null },
    }
    await prisma.noteSuggestion.create({
      data: {
        batchId: batch.id, origin: "csv", sourceType: "csv",
        sourcePath: `csv/${file.name}/${row.name}`.slice(0, 300), sourceFolder: row.folder || file.name,
        noteTitle: row.name, noteHash: hash,
        rawText: `Imported from ${file.name}\nName: ${row.name}\nUser: ${row.username || "—"}\nURL: ${row.url || "—"}\nPassword: ${row.password ? "(present)" : "—"}\nTOTP: ${row.totp ? "(present)" : "—"}`,
        status: "PENDING", isRelevant: true,
        relevanceReason: "Credential from CSV import",
        matchedClientId: m ? m.id : null, matchedClientName: m ? m.name : null,
        clientConfidence: m ? m.conf : null,
        clientReasoning: m ? `CSV ${on} match` : "No client match — assign manually",
        entitiesJson: [entity],
      },
    })
    created++
  }

  await prisma.noteIntakeBatch.update({ where: { id: batch.id }, data: { status: "DONE", notesTotal: parsed.rows.length, notesRelevant: created } })
  return NextResponse.json({ created, matched, unmatched, dup, withTotp, mapped: parsed.mapped, headers: parsed.headers })
}
