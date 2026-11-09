import { getSettingBool, getSettingInt } from "@/lib/settings"
import type { RotationSettings } from "@/lib/rotation-policy"

// ─── Password rotation policy (compute-on-read) ─────────────────────────────
// The pure policy (computeRotation, rotationBadge, the rule itself) lives in
// lib/rotation-policy.ts so client components can import it without pulling
// Prisma into the bundle. This module adds the AppSetting-backed settings read.
// Rotation items are never persisted — snooze / exempt / mark-rotated are the
// lifecycle.

export * from "@/lib/rotation-policy"

/** Read the three rotation AppSetting keys with the documented defaults. */
export async function getRotationSettings(): Promise<RotationSettings> {
  const [enabled, defaultDays, warnDays] = await Promise.all([
    getSettingBool("rotation:enabled", true),
    getSettingInt("rotation:defaultDays", 90),
    getSettingInt("rotation:warnDays", 14),
  ])
  return { enabled, defaultDays, warnDays }
}
