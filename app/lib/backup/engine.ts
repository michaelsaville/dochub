import { prisma } from "@/lib/prisma"
import { Readable, Writable } from "stream"
import { createReadStream } from "fs"
import { mkdir, stat, unlink } from "fs/promises"
import path from "path"
import zlib from "zlib"
import { encryptStreamToFile, sha256File, decryptFileToStream } from "./crypto-stream"
import { serializeDataset, type ItemCounts, type SerializeOpts, type SecretsMode, type BackupScope } from "./serialize"

// ─── Platform backup engine ───────────────────────────────────────────────────
// One entry point: runBackup() creates a PlatformBackupRun, streams the dataset
// → gzip → AES-256-GCM (BACKUP_ENCRYPTION_KEY) → a `.dhb` file, records size +
// sha256 + item counts, then prunes old runs per retention. verifyBackup()
// re-reads a written artifact and confirms its checksum + GCM integrity.

export const BACKUP_DIR = process.env.BACKUP_DIR || "/app/data/backups"

export type RunKind = "scheduled" | "manual" | "export"

export type RunBackupArgs = {
  scope: BackupScope
  clientId?: string | null
  secretsMode: SecretsMode
  includeUploads: boolean
  kind: RunKind
  triggeredBy?: string | null
}

function utcStamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0")
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `_${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`
  )
}

/**
 * Run a backup end-to-end. Returns the finished PlatformBackupRun row. Errors are
 * caught and recorded on the run (status="failed"); the promise still resolves so
 * callers (API/cron) can surface the run either way.
 */
export async function runBackup(args: RunBackupArgs) {
  const run = await prisma.platformBackupRun.create({
    data: {
      kind: args.kind,
      status: "running",
      scope: args.scope,
      clientId: args.clientId ?? null,
      secretsMode: args.secretsMode,
      includeUploads: args.includeUploads,
      encrypted: true,
      triggeredBy: args.triggeredBy ?? null,
    },
  })

  try {
    await mkdir(BACKUP_DIR, { recursive: true })
    const fileName = `backup-${utcStamp()}-${run.id.slice(-6)}.dhb`
    const destPath = path.join(BACKUP_DIR, fileName)

    const counts: ItemCounts = {}
    const opts: SerializeOpts = {
      scope: args.scope,
      clientId: args.clientId ?? null,
      secretsMode: args.secretsMode,
      includeUploads: args.includeUploads,
    }

    // NDJSON (strings) → gzip → cipher → file, all streamed.
    const src = Readable.from(serializeDataset(opts, counts))
    const gzip = zlib.createGzip()
    src.on("error", (e) => gzip.destroy(e))
    src.pipe(gzip)

    const { sha256, sizeBytes } = await encryptStreamToFile(gzip, destPath)

    const finished = await prisma.platformBackupRun.update({
      where: { id: run.id },
      data: {
        status: "success",
        finishedAt: new Date(),
        storagePath: destPath,
        sizeBytes: BigInt(sizeBytes),
        sha256,
        itemCounts: counts as unknown as object,
      },
    })

    // Retention only applies to the recurring self-backup set, never to
    // on-demand exports (those expire on their own 48h clock elsewhere).
    if (args.kind === "scheduled" || args.kind === "manual") {
      await applyRetention().catch(() => {})
    }

    return finished
  } catch (e) {
    return prisma.platformBackupRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        finishedAt: new Date(),
        error: (e as Error).message?.slice(0, 500) ?? "backup failed",
      },
    })
  }
}

/**
 * Re-read a run's artifact and confirm integrity:
 *   missing            — no storagePath, or file gone from disk
 *   checksum_mismatch  — recomputed sha256 != stored sha256 (bit-rot / tamper)
 *   undecryptable      — GCM auth tag fails or the gzip magic is wrong
 *   ok                 — checksum matches AND it decrypts + gunzips cleanly
 * Writes verifiedAt + verifyStatus and returns the updated run.
 */
export async function verifyBackup(runId: string) {
  const run = await prisma.platformBackupRun.findUnique({ where: { id: runId } })
  if (!run) throw new Error("run not found")

  let status: string
  if (!run.storagePath) {
    status = "missing"
  } else {
    try {
      await stat(run.storagePath)
    } catch {
      status = "missing"
      return prisma.platformBackupRun.update({
        where: { id: runId },
        data: { verifiedAt: new Date(), verifyStatus: status },
      })
    }

    // 1) cheap checksum pass (catches bit-rot without decrypting)
    if (run.sha256) {
      const actual = await sha256File(run.storagePath).catch(() => null)
      if (actual !== run.sha256) {
        return prisma.platformBackupRun.update({
          where: { id: runId },
          data: { verifiedAt: new Date(), verifyStatus: "checksum_mismatch" },
        })
      }
    }

    // 2) full GCM + gzip probe (decrypt everything, discard the plaintext)
    try {
      const gunzip = zlib.createGunzip()
      const sink = new Writable({ write: (_c, _e, cb) => cb() })
      gunzip.pipe(sink)
      await decryptFileToStream(run.storagePath, gunzip)
      status = "ok"
    } catch {
      status = "undecryptable"
    }
  }

  return prisma.platformBackupRun.update({
    where: { id: runId },
    data: { verifiedAt: new Date(), verifyStatus: status },
  })
}

/**
 * Prune the recurring backup set to the schedule's retentionCount and maxAgeDays.
 * Deletes BOTH the on-disk file and the run row (a row-only prune would let the
 * disk fill). Never touches export-kind runs.
 */
export async function applyRetention() {
  const schedule = await prisma.platformBackupSchedule.findUnique({ where: { id: "default" } })
  const retentionCount = schedule?.retentionCount ?? 14
  const maxAgeDays = schedule?.maxAgeDays ?? null

  const runs = await prisma.platformBackupRun.findMany({
    where: { kind: { in: ["scheduled", "manual"] }, status: "success" },
    orderBy: { startedAt: "desc" },
  })

  const cutoff = maxAgeDays ? Date.now() - maxAgeDays * 86_400_000 : null
  const doomed = runs.filter((r, idx) => {
    if (idx >= retentionCount) return true
    if (cutoff && r.startedAt.getTime() < cutoff) return true
    return false
  })

  for (const r of doomed) {
    if (r.storagePath) await unlink(r.storagePath).catch(() => {})
    await prisma.platformBackupRun.delete({ where: { id: r.id } }).catch(() => {})
  }
  return { pruned: doomed.length }
}

/** Open a read stream over a run's raw encrypted artifact (for download). */
export function openArtifactStream(storagePath: string): Readable {
  return createReadStream(storagePath)
}
