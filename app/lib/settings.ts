import { prisma } from "@/lib/prisma"

// Typed AppSetting accessor. Every tunable (rotation policy, backup schedule
// mirror, alert categories, mobile SLA knobs, audit anchors) reads `?? default`
// so no seed migrations are needed — the default IS the config until overridden.

export async function getSetting(key: string, fallback: string): Promise<string> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key } })
    return row?.value ?? fallback
  } catch {
    return fallback
  }
}

export async function getSettingBool(key: string, fallback: boolean): Promise<boolean> {
  const v = await getSetting(key, fallback ? "true" : "false")
  return v === "true" || v === "1"
}

export async function getSettingInt(key: string, fallback: number): Promise<number> {
  const n = parseInt(await getSetting(key, String(fallback)), 10)
  return Number.isFinite(n) ? n : fallback
}

export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } })
}
