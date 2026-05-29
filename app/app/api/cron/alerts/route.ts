import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { postExpirationDigestToTeams } from "@/lib/teams"
import { sendPush } from "@/lib/push"
import { sendMessage } from "@/lib/messaging/send"
import type { ExpirationDigestItem } from "@/lib/messaging/templates"

// Called nightly by cron: GET /api/cron/alerts  (Bearer CRON_SECRET)
export async function GET(req: Request) {
  const auth = req.headers.get("authorization")
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // ?test=1 — fire a one-line test through every configured channel so the
  // operator can confirm delivery without waiting for something to expire.
  if (new URL(req.url).searchParams.get("test") === "1") {
    const push = await sendPush({
      title: "DocHub test alert",
      message: "Test notification — your DocHub alert channel is working.",
      priority: "normal",
      url: `${process.env.NEXTAUTH_URL || "https://dochub.pcc2k.com"}/expirations`,
    })
    const t = await prisma.appSetting.findUnique({ where: { key: "teams:webhook_url" } })
    const teams = t?.value
      ? await postExpirationDigestToTeams({ critical: [], warning: [] }, t.value)
      : { skipped: true }
    return NextResponse.json({ test: true, push, teams })
  }

  const settings = await prisma.appSetting.findMany({
    where: {
      key: {
        in: [
          "integration:resend:apiKey", "integration:alerts:email", "integration:alerts:from",
          "alerts:threshold:warn", "alerts:threshold:critical",
          "alerts:categories:ssl", "alerts:categories:domains", "alerts:categories:warranties",
          "alerts:categories:credentials", "alerts:categories:licenses",
          "alerts:categories:vpncerts", "alerts:categories:circuits",
        ],
      },
    },
  })
  const cfg = Object.fromEntries(settings.map(s => [s.key, s.value]))

  const apiKey       = cfg["integration:resend:apiKey"]
  const toEmail      = cfg["integration:alerts:email"]
  const warnDays     = parseInt(cfg["alerts:threshold:warn"]     || "30", 10)
  const criticalDays = parseInt(cfg["alerts:threshold:critical"] || "7",  10)
  const inclSsl         = cfg["alerts:categories:ssl"]         !== "false"
  const inclDomains     = cfg["alerts:categories:domains"]     !== "false"
  const inclWarranties  = cfg["alerts:categories:warranties"]  !== "false"
  const inclCredentials = cfg["alerts:categories:credentials"] !== "false"
  const inclLicenses    = cfg["alerts:categories:licenses"]    !== "false"
  const inclVpnCerts    = cfg["alerts:categories:vpncerts"]    !== "false"
  const inclCircuits    = cfg["alerts:categories:circuits"]    !== "false"

  // Email is just one channel — a missing Resend config must NOT short-circuit
  // Teams/push (it used to early-return and skip every channel).
  const emailConfigured = Boolean(apiKey && toEmail)

  const now    = new Date()
  const inWarn = new Date(Date.now() + warnDays     * 86400000)
  const inCrit = new Date(Date.now() + criticalDays * 86400000)

  const [sslCerts, domains, warranties, credentials, licenses, vpnCerts, circuits] = await Promise.all([
    inclSsl ? prisma.website.findMany({
      where: { sslExpiresAt: { not: null, lte: inWarn } },
      select: { id: true, domain: true, sslExpiresAt: true, client: { select: { name: true } } },
      orderBy: { sslExpiresAt: "asc" },
    }) : [],
    inclDomains ? prisma.website.findMany({
      where: { expiresAt: { not: null, lte: inWarn } },
      select: { id: true, domain: true, expiresAt: true, client: { select: { name: true } } },
      orderBy: { expiresAt: "asc" },
    }) : [],
    inclWarranties ? prisma.asset.findMany({
      where: { warrantyExpiry: { not: null, lte: inWarn }, status: { notIn: ["RETIRED", "DISPOSED"] } },
      select: { id: true, name: true, friendlyName: true, warrantyExpiry: true, location: { select: { client: { select: { name: true } } } } },
      orderBy: { warrantyExpiry: "asc" },
    }) : [],
    inclCredentials ? prisma.credential.findMany({
      where: { isRetired: false, expiryDate: { not: null, lte: inWarn } },
      select: { id: true, label: true, expiryDate: true, client: { select: { name: true } } },
      orderBy: { expiryDate: "asc" },
    }) : [],
    inclLicenses ? prisma.license.findMany({
      where: { isActive: true, expiryDate: { not: null, lte: inWarn } },
      select: { id: true, name: true, expiryDate: true, client: { select: { name: true } } },
      orderBy: { expiryDate: "asc" },
    }) : [],
    inclVpnCerts ? prisma.vpnAccessor.findMany({
      where: { isActive: true, certExpiry: { not: null, lte: inWarn } },
      select: {
        id: true, certExpiry: true, thirdPartyName: true,
        person: { select: { name: true } }, vendor: { select: { name: true } }, staffUser: { select: { name: true } },
        gateway: { select: { name: true, client: { select: { name: true } } } },
      },
      orderBy: { certExpiry: "asc" },
    }) : [],
    inclCircuits ? prisma.internetCircuit.findMany({
      where: { contractEnd: { not: null, lte: inWarn } },
      select: { id: true, label: true, contractEnd: true, client: { select: { name: true } } },
      orderBy: { contractEnd: "asc" },
    }) : [],
  ])

  const all: ExpirationDigestItem[] = [
    ...sslCerts.map(w => ({ category: "SSL", label: w.domain, clientName: w.client.name, expiresAt: w.sslExpiresAt! })),
    ...domains.map(w => ({ category: "Domain", label: w.domain, clientName: w.client.name, expiresAt: w.expiresAt! })),
    ...warranties.map(a => ({ category: "Warranty", label: a.friendlyName ?? a.name, clientName: a.location.client.name, expiresAt: a.warrantyExpiry! })),
    ...credentials.map(c => ({ category: "Credential", label: c.label, clientName: c.client.name, expiresAt: c.expiryDate! })),
    ...licenses.map(l => ({ category: "License", label: l.name, clientName: l.client.name, expiresAt: l.expiryDate! })),
    ...vpnCerts.map(a => ({ category: "VPN cert", label: `${a.person?.name ?? a.vendor?.name ?? a.staffUser?.name ?? a.thirdPartyName ?? "VPN access"} (${a.gateway.name})`, clientName: a.gateway.client.name, expiresAt: a.certExpiry! })),
    ...circuits.map(c => ({ category: "Circuit", label: c.label, clientName: c.client.name, expiresAt: c.contractEnd! })),
  ].sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime())

  if (all.length === 0) {
    return NextResponse.json({ sent: false, reason: "Nothing expiring within 30 days" })
  }

  const critical = all.filter(i => i.expiresAt <= inCrit)
  const warning  = all.filter(i => i.expiresAt > inCrit)

  // Email — only when Resend is configured.
  let emailResult: object = { skipped: true, reason: "Resend API key or alert email not configured" }
  if (emailConfigured) {
    const send = await sendMessage(
      "expiration_digest",
      { critical, warning, generatedAt: now },
      {
        toEmail,
        metadata: {
          total: all.length,
          criticalCount: critical.length,
          warningCount: warning.length,
          runSource: "cron",
        },
      },
    )
    emailResult = send.status === "FAILED"
      ? { sent: false, error: send.errorMessage }
      : { sent: true, messageId: send.id }
  }

  const teamsSetting = await prisma.appSetting.findUnique({ where: { key: "teams:webhook_url" } })
  let teamsResult: object = { skipped: true }
  if (teamsSetting?.value) {
    teamsResult = await postExpirationDigestToTeams({ critical, warning }, teamsSetting.value)
  }

  // Push channels — same digest summary in 1-2 lines. sendPush self-skips any
  // channel that isn't configured.
  const pushResult = await sendPush({
    title: critical.length > 0
      ? `${critical.length} critical · ${warning.length} warning`
      : `${warning.length} expiring soon`,
    message: `DocHub digest: ${critical.length} critical, ${warning.length} warning, ${all.length} total`,
    priority: critical.length > 0 ? "high" : "normal",
    url: `${process.env.NEXTAUTH_URL || "https://dochub.pcc2k.com"}/expirations`,
  })

  const pushSent = (pushResult.ntfy as any)?.ok === true || (pushResult.pushover as any)?.ok === true
  const teamsSent = !(teamsResult as any)?.skipped
  return NextResponse.json({
    sent: (emailResult as any).sent === true || teamsSent || pushSent,
    email: emailResult,
    total: all.length,
    critical: critical.length,
    warning: warning.length,
    teams: teamsResult,
    push: pushResult,
  })
}
