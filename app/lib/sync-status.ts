import { prisma } from "@/lib/prisma"

export type SyncStatus = "OK" | "ERROR" | "DEGRADED" | "UNCONFIGURED"

/**
 * Upsert the per-integration sync status. Crons should call this at the
 * end of every run so Settings can show "last ran X ago, OK" or surface
 * the most recent error.
 */
export async function recordSyncStatus(
  key: string,
  status: SyncStatus,
  message?: string | null,
  detail?: Record<string, unknown> | null,
): Promise<void> {
  try {
    await prisma.integrationSyncStatus.upsert({
      where: { key },
      create: {
        key,
        status,
        lastRunAt: new Date(),
        message: message ?? null,
        detail: detail ? (detail as any) : undefined,
      },
      update: {
        status,
        lastRunAt: new Date(),
        message: message ?? null,
        detail: detail ? (detail as any) : undefined,
      },
    })
  } catch (e) {
    // Never let status writes break the cron path.
    console.error("[sync-status] write failed", key, e)
  }
}
