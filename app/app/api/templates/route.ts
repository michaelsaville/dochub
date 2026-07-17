import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

const include = { category: true }

// GET /api/templates?kind=&categoryId=&search=&includeArchived=
// Picker/gallery list. Defaults to published, non-archived. includeArchived=true
// is the ADMIN-manager view (all templates regardless of published/archived).
export async function GET(req: Request) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { searchParams } = new URL(req.url)
    const kind = searchParams.get("kind")
    const categoryId = searchParams.get("categoryId")
    const search = searchParams.get("search")
    const includeArchived = searchParams.get("includeArchived") === "true"

    const where: any = {}
    if (!includeArchived) {
      where.isArchived = false
      where.isPublished = true
    }
    if (kind === "DOCUMENT" || kind === "RUNBOOK") where.kind = kind
    if (categoryId) where.categoryId = categoryId
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ]
    }

    const templates = await prisma.template.findMany({
      where,
      include,
      orderBy: [{ usageCount: "desc" }, { name: "asc" }],
    })
    return NextResponse.json(templates)
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch templates" }, { status: 500 })
  }
}

const stepSchema = z.object({
  title: z.string().min(1),
  notes: z.string().nullish(),
})

const createSchema = z.object({
  kind: z.enum(["DOCUMENT", "RUNBOOK"]),
  name: z.string().min(1),
  description: z.string().nullish(),
  categoryId: z.string().nullish(),
  titleTemplate: z.string().nullish(),
  summary: z.string().nullish(),
  content: z.string().nullish(),
  stepsJson: z.array(stepSchema).nullish(),
  tagNames: z.array(z.string()).nullish(),
  defaultCategoryName: z.string().nullish(),
  isPublished: z.boolean().optional(),
})

// POST /api/templates — create a template (ADMIN).
export async function POST(req: Request) {
  const { error } = await requireAuth("ADMIN")
  if (error) return error
  try {
    const parsed = createSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid template", detail: parsed.error.flatten() }, { status: 400 })
    }
    const b = parsed.data
    const steps = b.stepsJson?.map((s) => ({ title: s.title.trim(), notes: s.notes?.trim() || null })) ?? null

    const template = await prisma.template.create({
      data: {
        kind: b.kind,
        name: b.name.trim(),
        description: b.description?.trim() || null,
        categoryId: b.categoryId || null,
        titleTemplate: b.titleTemplate?.trim() || null,
        summary: b.summary?.trim() || null,
        content: b.content ?? null,
        stepsJson: b.kind === "RUNBOOK" && steps ? steps : undefined,
        tagNames: b.kind === "RUNBOOK" ? (b.tagNames ?? []).map((t) => t.trim()).filter(Boolean) : [],
        defaultCategoryName: b.defaultCategoryName?.trim() || null,
        isPublished: b.isPublished ?? true,
        isSeed: false,
      },
      include,
    })
    return NextResponse.json(template, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: "Failed to create template" }, { status: 500 })
  }
}
