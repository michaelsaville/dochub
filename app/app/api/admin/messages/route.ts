import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { listTemplates } from "@/lib/messaging/templates"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const { error } = await requireAuth("ADMIN")
  if (error) return error

  const url = new URL(req.url)
  const q = (url.searchParams.get("q") ?? "").trim()
  const templateFilter = (url.searchParams.get("template") ?? "").trim()

  const where: Record<string, unknown> = {}
  if (templateFilter) where.templateKey = templateFilter
  if (q) {
    where.OR = [
      { toEmail: { contains: q, mode: "insensitive" } },
      { toName: { contains: q, mode: "insensitive" } },
      { subject: { contains: q, mode: "insensitive" } },
    ]
  }

  const [log, totalSent, totalFailed] = await Promise.all([
    prisma.outboundMessage.findMany({
      where,
      orderBy: { sentAt: "desc" },
      take: 100,
    }),
    prisma.outboundMessage.count({ where: { status: "SENT" } }),
    prisma.outboundMessage.count({ where: { status: "FAILED" } }),
  ])

  const templates = listTemplates().map((t) => {
    let subject = ""
    let body = ""
    let renderError: string | null = null
    try {
      subject = t.subject(t.sampleVars)
      body = t.body(t.sampleVars)
    } catch (err) {
      renderError = err instanceof Error ? err.message : String(err)
    }
    return {
      key: t.key,
      name: t.name,
      description: t.description,
      category: t.category,
      sampleVars: t.sampleVars,
      subject,
      body,
      renderError,
    }
  })

  return NextResponse.json({ templates, log, totalSent, totalFailed })
}
