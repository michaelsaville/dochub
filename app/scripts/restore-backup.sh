#!/usr/bin/env bash
#
# ==============================================================================
#  DocHub PLATFORM BACKUP — DISASTER-RECOVERY RESTORE (CLI ONLY)
# ==============================================================================
#
#  This is a DR TOOL. It is intentionally NOT wired to any HTTP route or UI
#  button — restoring clobbers data, so it must be a deliberate, offline,
#  human-run operation against an EMPTY database.
#
#  What it does:
#    1) Decrypts a .dhb artifact (AES-256-GCM, keyed by BACKUP_ENCRYPTION_KEY)
#    2) Gunzips it to relational NDJSON (one {"__model": "...", ...} record/line)
#    3) Prints the operator runbook for loading that NDJSON into a fresh DB.
#
#  The .dhb envelope (see app/lib/backup/crypto-stream.ts):
#    [ MAGIC "DHB1" (4B) ][ VERSION (1B) ][ IV (12B) ][ CIPHERTEXT ][ GCM TAG (16B) ]
#
#  KEY LOSS = TOTAL LOSS. Without BACKUP_ENCRYPTION_KEY the artifact is
#  unrecoverable. Store the key offsite; it is documented in Credentials.md as
#  unrecoverable-if-lost.
#
#  Usage:
#    BACKUP_ENCRYPTION_KEY=<64-hex> ./scripts/restore-backup.sh backup-XXXX.dhb [out.ndjson]
#
# ==============================================================================
set -euo pipefail

IN="${1:-}"
OUT="${2:-restored.ndjson}"

if [[ -z "$IN" ]]; then
  echo "usage: BACKUP_ENCRYPTION_KEY=<64-hex> $0 <backup.dhb> [out.ndjson]" >&2
  exit 2
fi
if [[ ! -f "$IN" ]]; then
  echo "error: input file not found: $IN" >&2
  exit 2
fi
if [[ -z "${BACKUP_ENCRYPTION_KEY:-}" ]]; then
  echo "error: BACKUP_ENCRYPTION_KEY is not set (64 hex chars)." >&2
  exit 2
fi

echo ">> Decrypting + gunzipping $IN -> $OUT"

# Decrypt + gunzip in one streaming node pass (matches lib/backup/crypto-stream.ts).
# Node ships in the app image; openssl cannot do the tag-on-tail GCM layout cleanly.
node - "$IN" "$OUT" <<'NODE'
const fs = require("fs")
const zlib = require("zlib")
const crypto = require("crypto")

const [, , inPath, outPath] = process.argv
const MAGIC = Buffer.from("DHB1", "ascii")
const HEADER_LEN = 4 + 1 + 12
const TAG_LEN = 16

const key = Buffer.from(process.env.BACKUP_ENCRYPTION_KEY, "hex")
if (key.length !== 32) { console.error("BACKUP_ENCRYPTION_KEY must be 64 hex chars (32 bytes)"); process.exit(1) }

const size = fs.statSync(inPath).size
if (size < HEADER_LEN + TAG_LEN) { console.error("file too small to be a valid .dhb"); process.exit(1) }

const fd = fs.openSync(inPath, "r")
const header = Buffer.alloc(HEADER_LEN)
fs.readSync(fd, header, 0, HEADER_LEN, 0)
if (!header.subarray(0, 4).equals(MAGIC)) { console.error("bad magic — not a .dhb file"); process.exit(1) }
const version = header[4]
if (version !== 1) { console.error("unsupported version " + version); process.exit(1) }
const iv = header.subarray(5, HEADER_LEN)

const tag = Buffer.alloc(TAG_LEN)
fs.readSync(fd, tag, 0, TAG_LEN, size - TAG_LEN)
fs.closeSync(fd)

const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv)
decipher.setAuthTag(tag)

const cipherStream = fs.createReadStream(inPath, { start: HEADER_LEN, end: size - TAG_LEN - 1 })
const gunzip = zlib.createGunzip()
const out = fs.createWriteStream(outPath)

cipherStream.on("error", (e) => { console.error("read error:", e.message); process.exit(1) })
decipher.on("error", (e) => { console.error("DECRYPT FAILED (bad key or tampered file):", e.message); process.exit(1) })
gunzip.on("error", (e) => { console.error("gunzip error:", e.message); process.exit(1) })
out.on("finish", () => console.error("   ok — GCM auth tag verified, gunzip clean"))

cipherStream.pipe(decipher).pipe(gunzip).pipe(out)
NODE

LINES=$(wc -l < "$OUT" | tr -d ' ')
echo ">> Wrote $OUT ($LINES NDJSON records)"
echo ""
cat <<'RUNBOOK'
================================================================================
 NEXT STEPS — load the NDJSON into an EMPTY database (manual, deliberate)
================================================================================

 The first line is a {"__model":"__manifest", ...} record (schemaVersion, scope,
 secretsMode, counts). Every other line is {"__model":"<delegate>", ...fields}.
 FK cuids are preserved verbatim, and sections are emitted PARENT-FIRST, so a
 loader that inserts in file order satisfies most foreign keys.

 1) Stand up a FRESH, EMPTY DocHub database (never restore over live data):
        createdb dochub_restore
        DATABASE_URL=postgres://.../dochub_restore npx prisma migrate deploy
        # (or: npx --yes prisma@6 db push  — see feedback_prisma_version_pin)

 2) Load the records. Group by __model and insert per model in file order,
    preserving the `id` cuids. A starter loader (adapt as needed):

        // load-ndjson.mjs
        import { PrismaClient } from "@prisma/client"
        import { createInterface } from "readline"
        import { createReadStream } from "fs"
        const db = new PrismaClient()
        const rl = createInterface({ input: createReadStream(process.argv[2]) })
        // BigInt columns (e.g. AuditLog.seq, PlatformBackupRun.sizeBytes,
        // ClientAttachment.sizeBytes) arrive as strings — coerce before insert.
        for await (const line of rl) {
          if (!line.trim()) continue
          const { __model, ...row } = JSON.parse(line)
          if (__model.startsWith("__")) continue        // manifest / upload / error markers
          try { await db[__model].create({ data: coerce(__model, row) }) }
          catch (e) { console.error(__model, row.id, e.message) }  // dupes/FK gaps -> triage
        }

    Tips:
      - Deferrable constraints or a second pass will pick up any forward FK edges.
      - secretsMode "ciphertext" rows restore as-is IF the target app shares the
        SAME ENCRYPTION_KEY. secretsMode "decrypted" rows carry plaintext under
        `decrypted<Field>` and null encrypted<Field> — re-encrypt on the way in.

 3) Uploaded files (only present when the backup was taken with includeUploads):
    records tagged {"__model":"__upload", storageName, base64, ...}. Decode each
    base64 back to UPLOAD_DIR/<storageName> (default /uploads).

 4) Point the app at the restored DB, boot, and verify counts against the
    manifest's itemCounts before cutting over.

 REMINDER: local /backups on the same disk as the DB volume is NOT real DR.
 Keep an offsite copy (rsync / S3 / MinIO) of both the .dhb and the KEY.
================================================================================
RUNBOOK
