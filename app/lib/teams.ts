import { prisma } from "@/lib/prisma"

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: "FF4D6D",
  WARNING:  "FFB347",
  INFO:     "3D6FFF",
}

export type TeamsAlarmPayload = {
  severity: string
  type: string
  message: string
  clientName: string
  alarmId: string
}

export type TeamsExpirationPayload = {
  critical: { category: string; label: string; clientName: string; expiresAt: Date }[]
  warning:  { category: string; label: string; clientName: string; expiresAt: Date }[]
}

async function getTeamsConfig(): Promise<{ webhookUrl: string; minSeverity: string } | null> {
  const settings = await prisma.appSetting.findMany({
    where: { key: { in: ["teams:webhook_url", "teams:min_severity"] } },
  })
  const cfg = Object.fromEntries(settings.map(s => [s.key, s.value]))
  if (!cfg["teams:webhook_url"]) return null
  return {
    webhookUrl:  cfg["teams:webhook_url"],
    minSeverity: cfg["teams:min_severity"] || "CRITICAL",
  }
}

function severityRank(s: string) {
  return s === "CRITICAL" ? 2 : s === "WARNING" ? 1 : 0
}

export async function postAlarmToTeams(payload: TeamsAlarmPayload): Promise<void> {
  const config = await getTeamsConfig()
  if (!config) return

  if (severityRank(payload.severity) < severityRank(config.minSeverity)) return

  const color = SEVERITY_COLOR[payload.severity] ?? "3D6FFF"
  const body = {
    type: "message",
    attachments: [{
      contentType: "application/vnd.microsoft.card.adaptive",
      content: {
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        type: "AdaptiveCard",
        version: "1.4",
        body: [
          {
            type: "TextBlock",
            text: `🚨 ${payload.severity} Alarm — ${payload.clientName}`,
            weight: "Bolder",
            size: "Medium",
            color: payload.severity === "CRITICAL" ? "Attention" : payload.severity === "WARNING" ? "Warning" : "Accent",
          },
          {
            type: "TextBlock",
            text: payload.message,
            wrap: true,
          },
          {
            type: "FactSet",
            facts: [
              { title: "Type",     value: payload.type },
              { title: "Client",   value: payload.clientName },
              { title: "Severity", value: payload.severity },
            ],
          },
        ],
        actions: [{
          type: "Action.OpenUrl",
          title: "View in DocHub",
          url: "https://dochub.pcc2k.com/alarms",
        }],
        msteams: { width: "Full" },
      },
    }],
  }

  await fetch(config.webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {}) // fire-and-forget — never block alarm creation
}

export async function postExpirationDigestToTeams(
  payload: TeamsExpirationPayload,
  webhookUrl?: string
): Promise<{ ok: boolean; error?: string }> {
  let url = webhookUrl
  if (!url) {
    const config = await getTeamsConfig()
    if (!config) return { ok: false, error: "Teams not configured" }
    url = config.webhookUrl
  }

  const all = [...payload.critical, ...payload.warning]
  if (all.length === 0) return { ok: true }

  const now = new Date()

  function daysBadge(expiresAt: Date) {
    const d = Math.ceil((expiresAt.getTime() - now.getTime()) / 86400000)
    if (d < 0)  return `${Math.abs(d)}d overdue`
    if (d === 0) return "Today"
    return `${d}d`
  }

  const facts = (items: typeof payload.critical) =>
    items.map(i => ({
      title: `${i.category} — ${i.clientName}`,
      value: `${i.label} (${daysBadge(i.expiresAt)})`,
    }))

  const bodyBlocks: object[] = [
    {
      type: "TextBlock",
      text: `DocHub — Expiration Digest · ${now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
      weight: "Bolder",
      size: "Medium",
    },
  ]

  if (payload.critical.length > 0) {
    bodyBlocks.push(
      { type: "TextBlock", text: `🔴 Critical (${payload.critical.length})`, weight: "Bolder", color: "Attention", spacing: "Medium" },
      { type: "FactSet", facts: facts(payload.critical) }
    )
  }

  if (payload.warning.length > 0) {
    bodyBlocks.push(
      { type: "TextBlock", text: `🟡 Warning (${payload.warning.length})`, weight: "Bolder", color: "Warning", spacing: "Medium" },
      { type: "FactSet", facts: facts(payload.warning) }
    )
  }

  const body = {
    type: "message",
    attachments: [{
      contentType: "application/vnd.microsoft.card.adaptive",
      content: {
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        type: "AdaptiveCard",
        version: "1.4",
        body: bodyBlocks,
        actions: [{
          type: "Action.OpenUrl",
          title: "View Expirations",
          url: "https://dochub.pcc2k.com/expirations",
        }],
        msteams: { width: "Full" },
      },
    }],
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    return res.ok ? { ok: true } : { ok: false, error: await res.text() }
  } catch (e: any) {
    return { ok: false, error: e.message }
  }
}
