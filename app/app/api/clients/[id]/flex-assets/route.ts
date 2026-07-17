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
  secretState,
  type FlexFieldDef,
  type FlexValues,
} from "@/lib/flex-fields"
import { secretKeysFor, serializeListRow, normalizeRelations } from "@/lib/flex-serialize"

const COMPACT_LAYOUT = { select: { id: true, name: true, slug: true, icon: true, color: true } } as const

/**
 * GET /api/clients/[id]/flex-assets?layoutId= → non-archived Flexible Asset
 * instances for one client (optionally one layout). Scope-gated on the client.
 * Secret (password) values are stripped server-side; presence is signalled via
 * `secretSet` so the UI can offer a Reveal without exposing ciphertext.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    if (!scopeAllows(await getClientScope(), id)) {
      return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })
    }
    const layoutId = new URL(req.url).searchParams.get("layoutId")?.trim() || null

    const assets = await prisma.flexAsset.findMany({
      where: { clientId: id, archivedAt: null, ...(layoutId ? { layoutId } : {}) },
      orderBy: { updatedAt: "desc" },
      include: {
        layout: COMPACT_LAYOUT,
        location: { select: { id: true, name: true } },
        _count: { select: { relations: true, attachments: true } },
      },
    })

    const secretKeysByLayout = await secretKeysFor(assets.map((a) => a.layoutId))
    return NextResponse.json(assets.map((a) => serializeListRow(a, secretKeysByLayout.get(a.layoutId) ?? [])))
  } catch {
    return NextResponse.json({ error: "Failed to fetch flexible assets" }, { status: 500 })
  }
}

/**
 * POST /api/clients/[id]/flex-assets → create a FlexAsset. Scope-gated on the
 * client. Validates + coerces each value against its field type, ENCRYPTS
 * password values, writes the asset + relation rows in one transaction, and
 * derives title + searchText.
 *
 * Body: { layoutId, locationId?, values: {[key]:any}, relations?: [{fieldKey,targetType,targetId}] }
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireAuth()
  if (error) return error
  try {
    const { id: clientId } = await params
    if (!scopeAllows(await getClientScope(), clientId)) {
      return NextResponse.json({ error: "Not authorized for this client" }, { status: 403 })
    }

    const body = await req.json()
    const layoutId: string | undefined = body?.layoutId?.trim?.()
    if (!layoutId) return NextResponse.json({ error: "layoutId is required" }, { status: 400 })
    const locationId: string | null = body?.locationId?.trim?.() || null
    const inputValues: FlexValues = body?.values && typeof body.values === "object" ? body.values : {}
    const inputRelations: any[] = Array.isArray(body?.relations) ? body.relations : []

    const layout = await prisma.flexLayout.findUnique({
      where: { id: layoutId },
      include: { fields: { orderBy: { position: "asc" } } },
    })
    if (!layout) return NextResponse.json({ error: "Layout not found" }, { status: 400 })
    const fields = layout.fields as unknown as FlexFieldDef[]

    // Validate + build the stored values object (passwords encrypted).
    const errors: string[] = []
    const stored: FlexValues = {}
    for (const f of fields) {
      if (f.type === "header" || f.type === "upload") continue
      if (f.type === "relation") {
        if (f.required && !inputRelations.some((r) => r?.fieldKey === f.key && r?.targetId)) {
          errors.push(`${f.label} is required`)
        }
        continue
      }
      const raw = inputValues[f.key]
      const err = validateValue(f, raw)
      if (err) { errors.push(err); continue }
      const coerced = coerceValue(f, raw)
      if (coerced === null || coerced === undefined || coerced === "") continue
      stored[f.key] = isSecretField(f) ? encrypt(String(coerced)) : coerced
    }
    if (errors.length) return NextResponse.json({ error: "Validation failed", details: errors }, { status: 400 })

    const relationRows = normalizeRelations(inputRelations)
    const title = deriveTitle(fields, stored, layout.name)
    const searchText = buildSearchText(fields, stored)
    const createdBy = session?.user?.name ?? (session?.user as { id?: string })?.id ?? null

    const asset = await prisma.$transaction(async (tx) => {
      const created = await tx.flexAsset.create({
        data: {
          layoutId,
          clientId,
          locationId,
          title,
          values: stored as any,
          searchText,
          createdBy,
        },
      })
      if (relationRows.length) {
        await tx.flexAssetRelation.createMany({
          data: relationRows.map((r) => ({ flexAssetId: created.id, ...r })),
        })
      }
      return created
    })

    await writeAudit({
      action: "flex-asset.create",
      actorType: "STAFF",
      actorId: (session?.user as { id?: string })?.id ?? null,
      actorLabel: session?.user?.name ?? "unknown",
      entityType: "flex-asset",
      entityId: asset.id,
      clientId,
      summary: `Created ${layout.name} "${title}"`,
      metadata: { layoutId, relationCount: relationRows.length },
      ip: req.headers.get("x-forwarded-for"),
      userAgent: req.headers.get("user-agent"),
    })

    return NextResponse.json(
      {
        ...asset,
        values: undefined,
        secretSet: secretState(fields, stored),
        relationCount: relationRows.length,
      },
      { status: 201 },
    )
  } catch (e) {
    console.error("[flex-assets] create failed", e)
    return NextResponse.json({ error: "Failed to create flexible asset" }, { status: 500 })
  }
}
