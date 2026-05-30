import { prisma } from "@/lib/prisma"
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

async function dnsLookup(domain: string): Promise<Record<string, any>> {
  const [aRes, aaaaRes, mxRes, nsRes, txtRes] = await Promise.allSettled([
    resolve4(domain),
    resolve6(domain),
    resolveMx(domain),
    resolveNs(domain),
    resolveTxt(domain),
  ])
  const records: Record<string, any> = {}
  if (aRes.status === "fulfilled" && aRes.value.length) records.A = aRes.value
  if (aaaaRes.status === "fulfilled" && aaaaRes.value.length) records.AAAA = aaaaRes.value
  if (mxRes.status === "fulfilled" && mxRes.value.length) records.MX = mxRes.value
  if (nsRes.status === "fulfilled" && nsRes.value.length) records.NS = nsRes.value
  if (txtRes.status === "fulfilled" && txtRes.value.length) records.TXT = txtRes.value.flat()
  return records
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

  return updated
}
