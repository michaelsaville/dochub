/**
 * Message template registry — one entry per customer-facing template
 * DocHub can send. Rendering logic lives in code, not DB, because a typo
 * in an operational template breaks the nightly digest silently.
 *
 * Adding a new template:
 *   1. Define it below with a stable snake_case `key`.
 *   2. Call sendMessage('your_key', vars, { toEmail, toName, metadata })
 *      from the code path that triggers it.
 *   3. /admin/messages picks it up automatically.
 */

export interface MessageTemplate<V> {
  key: string
  name: string
  description: string
  category: "Alerts" | "Account" | "Workflow"
  sampleVars: V
  subject: (vars: V) => string
  body: (vars: V) => string
}

// ── Expiration digest ───────────────────────────────────────────────

export interface ExpirationDigestItem {
  category: string
  label: string
  clientName: string
  expiresAt: Date
}

interface ExpirationDigestVars {
  critical: ExpirationDigestItem[]
  warning: ExpirationDigestItem[]
  generatedAt: Date
}

function digestRow(item: ExpirationDigestItem, now: Date): string {
  const days = Math.floor((item.expiresAt.getTime() - now.getTime()) / 86400000)
  const badge =
    days < 0
      ? `<span style="background:#fee2e2;color:#dc2626;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600;">${Math.abs(days)}d ago</span>`
      : days === 0
        ? `<span style="background:#fee2e2;color:#dc2626;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600;">Today</span>`
        : days <= 7
          ? `<span style="background:#ffedd5;color:#ea580c;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600;">${days}d</span>`
          : `<span style="background:#fef9c3;color:#ca8a04;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600;">${days}d</span>`

  return `<tr style="border-bottom:1px solid #e5e7eb;">
    <td style="padding:10px 12px;font-size:13px;color:#6b7280;">${item.category}</td>
    <td style="padding:10px 12px;font-size:13px;font-weight:500;color:#111827;">${item.label}</td>
    <td style="padding:10px 12px;font-size:13px;color:#6b7280;">${item.clientName}</td>
    <td style="padding:10px 12px;font-size:13px;color:#6b7280;">${item.expiresAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
    <td style="padding:10px 12px;">${badge}</td>
  </tr>`
}

function digestTable(items: ExpirationDigestItem[], now: Date): string {
  return `<table style="width:100%;border-collapse:collapse;margin-bottom:8px;">
    <thead>
      <tr style="background:#f9fafb;border-bottom:1px solid #e5e7eb;">
        <th style="padding:8px 12px;font-size:12px;font-weight:600;color:#6b7280;text-align:left;">Category</th>
        <th style="padding:8px 12px;font-size:12px;font-weight:600;color:#6b7280;text-align:left;">Name</th>
        <th style="padding:8px 12px;font-size:12px;font-weight:600;color:#6b7280;text-align:left;">Client</th>
        <th style="padding:8px 12px;font-size:12px;font-weight:600;color:#6b7280;text-align:left;">Expires</th>
        <th style="padding:8px 12px;font-size:12px;font-weight:600;color:#6b7280;text-align:left;">Status</th>
      </tr>
    </thead>
    <tbody>${items.map((i) => digestRow(i, now)).join("")}</tbody>
  </table>`
}

function digestSection(
  title: string,
  color: string,
  items: ExpirationDigestItem[],
  now: Date,
): string {
  if (items.length === 0) return ""
  return `<div style="margin-bottom:28px;">
    <h2 style="font-size:15px;font-weight:600;color:${color};margin:0 0 12px;">${title} (${items.length})</h2>
    ${digestTable(items, now)}
  </div>`
}

export const expirationDigest: MessageTemplate<ExpirationDigestVars> = {
  key: "expiration_digest",
  name: "Expiration digest",
  description:
    "Nightly cron roll-up of SSL certs, domain registrations, asset warranties, credentials, and licenses expiring within the warn window.",
  category: "Alerts",
  sampleVars: {
    critical: [
      {
        category: "SSL",
        label: "example.com",
        clientName: "Acme Corp",
        expiresAt: new Date(Date.now() + 3 * 86400000),
      },
      {
        category: "Domain",
        label: "acme.io",
        clientName: "Acme Corp",
        expiresAt: new Date(Date.now() - 1 * 86400000),
      },
    ],
    warning: [
      {
        category: "Warranty",
        label: "Dell PowerEdge R640",
        clientName: "Beta LLC",
        expiresAt: new Date(Date.now() + 21 * 86400000),
      },
      {
        category: "License",
        label: "Microsoft 365 E3 (50 seats)",
        clientName: "Gamma Inc",
        expiresAt: new Date(Date.now() + 27 * 86400000),
      },
    ],
    generatedAt: new Date(),
  },
  subject: (v) => {
    const total = v.critical.length + v.warning.length
    return `DocHub — ${total} expiration${total !== 1 ? "s" : ""} need attention`
  },
  body: (v) => {
    const date = v.generatedAt.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    })
    return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f3f4f6;margin:0;padding:24px;">
  <div style="max-width:700px;margin:0 auto;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
    <div style="background:#1e293b;padding:20px 28px;">
      <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;color:#94a3b8;font-family:monospace;">PCC // DOCHUB</div>
      <div style="font-size:20px;font-weight:600;color:#f8fafc;margin-top:4px;">Expiration Digest</div>
      <div style="font-size:13px;color:#94a3b8;margin-top:4px;">${date}</div>
    </div>
    <div style="padding:24px 28px;">
      ${digestSection("Expired & Critical", "#dc2626", v.critical, v.generatedAt)}
      ${digestSection("Expiring within 30 days", "#ca8a04", v.warning, v.generatedAt)}
      <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;">
        View the full expirations dashboard at <a href="https://dochub.pcc2k.com/expirations" style="color:#3b82f6;">dochub.pcc2k.com/expirations</a>
      </div>
    </div>
  </div>
</body></html>`
  },
}

// ── Registry ────────────────────────────────────────────────────────

export const DOCHUB_TEMPLATES = {
  expiration_digest: expirationDigest,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as const satisfies Record<string, MessageTemplate<any>>

export type DochubTemplateKey = keyof typeof DOCHUB_TEMPLATES

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyDochubTemplate = MessageTemplate<any>

export function listTemplates(): AnyDochubTemplate[] {
  return Object.values(DOCHUB_TEMPLATES)
}

export function getTemplate(key: string): AnyDochubTemplate | null {
  return (DOCHUB_TEMPLATES as Record<string, AnyDochubTemplate>)[key] ?? null
}
