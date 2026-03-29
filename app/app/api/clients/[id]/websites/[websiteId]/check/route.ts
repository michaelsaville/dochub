import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth-options"
import { prisma } from "@/lib/prisma"
import { resolve4, resolve6, resolveMx, resolveNs, resolveTxt } from "dns/promises"

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

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; websiteId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id, websiteId } = await params

  const website = await prisma.website.findFirst({ where: { id: websiteId, clientId: id } })
  if (!website) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const [{ expiresAt, registrar }, dnsRecords] = await Promise.all([
    rdapLookup(website.domain),
    dnsLookup(website.domain),
  ])

  const updated = await prisma.website.update({
    where: { id: websiteId },
    data: { expiresAt, registrar, dnsRecords, lastChecked: new Date() },
  })

  // Alarm logic
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
          clientId: id,
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
            clientId: id,
            severity: severity as any,
            type: "DOMAIN_EXPIRY",
            message,
            details: `Registrar: ${registrar ?? "unknown"} · Expires: ${expiresAt.toDateString()}`,
          },
        })
      }
    }
  }

  return NextResponse.json(updated)
}
