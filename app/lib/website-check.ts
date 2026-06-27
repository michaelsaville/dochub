import { prisma } from "@/lib/prisma"
import { createAlarm } from "@/lib/alarms"
import { resolve4, resolve6, resolveMx, resolveNs, resolveTxt } from "dns/promises"
import tls from "tls"

async function rdapLookup(domain: string): Promise<{ expiresAt: Date | null; registrar: string | null }> {
  try {
    const res = await fetch(`https://rdap.org/domain/${domain}`, {
      headers: { Accept: "application/rdap+json, application/json" },
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return { expiresAt: null, registrar: null }
    const data = await res.json()
    const expiryEvent = (data.events ?? []).find((e: any) => e.eventAction === "expiration")
    const expiresAt = expiryEvent ? new Date(expiryEvent.eventDate) : null
    const registrarEntity = (data.entities ?? []).find((e: any) => e.roles?.includes("registrar"))
    const registrar =
      registrarEntity?.vcardArray?.[1]?.find((v: any) => v[0] === "fn")?.[3] ?? null
    return { expiresAt, registrar }
  } catch {
    return { expiresAt: null, registrar: null }
  }
}

// DKIM has no discovery mechanism (the selector lives in the message header),
// so presence can only be a best-effort probe of well-known provider selectors.
const DKIM_SELECTORS = [
  "google", "default", "selector1", "selector2", "s1", "s2", "k1", "k2",
  "mail", "dkim", "smtp", "resend", "mandrill", "zoho", "amazonses",
  "protonmail", "protonmail2", "protonmail3", "fm1", "fm2", "fm3", "mailjet",
]

async function dnsLookup(domain: string): Promise<Record<string, any>> {
  const [aRes, aaaaRes, mxRes, nsRes, txtRes, dmarcRes] = await Promise.allSettled([
    resolve4(domain),
    resolve6(domain),
    resolveMx(domain),
    resolveNs(domain),
    resolveTxt(domain),
    resolveTxt(`_dmarc.${domain}`),
  ])
  const records: Record<string, any> = {}
  if (aRes.status === "fulfilled" && aRes.value.length) records.A = aRes.value
  if (aaaaRes.status === "fulfilled" && aaaaRes.value.length) records.AAAA = aaaaRes.value
  if (mxRes.status === "fulfilled" && mxRes.value.length) records.MX = mxRes.value
  if (nsRes.status === "fulfilled" && nsRes.value.length) records.NS = nsRes.value
  if (txtRes.status === "fulfilled" && txtRes.value.length) records.TXT = txtRes.value.flat()
  if (dmarcRes.status === "fulfilled" && dmarcRes.value.length) records.DMARC = dmarcRes.value.flat()

  // Best-effort DKIM selector probe — keep only selectors that actually resolve
  // to something DKIM-shaped, joining the TXT chunks back into a single record.
  const dkimResults = await Promise.allSettled(
    DKIM_SELECTORS.map((sel) => resolveTxt(`${sel}._domainkey.${domain}`)),
  )
  const dkim: Record<string, string> = {}
  dkimResults.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value.length) {
      const joined = r.value.map((parts) => (Array.isArray(parts) ? parts.join("") : parts)).join(" ")
      if (/v=DKIM1|(^|;|\s)p=/i.test(joined)) dkim[DKIM_SELECTORS[i]] = joined
    }
  })
  if (Object.keys(dkim).length) records.DKIM = dkim
  return records
}

type EmailAuthIssue = { ok: boolean; severity: "INFO" | "WARNING" | "CRITICAL"; detail: string }

/**
 * Derive SPF / DKIM / DMARC posture from already-fetched DNS records. Pure (no
 * network) so it never blanks data on a transient resolver failure — the caller
 * decides whether to act on it.
 */
