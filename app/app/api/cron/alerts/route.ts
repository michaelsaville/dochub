import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// Called nightly by cron: GET /api/cron/alerts  (Bearer CRON_SECRET)
export async function GET(req: Request) {
  const auth = req.headers.get("authorization")
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Load settings
  const settings = await prisma.appSetting.findMany({
    where: { key: { in: ["integration:resend:apiKey", "integration:alerts:email", "integration:alerts:from"] } },
  })
  const cfg = Object.fromEntries(settings.map(s => [s.key, s.value]))

  const apiKey = cfg["integration:resend:apiKey"]
  const toEmail = cfg["integration:alerts:email"]
  const fromAddress = cfg["integration:alerts:from"] || "DocHub <noreply@dochub.pcc2k.com>"

  if (!apiKey || !toEmail) {
    return NextResponse.json({ skipped: true, reason: "Resend API key or alert email not configured" })
  }

  const now = new Date()
  const in7  = new Date(Date.now() + 7  * 86400000)
  const in30 = new Date(Date.now() + 30 * 86400000)

  // Query all 5 categories expiring within 30 days (including already expired)
  const [sslCerts, domains, warranties, credentials, licenses] = await Promise.all([
    prisma.website.findMany({
      where: { sslExpiresAt: { not: null, lte: in30 } },
      select: { id: true, domain: true, sslExpiresAt: true, client: { select: { name: true } } },
      orderBy: { sslExpiresAt: "asc" },
    }),
    prisma.website.findMany({
      where: { expiresAt: { not: null, lte: in30 } },
      select: { id: true, domain: true, expiresAt: true, client: { select: { name: true } } },
      orderBy: { expiresAt: "asc" },
    }),
    prisma.asset.findMany({
      where: { warrantyExpiry: { not: null, lte: in30 }, status: { notIn: ["RETIRED", "DISPOSED"] } },
      select: { id: true, name: true, friendlyName: true, warrantyExpiry: true, location: { select: { client: { select: { name: true } } } } },
      orderBy: { warrantyExpiry: "asc" },
    }),
    prisma.credential.findMany({
      where: { isRetired: false, expiryDate: { not: null, lte: in30 } },
      select: { id: true, label: true, expiryDate: true, client: { select: { name: true } } },
      orderBy: { expiryDate: "asc" },
    }),
    prisma.license.findMany({
      where: { isActive: true, expiryDate: { not: null, lte: in30 } },
      select: { id: true, name: true, expiryDate: true, client: { select: { name: true } } },
      orderBy: { expiryDate: "asc" },
    }),
  ])

  type Item = { category: string; label: string; clientName: string; expiresAt: Date }

  const all: Item[] = [
    ...sslCerts.map(w => ({ category: "SSL", label: w.domain, clientName: w.client.name, expiresAt: w.sslExpiresAt! })),
    ...domains.map(w => ({ category: "Domain", label: w.domain, clientName: w.client.name, expiresAt: w.expiresAt! })),
    ...warranties.map(a => ({ category: "Warranty", label: a.friendlyName ?? a.name, clientName: a.location.client.name, expiresAt: a.warrantyExpiry! })),
    ...credentials.map(c => ({ category: "Credential", label: c.label, clientName: c.client.name, expiresAt: c.expiryDate! })),
    ...licenses.map(l => ({ category: "License", label: l.name, clientName: l.client.name, expiresAt: l.expiryDate! })),
  ].sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime())

  if (all.length === 0) {
    return NextResponse.json({ sent: false, reason: "Nothing expiring within 30 days" })
  }

  const critical = all.filter(i => i.expiresAt <= in7)
  const warning  = all.filter(i => i.expiresAt > in7)

  const html = buildEmail(critical, warning, now)

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: fromAddress,
      to: [toEmail],
      subject: `DocHub — ${all.length} expiration${all.length !== 1 ? "s" : ""} need attention`,
      html,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    return NextResponse.json({ sent: false, error: err }, { status: 500 })
  }

  return NextResponse.json({ sent: true, total: all.length, critical: critical.length, warning: warning.length })
}

function row(category: string, label: string, clientName: string, expiresAt: Date, now: Date): string {
  const days = Math.floor((expiresAt.getTime() - now.getTime()) / 86400000)
  const badge = days < 0
    ? `<span style="background:#fee2e2;color:#dc2626;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600;">${Math.abs(days)}d ago</span>`
    : days === 0
    ? `<span style="background:#fee2e2;color:#dc2626;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600;">Today</span>`
    : days <= 7
    ? `<span style="background:#ffedd5;color:#ea580c;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600;">${days}d</span>`
    : `<span style="background:#fef9c3;color:#ca8a04;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600;">${days}d</span>`

  return `<tr style="border-bottom:1px solid #e5e7eb;">
    <td style="padding:10px 12px;font-size:13px;color:#6b7280;">${category}</td>
    <td style="padding:10px 12px;font-size:13px;font-weight:500;color:#111827;">${label}</td>
    <td style="padding:10px 12px;font-size:13px;color:#6b7280;">${clientName}</td>
    <td style="padding:10px 12px;font-size:13px;color:#6b7280;">${expiresAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
    <td style="padding:10px 12px;">${badge}</td>
  </tr>`
}

function table(items: { category: string; label: string; clientName: string; expiresAt: Date }[], now: Date): string {
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
    <tbody>${items.map(i => row(i.category, i.label, i.clientName, i.expiresAt, now)).join("")}</tbody>
  </table>`
}

function section(title: string, color: string, items: { category: string; label: string; clientName: string; expiresAt: Date }[], now: Date): string {
  if (items.length === 0) return ""
  return `<div style="margin-bottom:28px;">
    <h2 style="font-size:15px;font-weight:600;color:${color};margin:0 0 12px;">${title} (${items.length})</h2>
    ${table(items, now)}
  </div>`
}

function buildEmail(
  critical: { category: string; label: string; clientName: string; expiresAt: Date }[],
  warning:  { category: string; label: string; clientName: string; expiresAt: Date }[],
  now: Date
): string {
  const date = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f3f4f6;margin:0;padding:24px;">
  <div style="max-width:700px;margin:0 auto;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
    <div style="background:#1e293b;padding:20px 28px;">
      <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;color:#94a3b8;font-family:monospace;">PCC // DOCHUB</div>
      <div style="font-size:20px;font-weight:600;color:#f8fafc;margin-top:4px;">Expiration Digest</div>
      <div style="font-size:13px;color:#94a3b8;margin-top:4px;">${date}</div>
    </div>
    <div style="padding:24px 28px;">
      ${section("Expired & Critical", "#dc2626", critical, now)}
      ${section("Expiring within 30 days", "#ca8a04", warning, now)}
      <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;">
        View the full expirations dashboard at <a href="https://dochub.pcc2k.com/expirations" style="color:#3b82f6;">dochub.pcc2k.com/expirations</a>
      </div>
    </div>
  </div>
</body></html>`
}
