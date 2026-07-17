import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeAllows } from "@/lib/client-scope"
import { encrypt } from "@/lib/crypto"
import { writeAudit } from "@/lib/audit-log"
import {
  validateValue,
  coerceValue,
  isSecretField,
  deriveTitle,
  buildSearchText,
  stripSecretValues,
  secretState,
  type FlexFieldDef,
  type FlexValues,
} from "@/lib/flex-fields"
import { normalizeRelations } from "@/lib/flex-serialize"

/**
 * GET /api/flex-assets/[id] → one instance with resolved relation targets
 * (Person/Asset/Vendor/Client/FlexAsset names, missing targets skipped) and its
 * attachments. Scope-gated via the asset's clientId. Secret values stripped.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const asset = await prisma.flexAsset.findUnique({
      where: { id },
      include: {
        layout: { include: { fields: { orderBy: { position: "asc" } } } },
        client: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
        relations: true,
        attachments: {
          where: { supersededBy: null },
          orderBy: { createdAt: "desc" },
          select: {
            id: true, originalName: true, mimeType: true, detectedMime: true,
            size: true, notes: true, previewable: true, flexFieldKey: true, createdAt: true,
          },
        },
      },
    })
    if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 })

    if (!scopeAllows(await getClientScope(), asset.clientId)) {
      return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })
    }

    const fields = asset.layout.fields as unknown as FlexFieldDef[]
    const resolvedRelations = await resolveRelations(asset.relations)

    return NextResponse.json({
      id: asset.id,
      layoutId: asset.layoutId,
      clientId: asset.clientId,
      locationId: asset.locationId,
      title: asset.title,
      values: stripSecretValues(fields, asset.values as FlexValues),
      secretSet: secretState(fields, asset.values as FlexValues),
      archivedAt: asset.archivedAt,
      createdBy: asset.createdBy,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
      layout: {
        id: asset.layout.id, name: asset.layout.name, slug: asset.layout.slug,
        icon: asset.layout.icon, color: asset.layout.color, fields,
      },
      client: asset.client,
      location: asset.location ?? null,
      relations: resolvedRelations,
      attachments: asset.attachments,
    })
  } catch (e) {
    console.error("[flex-assets] detail failed", e)
    return NextResponse.json({ error: "Failed to fetch flexible asset" }, { status: 500 })
  }
}

/**
 * PATCH /api/flex-assets/[id] → partial value / relation / location update.
 * Only the value keys present in the body are changed; title + searchText are
 * re-derived. When `relations` is provided it REPLACES the asset's relation set.
 * Scope-gated via the asset's clientId.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const asset = await prisma.flexAsset.findUnique({
      where: { id },
      include: { layout: { include: { fields: { orderBy: { position: "asc" } } } } },
    })
    if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (!scopeAllows(await getClientScope(), asset.clientId)) {
      return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })
    }

    const body = await req.json()
    const fields = asset.layout.fields as unknown as FlexFieldDef[]
    const fieldByKey = new Map(fields.map((f) => [f.key, f]))
    const merged: FlexValues = { ...((asset.values as FlexValues) ?? {}) }

    // Partial value merge: validate + coerce only the keys present in the body.
    if (body?.values && typeof body.values === "object") {
      const errors: string[] = []
      for (const [key, raw] of Object.entries(body.values as FlexValues)) {
        const f = fieldByKey.get(key)
        if (!f || f.type === "header" || f.type === "relation" || f.type === "upload") continue
        const err = validateValue(f, raw)
        if (err) { errors.push(err); continue }
        const coerced = coerceValue(f, raw)
        if (coerced === null || coerced === undefined || coerced === "") {
          delete merged[key]
        } else {
          merged[key] = isSecretField(f) ? encrypt(String(coerced)) : coerced
        }
      }
      if (errors.length) return NextResponse.json({ error: "Validation failed", details: errors }, { status: 400 })
    }

    const title = deriveTitle(fields, merged, asset.layout.name)
    const searchText = buildSearchText(fields, merged)
    const locationId =
      body?.locationId === undefined ? asset.locationId : (body.locationId?.trim?.() || null)
    const replaceRelations = Array.isArray(body?.relations)
    const relationRows = replaceRelations ? normalizeRelations(body.relations) : []

    await prisma.$transaction(async (tx) => {
      await tx.flexAsset.update({
        where: { id },
        data: { values: merged as any, title, searchText, locationId },
      })
      if (replaceRelations) {
        await tx.flexAssetRelation.deleteMany({ where: { flexAssetId: id } })
        if (relationRows.length) {
          await tx.flexAssetRelation.createMany({
            data: relationRows.map((r) => ({ flexAssetId: id, ...r })),
          })
        }
      }
    })

    await writeAudit({
      action: "flex-asset.update",
      actorType: "STAFF",
      actorId: (session?.user as { id?: string })?.id ?? null,
      actorLabel: session?.user?.name ?? "unknown",
      entityType: "flex-asset",
      entityId: id,
      clientId: asset.clientId,
      summary: `Updated ${asset.layout.name} "${title}"`,
      metadata: { relationsReplaced: replaceRelations },
      ip: req.headers.get("x-forwarded-for"),
      userAgent: req.headers.get("user-agent"),
    })

    return NextResponse.json({
      id,
      title,
      values: stripSecretValues(fields, merged),
      secretSet: secretState(fields, merged),
    })
  } catch (e) {
    console.error("[flex-assets] update failed", e)
    return NextResponse.json({ error: "Failed to update flexible asset" }, { status: 500 })
  }
}

/**
 * DELETE /api/flex-assets/[id] → soft-delete (set archivedAt). Scope-gated.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const asset = await prisma.flexAsset.findUnique({
      where: { id },
      select: { id: true, clientId: true, title: true, archivedAt: true, layout: { select: { name: true } } },
    })
    if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (!scopeAllows(await getClientScope(), asset.clientId)) {
      return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })
    }

    await prisma.flexAsset.update({ where: { id }, data: { archivedAt: new Date() } })

    await writeAudit({
      action: "flex-asset.archive",
      actorType: "STAFF",
      actorId: (session?.user as { id?: string })?.id ?? null,
      actorLabel: session?.user?.name ?? "unknown",
      entityType: "flex-asset",
      entityId: id,
      clientId: asset.clientId,
      summary: `Archived ${asset.layout.name} "${asset.title}"`,
      ip: req.headers.get("x-forwarded-for"),
      userAgent: req.headers.get("user-agent"),
    })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Failed to archive flexible asset" }, { status: 500 })
  }
}

// ─── relation target resolution (defensive: missing targets skipped) ──────────
async function resolveRelations(
  relations: { id: string; fieldKey: string; targetType: string; targetId: string }[],
) {
  if (relations.length === 0) return []
  const byType = new Map<string, string[]>()
  for (const r of relations) {
    const arr = byType.get(r.targetType) ?? []
    arr.push(r.targetId)
    byType.set(r.targetType, arr)
  }

  const names = new Map<string, string>() // `${type}:${id}` → name
  const load = async (type: string, ids: string[]) => {
    if (ids.length === 0) return
    const uniq = Array.from(new Set(ids))
    let rows: { id: string; name: string }[] = []
    switch (type) {
      case "Person":
        rows = await prisma.person.findMany({ where: { id: { in: uniq } }, select: { id: true, name: true } })
        break
      case "Asset":
        rows = await prisma.asset.findMany({ where: { id: { in: uniq } }, select: { id: true, name: true } })
        break
      case "Vendor":
        rows = await prisma.vendor.findMany({ where: { id: { in: uniq } }, select: { id: true, name: true } })
        break
      case "Client":
        rows = await prisma.client.findMany({ where: { id: { in: uniq } }, select: { id: true, name: true } })
        break
      case "FlexAsset":
        rows = (await prisma.flexAsset.findMany({ where: { id: { in: uniq } }, select: { id: true, title: true } }))
          .map((f) => ({ id: f.id, name: f.title }))
        break
    }
    for (const row of rows) names.set(`${type}:${row.id}`, row.name)
  }

  await Promise.all(Array.from(byType.entries()).map(([type, ids]) => load(type, ids)))

  return relations
    .map((r) => {
      const name = names.get(`${r.targetType}:${r.targetId}`)
      if (name === undefined) return null // target deleted — skip (dangling row)
      return { id: r.id, fieldKey: r.fieldKey, targetType: r.targetType, targetId: r.targetId, targetName: name }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
}
