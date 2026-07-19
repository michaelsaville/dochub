// backfill-secrets.mjs — seal plaintext secrets in existing NoteSuggestion rows.
// Idempotent + verified: for each row it seals secret entity fields (and note
// rawText), immediately re-opens the sealed value, and only writes if it
// round-trips back to the original. Nothing is dropped.
//   ANTHROPIC unused; needs ENCRYPTION_KEY + DATABASE_URL.
import { PrismaClient } from "@prisma/client"
import { sealEntities, sealValue, openValue, isSealed, SECRET_KEYS_BY_KIND } from "../lib/notes-intake-secrets.mjs"

const APPLY = process.argv.includes("--apply")
const prisma = new PrismaClient()
const rows = await prisma.noteSuggestion.findMany()
let updated = 0, alreadySealed = 0, failed = 0, sealedSecrets = 0, sealedRaw = 0

for (const row of rows) {
  const orig = row.entitiesJson || []
  const sealed = sealEntities(orig)

  // verify every secret round-trips
  let ok = true, changed = false
  for (let i = 0; i < orig.length; i++) {
    const keys = SECRET_KEYS_BY_KIND[orig[i]?.kind] || []
    for (const k of keys) {
      const o = orig[i]?.fields?.[k]
      if (o && !isSealed(o)) {
        const s = sealed[i].fields[k]
        if (openValue(s) !== String(o)) { ok = false } else { changed = true; sealedSecrets++ }
      }
    }
  }

  let rawText = row.rawText
  if (["apple-notes", "obsidian"].includes(row.sourceType) && rawText && !isSealed(rawText)) {
    const s = sealValue(rawText)
    if (openValue(s) !== rawText) ok = false
    else { rawText = s; changed = true; sealedRaw++ }
  }

  if (!ok) { failed++; console.error(`[backfill] VERIFY FAILED, skipped: ${row.id} "${row.noteTitle}"`); continue }
  if (!changed) { alreadySealed++; continue }
  if (APPLY) await prisma.noteSuggestion.update({ where: { id: row.id }, data: { entitiesJson: sealed, rawText } })
  updated++
}

await prisma.$disconnect()
console.error(`[backfill] ${APPLY ? "APPLIED" : "DRY-RUN"}: ${updated} rows to seal (${sealedSecrets} secret fields, ${sealedRaw} rawText), ${alreadySealed} already sealed, ${failed} verify-failed`)
if (!APPLY) console.error("[backfill] re-run with --apply to write")
