import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createAlarm } from "@/lib/alarms"

export async function GET(req: Request) {
  const auth = req.headers.get("authorization")
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const websites = await prisma.website.findMany({
    where: { uptimeEnabled: true },
    include: { client: { select: { id: true, name: true } } },
  })

  const results: { domain: string; status: number | null; responseMs: number | null; up: boolean; error?: string }[] = []

  for (const site of websites) {
    const url = site.domain.startsWith("http") ? site.domain : `https://${site.domain}`
    const start = Date.now()
    let status: number | null = null
    let up = false
    let errorMsg: string | undefined

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)
      const res = await fetch(url, {
        method: "HEAD",
        redirect: "follow",
        signal: controller.signal,
        headers: { "User-Agent": "DocHub-Uptime/1.0" },
      })
      clearTimeout(timeout)
      status = res.status
      up = status >= 200 && status < 400
    } catch (e: any) {
      errorMsg = e.name === "AbortError" ? "Timeout (10s)" : e.message
      up = false
    }

    const responseTimeMs = Date.now() - start
    const wasUp = site.isUp

    await prisma.website.update({
      where: { id: site.id },
      data: {
        httpStatus: status,
        responseTimeMs,
        isUp: up,
        uptimeCheckedAt: new Date(),
        ...(up && !wasUp ? { lastUpAt: new Date() } : {}),
        ...(!up && wasUp ? { lastDownAt: new Date() } : {}),
      },
    })

    // Alert on status change
    if (!up && wasUp) {
      await createAlarm({
        clientId: site.client.id,
        severity: "CRITICAL",
        type: "Site Down",
        message: `${site.domain} is down${status ? ` (HTTP ${status})` : ""}: ${errorMsg || "unreachable"}`,
      })
    }
    if (up && !wasUp) {
      // Auto-resolve "Site Down" alarms for this domain
      const activeAlarms = await prisma.alarm.findMany({
        where: { clientId: site.client.id, type: "Site Down", status: "ACTIVE", message: { contains: site.domain } },
      })
      for (const alarm of activeAlarms) {
        await prisma.alarm.update({
          where: { id: alarm.id },
          data: { status: "RESOLVED", resolvedAt: new Date() },
        })
      }
    }

    results.push({ domain: site.domain, status, responseMs: responseTimeMs, up, error: errorMsg })
  }

  return NextResponse.json({ success: true, checked: results.length, results })
}
