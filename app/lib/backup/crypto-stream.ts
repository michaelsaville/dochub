import crypto from "crypto"
import { createReadStream, createWriteStream } from "fs"
import { stat } from "fs/promises"
import type { Readable, Writable } from "stream"

// ─── Streaming AES-256-GCM envelope for platform backup artifacts (.dhb) ──────
//
// A dedicated BACKUP_ENCRYPTION_KEY (64-hex → 32 bytes) is used so a bundle that
// carries *decrypted* client secrets is still encrypted-at-rest under a key that
// is SEPARATE from the app's ENCRYPTION_KEY (blast-radius isolation).
//
// File layout (all one file, streamed, never fully buffered):
//   [ MAGIC "DHB1" (4) ][ VERSION (1) ][ IV (12) ][ CIPHERTEXT … ][ GCM TAG (16) ]
//                       └──────── 17-byte header ────────┘
//
// The 16-byte GCM auth tag is only known after cipher.final(), so it is appended
// at the END. Decrypt/verify reads the tag off the tail first, sets it, then
// streams the ciphertext region through the decipher — so the whole thing stays
// O(1) in memory regardless of backup size.

export const MAGIC = Buffer.from("DHB1", "ascii")
export const VERSION = 1
export const HEADER_LEN = MAGIC.length + 1 + 12 // 4 + 1 + 12 = 17
export const TAG_LEN = 16
const ALGO = "aes-256-gcm"

export function getBackupKey(): Buffer {
  const hex = process.env.BACKUP_ENCRYPTION_KEY
  if (!hex) throw new Error("BACKUP_ENCRYPTION_KEY is not set")
  const key = Buffer.from(hex, "hex")
  if (key.length !== 32) {
    throw new Error(`BACKUP_ENCRYPTION_KEY must be 64 hex chars (32 bytes); got ${key.length} bytes`)
  }
  return key
}

/** True when a usable dedicated backup key is configured. */
export function backupKeyConfigured(): boolean {
  try {
    getBackupKey()
    return true
  } catch {
    return false
  }
}

/**
 * Encrypt `source` (already gzipped bytes) into `destPath` as a `.dhb` envelope.
 * Returns the sha256 of the COMPLETE file (header + ciphertext + tag) and its
 * byte length, so the run row can store an integrity checksum + size.
 */
export function encryptStreamToFile(
  source: Readable,
  destPath: string,
): Promise<{ sha256: string; sizeBytes: number }> {
  return new Promise((resolve, reject) => {
    const key = getBackupKey()
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv(ALGO, key, iv)
    const hash = crypto.createHash("sha256")
    const out = createWriteStream(destPath)
    let size = 0
    let settled = false

    const fail = (e: unknown) => {
      if (settled) return
      settled = true
      out.destroy()
      reject(e instanceof Error ? e : new Error(String(e)))
    }

    // Every byte that lands in the file is also folded into the running sha256
    // and the size counter. Backpressure: pause the cipher when the sink is full.
    const writeChunk = (buf: Buffer) => {
      size += buf.length
      hash.update(buf)
      const ok = out.write(buf)
      if (!ok) {
        cipher.pause()
        out.once("drain", () => cipher.resume())
      }
    }

    out.on("error", fail)
    source.on("error", fail)
    cipher.on("error", fail)

    // 1) header up front
    writeChunk(Buffer.concat([MAGIC, Buffer.from([VERSION]), iv]))

    // 2) ciphertext as it flows
    cipher.on("data", (c: Buffer) => writeChunk(c))

    // 3) tag on the tail, then close
    cipher.on("end", () => {
      try {
        const tag = cipher.getAuthTag()
        size += tag.length
        hash.update(tag)
        out.end(tag, () => {
          if (settled) return
          settled = true
          resolve({ sha256: hash.digest("hex"), sizeBytes: size })
        })
      } catch (e) {
        fail(e)
      }
    })

    source.pipe(cipher)
  })
}

/** Compute the sha256 of an existing file, streaming (used by verify). */
export function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256")
    const rs = createReadStream(filePath)
    rs.on("error", reject)
    rs.on("data", (d) => hash.update(d))
    rs.on("end", () => resolve(hash.digest("hex")))
  })
}

/** Read + validate the 17-byte header; returns the IV. Throws on bad magic. */
export async function readHeader(filePath: string): Promise<{ iv: Buffer; version: number }> {
  return new Promise((resolve, reject) => {
    const rs = createReadStream(filePath, { start: 0, end: HEADER_LEN - 1 })
    const chunks: Buffer[] = []
    rs.on("error", reject)
    rs.on("data", (d) => chunks.push(d as Buffer))
    rs.on("end", () => {
      const head = Buffer.concat(chunks)
      if (head.length < HEADER_LEN) return reject(new Error("truncated: header too short"))
      if (!head.subarray(0, MAGIC.length).equals(MAGIC)) return reject(new Error("bad magic (not a .dhb file)"))
      const version = head[MAGIC.length]
      const iv = head.subarray(MAGIC.length + 1, HEADER_LEN)
      resolve({ iv, version })
    })
  })
}

/**
 * Decrypt a `.dhb` file, piping the recovered gzip bytes into `dest`. The GCM
 * tag (last 16 bytes) is read first and set on the decipher, so `final()` will
 * throw if the ciphertext was tampered with. Streams the ciphertext region only
 * — never buffers the whole file. Used by verify (dest = a gunzip probe sink)
 * and by the restore CLI (dest = a gunzip → file).
 */
export async function decryptFileToStream(filePath: string, dest: Writable): Promise<void> {
  const key = getBackupKey()
  const size = (await stat(filePath)).size
  if (size < HEADER_LEN + TAG_LEN) throw new Error("file too small to be a valid backup")

  const { iv, version } = await readHeader(filePath)
  if (version !== VERSION) throw new Error(`unsupported backup version ${version}`)

  // Pull the tag off the tail.
  const tag = await new Promise<Buffer>((resolve, reject) => {
    const rs = createReadStream(filePath, { start: size - TAG_LEN, end: size - 1 })
    const chunks: Buffer[] = []
    rs.on("error", reject)
    rs.on("data", (d) => chunks.push(d as Buffer))
    rs.on("end", () => resolve(Buffer.concat(chunks)))
  })

  const decipher = crypto.createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)

  await new Promise<void>((resolve, reject) => {
    const cipherText = createReadStream(filePath, { start: HEADER_LEN, end: size - TAG_LEN - 1 })
    cipherText.on("error", reject)
    decipher.on("error", reject)
    dest.on("error", reject)
    dest.on("finish", () => resolve())
    cipherText.pipe(decipher).pipe(dest)
  })
}
