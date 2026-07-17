import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

const bodySchema = z.object({
  kind: z.enum(["DOCUMENT", "RUNBOOK"]),
  sourceId: z.string().min(1),
  name: z.string().nullish(), // optional override for the template label
})

// POST /api/templates/from-existing — "designate as template" (Hudu-style).
// Copies an existing Runbook / ClientDocument into a NEW reusable Template
// (isSeed=false). The source record is untouched.
export async function POST(req: Request) {
  const { error } = await requireAuth("ADMIN")
  if (error) return error
  try {
    const parsed = bodySchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request", detail: parsed.error.flatten() }, { status: 400 })
    }
    const { kind, sourceId } = parsed.data
    const nameOverride = parsed.data.name?.trim() || null

    if (kind === "RUNBOOK") {
      const rb = await prisma.runbook.findUnique({
        where: { id: sourceId },
        include: {
          category: { select: { name: true } },
          tags: { include: { tag: { select: { name: true } } } },
          steps: { orderBy: { order: "asc" } },
        },
      })
      if (!rb) return NextResponse.json({ error: "Source runbook not found" }, { status: 404 })

      const template = await prisma.template.create({
        data: {
          kind: "RUNBOOK",
          name: nameOverride || rb.title,
          description: rb.summary || null,
          titleTemplate: rb.title,
          summary: rb.summary || null,
          content: rb.content || null,
          stepsJson: rb.steps.length ? rb.steps.map((s) => ({ title: s.title, notes: s.notes || null })) : undefined,
          tagNames: rb.tags.map((t) => t.tag.name),
          defaultCategoryName: rb.category?.name || null,
          isSeed: false,
        },
        include: { category: true },
      })
      return NextResponse.json(template, { status: 201 })
    }

    // DOCUMENT
    const doc = await prisma.clientDocument.findUnique({
      where: { id: sourceId },
      select: { title: true, content: true, category: true },
    })
    if (!doc) return NextResponse.json({ error: "Source document not found" }, { status: 404 })

    const template = await prisma.template.create({
      data: {
        kind: "DOCUMENT",
        name: nameOverride || doc.title,
        titleTemplate: doc.title,
        content: doc.content || null,
        defaultCategoryName: doc.category || null,
        isSeed: false,
      },
      include: { category: true },
    })
    return NextResponse.json(template, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: "Failed to create template from record" }, { status: 500 })
  }
}
