// Idempotent backfill: PersonalCredential.notes (plaintext) -> encryptedNotes
// Filter on `encryptedNotes IS NULL` so re-runs are safe.
// Wrapped in $transaction so partial failure rolls back cleanly.
//
// Run from project root:
//   DATABASE_URL=... ENCRYPTION_KEY=... node scripts/backfill-personal-credential-notes.mjs

import { PrismaClient } from '@prisma/client'
import crypto from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'

function getKey() {
  const k = process.env.ENCRYPTION_KEY
  if (!k) throw new Error('ENCRYPTION_KEY not set')
  return Buffer.from(k, 'hex')
}

function encrypt(text) {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('hex'), tag.toString('hex'), encrypted.toString('hex')].join(':')
}

function decrypt(encoded) {
  const [ivHex, tagHex, encryptedHex] = encoded.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const encrypted = Buffer.from(encryptedHex, 'hex')
  const d = crypto.createDecipheriv(ALGORITHM, getKey(), iv)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(encrypted), d.final()]).toString('utf8')
}

const prisma = new PrismaClient()

try {
  // Key fingerprint guard — log SHA256 so any future re-run can compare
  const fingerprint = crypto.createHash('sha256').update(getKey()).digest('hex').slice(0, 16)
  console.log(`ENCRYPTION_KEY fingerprint (first 16 of SHA256): ${fingerprint}`)

  const candidates = await prisma.personalCredential.findMany({
    where: { notes: { not: null }, encryptedNotes: null },
    select: { id: true, label: true, notes: true },
  })
  console.log(`Candidates to backfill: ${candidates.length}`)

  let updated = 0
  await prisma.$transaction(async (tx) => {
    for (const c of candidates) {
      const ciphertext = encrypt(c.notes)
      // Round-trip check before write
      const decoded = decrypt(ciphertext)
      if (decoded !== c.notes) {
        throw new Error(`Round-trip mismatch on ${c.id} (${c.label}) — aborting`)
      }
      await tx.personalCredential.update({
        where: { id: c.id },
        data: { encryptedNotes: ciphertext },
      })
      updated++
    }
  })
  console.log(`Updated: ${updated}`)

  // Verification: every row with plaintext notes now has ciphertext
  const counts = await prisma.$queryRaw`
    SELECT
      COUNT(*) FILTER (WHERE "notes" IS NOT NULL) AS with_plaintext,
      COUNT(*) FILTER (WHERE "encryptedNotes" IS NOT NULL) AS with_cipher,
      COUNT(*) FILTER (WHERE "notes" IS NOT NULL AND "encryptedNotes" IS NULL) AS unmigrated
    FROM "PersonalCredential"
  `
  console.log('Verification:', counts[0])

  if (counts[0].unmigrated > 0n) {
    throw new Error(`${counts[0].unmigrated} unmigrated rows remain!`)
  }
  console.log('OK — all plaintext notes have a ciphertext counterpart')
} catch (e) {
  console.error('FAILED:', e.message)
  process.exit(1)
} finally {
  await prisma.$disconnect()
}