function evaluateEmailAuth(records: Record<string, any>): {
  spf: EmailAuthIssue
  dkim: EmailAuthIssue
  dmarc: EmailAuthIssue
} {
  const txt: string[] = Array.isArray(records?.TXT) ? records.TXT : []
  const spfRecords = txt.filter((t) => /^v=spf1\b/i.test(String(t).trim()))
  let spf: EmailAuthIssue
  if (spfRecords.length === 0) {
    spf = { ok: false, severity: "WARNING", detail: "No SPF record (v=spf1) found" }
  } else if (spfRecords.length > 1) {
    spf = { ok: false, severity: "CRITICAL", detail: `Multiple SPF records (${spfRecords.length}) — RFC 7208 permits only one; SPF will permerror/fail` }
  } else if (/\?all|\+all/i.test(spfRecords[0])) {
    spf = { ok: false, severity: "WARNING", detail: `SPF present but ends with a permissive all: ${spfRecords[0]}` }
  } else {
    spf = { ok: true, severity: "INFO", detail: spfRecords[0] }
  }

  const dmarcTxt: string[] = Array.isArray(records?.DMARC) ? records.DMARC : []
  const dmarcRecord = dmarcTxt.find((t) => /^v=DMARC1\b/i.test(String(t).trim()))
  let dmarc: EmailAuthIssue
  if (!dmarcRecord) {
    dmarc = { ok: false, severity: "WARNING", detail: "No DMARC record (v=DMARC1) at _dmarc subdomain" }
  } else {
    const policy = (dmarcRecord.match(/[;\s]p=([a-z]+)/i)?.[1] ?? "none").toLowerCase()
    if (policy === "none") {
      dmarc = { ok: false, severity: "INFO", detail: `DMARC present but policy is p=none (monitoring only): ${dmarcRecord}` }
    } else {
      dmarc = { ok: true, severity: "INFO", detail: dmarcRecord }
    }
  }

  const dkimFound = records?.DKIM && Object.keys(records.DKIM).length > 0
  const dkim: EmailAuthIssue = dkimFound
    ? { ok: true, severity: "INFO", detail: `DKIM found on selector(s): ${Object.keys(records.DKIM).join(", ")}` }
    : { ok: false, severity: "INFO", detail: "No DKIM record on common selectors (selector may be custom — verify manually)" }

  return { spf, dkim, dmarc }
}

/**
 * Compare two DNS-record snapshots and return the record-type keys that changed.
 * Order-insensitive. To avoid a one-time false-positive flood when the DMARC/
 * DKIM keys are first introduced, a key is only flagged when it is one of the
 * always-tracked core record types OR it already existed in the prior snapshot.
 */
function diffDnsRecords(prev: any, next: Record<string, any>): string[] {
  if (!prev || typeof prev !== "object") return []
  const core = new Set(["A", "AAAA", "MX", "NS", "TXT"])
  const norm = (v: any): string => {
    if (v == null) return ""
    if (Array.isArray(v)) return JSON.stringify([...v].map((x) => (Array.isArray(x) ? x.join("") : x)).sort())
    if (typeof v === "object") return JSON.stringify(Object.keys(v).sort().reduce((a: any, k) => ((a[k] = v[k]), a), {}))
    return JSON.stringify(v)
  }
  const changed: string[] = []
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)])
  for (const k of keys) {
    if (norm(prev[k]) === norm(next[k])) continue
    if (core.has(k) || Object.prototype.hasOwnProperty.call(prev, k)) changed.push(k)
  }
  return changed
}

/**
 * Raise (via createAlarm — fans out to Teams + push, dedupes per-domain) or
 * auto-resolve a per-check, per-domain email-auth alarm. Mirrors the per-domain
 * resolve used by the uptime cron so a fixed record clears its own alarm.
 */
async function syncEmailAuthAlarm(clientId: string, type: string, domain: string, issue: EmailAuthIssue) {
  if (issue.ok) {
    const active = await prisma.alarm.findMany({
      where: { clientId, type, status: "ACTIVE", message: { contains: domain } },
    })
    for (const a of active) {
      await prisma.alarm.update({ where: { id: a.id }, data: { status: "RESOLVED", resolvedAt: new Date() } })
    }
    return
  }
  await createAlarm({
    clientId,
    severity: issue.severity as any,
    type,
    message: `${type.replace("_", " ")} for ${domain}: ${issue.detail}`,
    details: issue.detail,
    dedupeKey: domain,
  })
}

