import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

const include = { category: true }

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const template = await prisma.template.findUnique({ where: { id }, include })
    if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(template)
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch template" }, { status: 500 })
  }
}

const stepSchema = z.object({ title: z.string().min(1), notes: z.string().nullish() })

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullish(),
  categoryId: z.string().nullish(),
  titleTemplate: z.string().nullish(),
  summary: z.string().nullish(),
  content: z.string().nullish(),
  stepsJson: z.array(stepSchema).nullish(),
  tagNames: z.array(z.string()).nullish(),
  defaultCategoryName: z.string().nullish(),
  isPublished: z.boolean().optional(),
  isArchived: z.boolean().optional(),
})

// PATCH /api/templates/[id] — edit / publish / archive (ADMIN).
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth("ADMIN")
  if (error) return error
  try {
    const { id } = await params
    const parsed = patchSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid update", detail: parsed.error.flatten() }, { status: 400 })
    }
    const b = parsed.data
    const data: any = {}
    if (b.name !== undefined) data.name = b.name.trim()
    if (b.description !== undefined) data.description = b.description?.trim() || null
    if (b.categoryId !== undefined) data.categoryId = b.categoryId || null
    if (b.titleTemplate !== undefined) data.titleTemplate = b.titleTemplate?.trim() || null
    if (b.summary !== undefined) data.summary = b.summary?.trim() || null
    if (b.content !== undefined) data.content = b.content ?? null
    if (b.stepsJson !== undefined) {
      data.stepsJson = b.stepsJson
        ? b.stepsJson.map((s) => ({ title: s.title.trim(), notes: s.notes?.trim() || null }))
        : null
    }
    if (b.tagNames !== undefined) data.tagNames = (b.tagNames ?? []).map((t) => t.trim()).filter(Boolean)
    if (b.defaultCategoryName !== undefined) data.defaultCategoryName = b.defaultCategoryName?.trim() || null
    if (b.isPublished !== undefined) data.isPublished = b.isPublished
    if (b.isArchived !== undefined) data.isArchived = b.isArchived

    const template = await prisma.template.update({ where: { id }, data, include })
    return NextResponse.json(template)
  } catch (e) {
    return NextResponse.json({ error: "Failed to update template" }, { status: 500 })
  }
}

// DELETE /api/templates/[id] — ADMIN. Seed templates soft-archive (so a re-seed
// can restore them); user-created templates hard-delete.
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth("ADMIN")
  if (error) return error
  try {
    const { id } = await params
    const existing = await prisma.template.findUnique({ where: { id }, select: { isSeed: true } })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    if (existing.isSeed) {
      await prisma.template.update({ where: { id }, data: { isArchived: true } })
      return NextResponse.json({ success: true, archived: true })
    }
    await prisma.template.delete({ where: { id } })
    return NextResponse.json({ success: true, deleted: true })
  } catch (e) {
    return NextResponse.json({ error: "Failed to delete template" }, { status: 500 })
  }
}
