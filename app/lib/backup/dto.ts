// JSON-safe DTO mappers for the platform-backup API. Prisma returns BigInt for
// sizeBytes, which NextResponse.json() cannot serialize — coerce to number.

type RunRow = {
  id: string
  kind: string
  status: string
  scope: string
  clientId: string | null
  startedAt: Date
  finishedAt: Date | null
  storagePath: string | null
  sizeBytes: bigint | null
  sha256: string | null
  itemCounts: unknown
  secretsMode: string
  includeUploads: boolean
  encrypted: boolean
  verifiedAt: Date | null
  verifyStatus: string | null
  error: string | null
  triggeredBy: string | null
}

export function runToDto(r: RunRow) {
  return {
    id: r.id,
    kind: r.kind,
    status: r.status,
    scope: r.scope,
    clientId: r.clientId,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    hasFile: !!r.storagePath,
    sizeBytes: r.sizeBytes == null ? null : Number(r.sizeBytes),
    sha256: r.sha256,
    itemCounts: r.itemCounts ?? null,
    secretsMode: r.secretsMode,
    includeUploads: r.includeUploads,
    encrypted: r.encrypted,
    verifiedAt: r.verifiedAt,
    verifyStatus: r.verifyStatus,
    error: r.error,
    triggeredBy: r.triggeredBy,
  }
}

type ScheduleRow = {
  id: string
  enabled: boolean
  frequency: string
  hourUtc: number
  weekday: number | null
  retentionCount: number
  maxAgeDays: number | null
  includeUploads: boolean
  secretsMode: string
  target: string
  s3Bucket: string | null
  s3Prefix: string | null
  s3Endpoint: string | null
  s3AccessKey: string | null
  s3SecretKeyEnc: string | null
  lastRunAt: Date | null
  nextRunAt: Date | null
  updatedAt: Date
}

/** Schedule DTO — NEVER leaks the encrypted S3 secret; only whether one is set. */
export function scheduleToDto(s: ScheduleRow) {
  return {
    id: s.id,
    enabled: s.enabled,
    frequency: s.frequency,
    hourUtc: s.hourUtc,
    weekday: s.weekday,
    retentionCount: s.retentionCount,
    maxAgeDays: s.maxAgeDays,
    includeUploads: s.includeUploads,
    secretsMode: s.secretsMode,
    target: s.target,
    s3Bucket: s.s3Bucket,
    s3Prefix: s.s3Prefix,
    s3Endpoint: s.s3Endpoint,
    s3AccessKey: s.s3AccessKey,
    s3SecretKeySet: !!s.s3SecretKeyEnc,
    lastRunAt: s.lastRunAt,
    nextRunAt: s.nextRunAt,
    updatedAt: s.updatedAt,
  }
}