async function sslCheck(domain: string): Promise<{ sslExpiresAt: Date | null; sslIssuer: string | null }> {
  return new Promise((resolve) => {
    try {
      const socket = tls.connect(443, domain, { servername: domain, rejectUnauthorized: false }, () => {
        const cert = socket.getPeerCertificate()
        socket.destroy()
        resolve({
          sslExpiresAt: cert?.valid_to ? new Date(cert.valid_to) : null,
          sslIssuer: (cert?.issuer as any)?.O ?? null,
        })
      })
      socket.setTimeout(8000, () => { socket.destroy(); resolve({ sslExpiresAt: null, sslIssuer: null }) })
      socket.on("error", () => resolve({ sslExpiresAt: null, sslIssuer: null }))
    } catch {
      resolve({ sslExpiresAt: null, sslIssuer: null })
    }
  })
}

/**
 * Run RDAP + DNS + SSL checks for a single website, persist the results,
 * and raise/refresh domain- and SSL-expiry alarms.
 *
 * Shared by the interactive route (POST /api/clients/[id]/websites/[id]/check,
 * session-gated) and the domains cron (/api/cron/domains, bearer-gated). The
 * cron calls this directly rather than re-fetching the session-gated HTTP
 * route — that internal call had no credentials, so every check was bounced
 * to /login and counted as an error.
 *
 * Returns the updated Website row, or null if no matching row exists.
 */
