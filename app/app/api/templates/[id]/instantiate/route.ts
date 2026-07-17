import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"

// Fixed, allowlisted placeholder set. NO arbitrary evaluation — each token is a
// literal string replace, so template content can never execute or read fields
// outside this map.
function resolvePlaceholders(
  text: string | null | undefined,
  vars: { clientName: string; date: string; techName: string }
): string | null {
  if (!text) return text ?? null
  return text
    .split("{{client.name}}").join(vars.clientName)
    .split("{{date}}").join(vars.date)
    .split("{{tech.name}}").join(vars.techName)
}

type SeedStep = { title: string; notes?: string | null }

function coerceSteps(stepsJson: unknown): SeedStep[] {
  if (!Array.isArray(stepsJson)) return []
  return stepsJson
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
    .map((s) => ({
      title: typeof s.title === "string" ? s.title : "",
      notes: typeof s.notes === "string" ? s.notes : null,
    }))
    .filter((s) => s.title.trim().length > 0)
}

// POST /api/templates/[id]/instantiate
// Body: { clientId?, folderId?, overrides?: { title? } }
// Creates a real, independently-editable ClientDocument (DOCUMENT) or Runbook
// (RUNBOOK) from the template, stamping sourceTemplateId + bumping usageCount.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const clientId: string | null = body?.clientId || null
    const folderId: string | null = body?.folderId || null
    const titleOverride: string | null = body?.overrides?.title?.trim?.() || null

    const template = await prisma.template.findUnique({ where: { id } })
    if (!template || template.isArchived) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 })
    }

    const techName = session?.user?.name || session?.user?.email || "Technician"
    const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })

    // Resolve the client (needed for {{client.name}} + DOCUMENT scope check).
    let clientName = "the client"
    if (clientId) {
      const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } })
      if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 })
      clientName = client.name
    }

    const vars = { clientName, date: today, techName }
    const title = (titleOverride ? resolvePlaceholders(titleOverride, vars) : null)
      || resolvePlaceholders(template.titleTemplate, vars)
      || resolvePlaceholders(template.name, vars)
      || template.name
    const content = resolvePlaceholders(template.content, vars)

    // ── DOCUMENT ──────────────────────────────────────────────────────────────
    if (template.kind === "DOCUMENT") {
      if (!clientId) {
        return NextResponse.json({ error: "A client is required to create a document" }, { status: 400 })
      }
      if (!scopeAllows(await getClientScope(), clientId)) {
        return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })
      }
      const doc = await prisma.clientDocument.create({
        data: {
          clientId,
          folderId,
          title,
          content,
          category: template.defaultCategoryName || null,
          sourceTemplateId: template.id,
        },
        select: { id: true, clientId: true },
      })
      await prisma.template.update({ where: { id: template.id }, data: { usageCount: { increment: 1 } } })
      return NextResponse.json({
        id: doc.id,
        kind: "DOCUMENT",
        clientId: doc.clientId,
        redirect: `/clients/${doc.clientId}?tab=Documents&doc=${doc.id}`,
      }, { status: 201 })
    }

    // ── RUNBOOK ───────────────────────────────────────────────────────────────
    // clientId optional (null = global MSP SOP). If a client is supplied, gate it.
    if (clientId && !scopeAllows(await getClientScope(), clientId)) {
      return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })
    }

    // Upsert the RunbookCategory named by defaultCategoryName.
    let categoryId: string | null = null
    if (template.defaultCategoryName) {
      const cat = await prisma.runbookCategory.upsert({
        where: { name: template.defaultCategoryName },
        create: { name: template.defaultCategoryName },
        update: {},
      })
      categoryId = cat.id
    }

    // Ensure RunbookTag rows for each tag name; collect ids.
    const tagIds: string[] = []
    for (const raw of template.tagNames) {
      const name = raw.trim().toLowerCase()
      if (!name) continue
      const tag = await prisma.runbookTag.upsert({ where: { name }, create: { name }, update: {} })
      tagIds.push(tag.id)
    }

    const steps = coerceSteps(template.stepsJson).map((s, i) => ({
      order: i + 1,
      title: resolvePlaceholders(s.title, vars) || s.title,
      notes: resolvePlaceholders(s.notes, vars),
    }))

    const runbook = await prisma.runbook.create({
      data: {
        title,
        summary: resolvePlaceholders(template.summary, vars),
        content,
        categoryId,
        clientId,
        sourceTemplateId: template.id,
        tags: tagIds.length ? { create: tagIds.map((tid) => ({ tagId: tid })) } : undefined,
        steps: steps.length ? { create: steps } : undefined,
      },
      select: { id: true },
    })
    await prisma.template.update({ where: { id: template.id }, data: { usageCount: { increment: 1 } } })
    return NextResponse.json({
      id: runbook.id,
      kind: "RUNBOOK",
      clientId,
      redirect: `/runbooks/${runbook.id}/edit`,
    }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: "Failed to create from template" }, { status: 500 })
  }
}
