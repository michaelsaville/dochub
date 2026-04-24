import { prisma } from "@/lib/prisma"

/**
 * Multi-channel push wrapper. Reads AppSettings to decide which channels
 * are active, then fans out to every configured one. Each channel is best
 * effort — failures are logged and swallowed so an alert with a typo'd
 * topic doesn't crash the cron path.
 *
 * Configured via:
 *   push:ntfy:url            (default https://ntfy.sh)
 *   push:ntfy:topic
 *   push:pushover:appToken
 *   push:pushover:userKey
 */

export interface PushPayload {
  title: string
  message: string
  /** Optional click-through URL the receiving app can render. */
  url?: string | null
  /** Pushover priority -2..2; ntfy "min" | "low" | "default" | "high" | "max". */
  priority?: "low" | "normal" | "high" | "critical"
}

interface PushResult {
  ntfy: { ok: boolean; error?: string } | { skipped: true }
  pushover: { ok: boolean; error?: string } | { skipped: true }
}

export async function sendPush(p: PushPayload): Promise<PushResult> {
  const cfg = await loadSettings()
  return {
    ntfy: cfg.ntfyTopic
      ? await sendNtfy(cfg.ntfyUrl ?? "https://ntfy.sh", cfg.ntfyTopic, p)
      : { skipped: true as const },
    pushover: cfg.pushoverAppToken && cfg.pushoverUserKey
      ? await sendPushover(cfg.pushoverAppToken, cfg.pushoverUserKey, p)
      : { skipped: true as const },
  }
}

async function loadSettings() {
  const keys = [
    "push:ntfy:url", "push:ntfy:topic",
    "push:pushover:appToken", "push:pushover:userKey",
  ]
  const rows = await prisma.appSetting.findMany({ where: { key: { in: keys } } })
  const get = (k: string) => rows.find(r => r.key === k)?.value?.trim() || null
  return {
    ntfyUrl: get("push:ntfy:url"),
    ntfyTopic: get("push:ntfy:topic"),
    pushoverAppToken: get("push:pushover:appToken"),
    pushoverUserKey: get("push:pushover:userKey"),
  }
}

const NTFY_PRIORITY: Record<NonNullable<PushPayload["priority"]>, string> = {
  low: "low", normal: "default", high: "high", critical: "max",
}
const PUSHOVER_PRIORITY: Record<NonNullable<PushPayload["priority"]>, number> = {
  low: -1, normal: 0, high: 1, critical: 2,
}

async function sendNtfy(baseUrl: string, topic: string, p: PushPayload) {
  try {
    const headers: Record<string, string> = {
      "Title": p.title,
      "Priority": NTFY_PRIORITY[p.priority ?? "normal"],
    }
    if (p.url) headers["Click"] = p.url
    const url = `${baseUrl.replace(/\/+$/, "")}/${encodeURIComponent(topic)}`
    const res = await fetch(url, { method: "POST", headers, body: p.message })
    if (!res.ok) return { ok: false, error: `ntfy ${res.status}` }
    return { ok: true }
  } catch (e: any) {
    console.error("[push] ntfy failed", e)
    return { ok: false, error: e?.message ?? "ntfy network error" }
  }
}

async function sendPushover(appToken: string, userKey: string, p: PushPayload) {
  try {
    const body = new URLSearchParams({
      token: appToken,
      user: userKey,
      title: p.title,
      message: p.message,
      priority: String(PUSHOVER_PRIORITY[p.priority ?? "normal"]),
      ...(p.url ? { url: p.url } : {}),
    })
    // Pushover priority=2 (critical) requires retry/expire params.
    if (p.priority === "critical") {
      body.set("retry", "60")
      body.set("expire", "1800")
    }
    const res = await fetch("https://api.pushover.net/1/messages.json", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    })
    if (!res.ok) return { ok: false, error: `pushover ${res.status}` }
    return { ok: true }
  } catch (e: any) {
    console.error("[push] pushover failed", e)
    return { ok: false, error: e?.message ?? "pushover network error" }
  }
}