export async function checkWebsite(clientId: string, websiteId: string) {
  const website = await prisma.website.findFirst({ where: { id: websiteId, clientId } })
  if (!website) return null

  const [{ expiresAt, registrar }, dnsRecords, { sslExpiresAt, sslIssuer }] = await Promise.all([
    rdapLookup(website.domain),
    dnsLookup(website.domain),
    sslCheck(website.domain),
  ])

  // Coalesce with prior values — a transient RDAP/TLS/DNS failure returns
  // null/empty, and we must NOT blank out yesterday's good data (that would
  // also drop the domain out of /expirations + alerts).
  const hasDns = dnsRecords && typeof dnsRecords === "object" && Object.keys(dnsRecords).length > 0
  const updated = await prisma.website.update({
    where: { id: websiteId },
    data: {
      expiresAt: expiresAt ?? website.expiresAt,
      registrar: registrar ?? website.registrar,
      dnsRecords: hasDns ? dnsRecords : (website.dnsRecords ?? undefined),
      sslExpiresAt: sslExpiresAt ?? website.sslExpiresAt,
      sslIssuer: sslIssuer ?? website.sslIssuer,
      lastChecked: new Date(),
    },
  })

  // Domain expiry alarm
  if (expiresAt) {
    const thresholdSetting = await prisma.appSetting.findUnique({
      where: { key: "domain_expiry_threshold_days" },
    })
    const threshold = parseInt(thresholdSetting?.value ?? "30")
    const daysLeft = Math.floor((expiresAt.getTime() - Date.now()) / 86400000)

    if (daysLeft <= threshold) {
      const severity =
        daysLeft <= 0 ? "CRITICAL" : daysLeft <= 7 ? "CRITICAL" : daysLeft <= 14 ? "WARNING" : "INFO"
      const message =
        daysLeft <= 0
          ? `Domain ${website.domain} has expired`
          : `Domain ${website.domain} expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`

      const existing = await prisma.alarm.findFirst({
        where: {
          clientId,
          type: "DOMAIN_EXPIRY",
          status: { not: "RESOLVED" },
          message: { contains: website.domain },
        },
      })

      if (existing) {
        await prisma.alarm.update({
          where: { id: existing.id },
          data: { severity: severity as any, message, status: "ACTIVE" },
        })
      } else {
        await prisma.alarm.create({
          data: {
            clientId,
            severity: severity as any,
            type: "DOMAIN_EXPIRY",
            message,
            details: `Registrar: ${registrar ?? "unknown"} · Expires: ${expiresAt.toDateString()}`,
          },
        })
      }
    }
  }

  // SSL expiry alarm
  if (sslExpiresAt) {
    const daysLeft = Math.floor((sslExpiresAt.getTime() - Date.now()) / 86400000)
    if (daysLeft <= 30) {
      const severity = daysLeft <= 0 ? "CRITICAL" : daysLeft <= 7 ? "CRITICAL" : "WARNING"
      const message =
        daysLeft <= 0
          ? `SSL cert for ${website.domain} has expired`
          : `SSL cert for ${website.domain} expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`

      const existing = await prisma.alarm.findFirst({
        where: {
          clientId,
          type: "SSL_EXPIRY",
          status: { not: "RESOLVED" },
          message: { contains: website.domain },
        },
      })

      if (existing) {
        await prisma.alarm.update({
          where: { id: existing.id },
          data: { severity: severity as any, message, status: "ACTIVE" },
        })
      } else {
        await prisma.alarm.create({
          data: {
            clientId,
            severity: severity as any,
            type: "SSL_EXPIRY",
            message,
            details: `Issuer: ${sslIssuer ?? "unknown"} · Expires: ${sslExpiresAt.toDateString()}`,
          },
        })
      }
    }
  }

  // (a) DNS-change detection — compare the freshly-resolved snapshot against the
  // previously-stored one. Only meaningful when we actually got new data and
  // there was a prior snapshot to compare against.
  if (hasDns && website.dnsRecords) {
    const changed = diffDnsRecords(website.dnsRecords, dnsRecords)
    if (changed.length) {
      await createAlarm({
        clientId,
        severity: "WARNING",
        type: "DNS_CHANGE",
        message: `DNS records changed for ${website.domain}: ${changed.join(", ")}`,
        details:
          `Changed record type(s): ${changed.join(", ")}\n` +
          `Previous: ${JSON.stringify(website.dnsRecords)}\n` +
          `Current: ${JSON.stringify(dnsRecords)}`,
        dedupeKey: website.domain,
      })
    }
  }

  // (b) SPF / DKIM / DMARC posture — evaluate the records we just persisted (or
  // the retained snapshot on a transient resolver failure) and raise/clear a
  // per-check, per-domain alarm. DKIM is gated on MX presence (parked domains
  // aren't expected to publish DKIM and selectors are unknowable) to avoid noise;
  // SPF + DMARC are checked for every domain (anti-spoofing applies even to
  // non-sending domains).
  // Email-auth posture is always computed + persisted (and surfaced in the UI),
  // but the per-domain SPF/DKIM/DMARC ALARMS are opt-in (ENABLE_EMAIL_AUTH_ALARMS
  // =true). Default off so the first cron pass after deploy doesn't fan out a
  // burst of Teams/push for every domain missing strict records (the warranties-
  // flood lesson). DNS_CHANGE alarms above are event-driven and stay on.
  const effectiveRecords = (hasDns ? dnsRecords : website.dnsRecords) as Record<string, any> | null
  if (effectiveRecords && Object.keys(effectiveRecords).length && process.env.ENABLE_EMAIL_AUTH_ALARMS === "true") {
    const { spf, dkim, dmarc } = evaluateEmailAuth(effectiveRecords)
    const hasMx = Array.isArray(effectiveRecords.MX) && effectiveRecords.MX.length > 0
    await syncEmailAuthAlarm(clientId, "SPF_ISSUE", website.domain, spf)
    await syncEmailAuthAlarm(clientId, "DMARC_ISSUE", website.domain, dmarc)
    await syncEmailAuthAlarm(
      clientId,
      "DKIM_ISSUE",
      website.domain,
      hasMx ? dkim : { ok: true, severity: "INFO", detail: "No MX — DKIM not applicable" },
    )
  }

  return updated
}
