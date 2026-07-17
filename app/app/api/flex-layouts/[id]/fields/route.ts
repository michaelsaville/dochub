import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { isValidFieldType, keyify, RELATION_TARGETS } from "@/lib/flex-fields"

type FieldInput = {
  id?: string
  key?: string
  label?: string
  type?: string
  required?: boolean
  showInList?: boolean
  useForTitle?: boolean
  hint?: string | null
  position?: number
  options?: string[]
  relationTarget?: string | null
  expires?: boolean
}

/**
 * PUT /api/flex-layouts/[id]/fields → replace the whole ordered field set in one
 * transaction (upsert by key, delete removed). ADMIN only.
 *
 * IMMUTABLE-KEY RULE: once instances exist, an existing field's `key` may not
 * change (values are keyed by it — a rename would orphan data). We detect a
 * rename via the field's stable `id`: if an incoming field carries an id that
 * matches a stored field whose key differs, we reject with 409. New fields
 * (no id) and pure deletions are still permitted.
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAuth("ADMIN")
  if (error) return error
  try {
    const { id: layoutId } = await params
    const layout = await prisma.flexLayout.findUnique({ where: { id: layoutId }, select: { id: true } })
    if (!layout) return NextResponse.json({ error: "Layout not found" }, { status: 404 })

    const body = await req.json()
    const rawFields: FieldInput[] = Array.isArray(body?.fields) ? body.fields : Array.isArray(body) ? body : []

    // Normalise + validate incoming fields.
    const seenKeys = new Set<string>()
    const fields = rawFields.map((f, i) => {
      const label = (f.label ?? "").trim()
      if (!label) throw new HttpError(400, `Field at position ${i} is missing a label`)
      const type = (f.type ?? "text").trim()
      if (!isValidFieldType(type)) throw new HttpError(400, `Unknown field type "${type}" (${label})`)
      const key = (f.key?.trim() || keyify(label))
      if (seenKeys.has(key)) throw new HttpError(400, `Duplicate field key "${key}"`)
      seenKeys.add(key)
      const relationTarget =
        type === "relation" ? (f.relationTarget?.trim() || null) : null
      if (type === "relation" && relationTarget && !RELATION_TARGETS.includes(relationTarget as any)) {
        throw new HttpError(400, `Invalid relationTarget "${relationTarget}" (${label})`)
      }
      return {
        id: f.id?.trim() || null,
        key,
        label,
        type,
        required: !!f.required,
        showInList: !!f.showInList,
        useForTitle: !!f.useForTitle,
        hint: f.hint?.toString().trim() || null,
        position: f.position !== undefined ? Number(f.position) || 0 : i,
        options: Array.isArray(f.options) ? f.options.map((o) => String(o)).filter((o) => o.length > 0) : [],
        relationTarget,
        expires: !!f.expires,
      }
    })

    const existing = await prisma.flexLayoutField.findMany({ where: { layoutId } })
    const existingById = new Map(existing.map((e) => [e.id, e]))
    const instanceCount = await prisma.flexAsset.count({ where: { layoutId } })

    // Immutable-key enforcement (only once instances exist).
    if (instanceCount > 0) {
      for (const f of fields) {
        if (f.id) {
          const ex = existingById.get(f.id)
          if (ex && ex.key !== f.key) {
            return NextResponse.json(
              { error: `Field key is locked once instances exist ("${ex.key}" → "${f.key}"). Rename the label instead.` },
              { status: 409 },
            )
          }
        }
      }
    }

    const incomingKeys = new Set(fields.map((f) => f.key))

    await prisma.$transaction(async (tx) => {
      // Delete fields whose key is no longer present.
      await tx.flexLayoutField.deleteMany({
        where: { layoutId, key: { notIn: Array.from(incomingKeys) } },
      })
      // Upsert each incoming field by (layoutId, key).
      for (const f of fields) {
        await tx.flexLayoutField.upsert({
          where: { layoutId_key: { layoutId, key: f.key } },
          create: {
            layoutId,
            key: f.key,
            label: f.label,
            type: f.type,
            required: f.required,
            showInList: f.showInList,
            useForTitle: f.useForTitle,
            hint: f.hint,
            position: f.position,
            options: f.options,
            relationTarget: f.relationTarget,
            expires: f.expires,
          },
          update: {
            label: f.label,
            type: f.type,
            required: f.required,
            showInList: f.showInList,
            useForTitle: f.useForTitle,
            hint: f.hint,
            position: f.position,
            options: f.options,
            relationTarget: f.relationTarget,
            expires: f.expires,
          },
        })
      }
    })

    const saved = await prisma.flexLayoutField.findMany({
      where: { layoutId },
      orderBy: { position: "asc" },
    })
    return NextResponse.json(saved)
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: "Failed to save fields" }, { status: 500 })
  }
}

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}
