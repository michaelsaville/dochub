import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { slugify } from "@/lib/flex-fields"

/**
 * GET /api/flex-layouts → active Flexible Asset layouts with field + instance
 * counts, for nav / the layout picker. Any authed staff.
 */
export async function GET() {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const layouts = await prisma.flexLayout.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { fields: true, assets: true } } },
    })
    return NextResponse.json(
      layouts.map((l) => ({
        id: l.id,
        name: l.name,
        slug: l.slug,
        icon: l.icon,
        color: l.color,
        description: l.description,
        sortOrder: l.sortOrder,
        isActive: l.isActive,
        showInNav: l.showInNav,
        fieldCount: l._count.fields,
        assetCount: l._count.assets,
      })),
    )
  } catch {
    return NextResponse.json({ error: "Failed to fetch layouts" }, { status: 500 })
  }
}

/**
 * POST /api/flex-layouts → create a layout. ADMIN only. Derives a unique slug
 * from the name (slug is immutable/stable afterwards so /flex/[slug] deep-links
 * never break on a later rename). Fields are managed via PUT .../fields.
 */
export async function POST(req: Request) {
  const { error } = await requireAuth("ADMIN")
  if (error) return error
  try {
    const body = await req.json()
    const { name, icon, color, description, sortOrder, showInNav } = body
    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }

    // Derive a unique slug: base, then base-2, base-3, …
    const base = slugify(name)
    let slug = base
    let n = 2
    while (await prisma.flexLayout.findUnique({ where: { slug }, select: { id: true } })) {
      slug = `${base}-${n++}`
    }

    const layout = await prisma.flexLayout.create({
      data: {
        name: name.trim(),
        slug,
        ...(icon?.trim() && { icon: icon.trim() }),
        ...(color?.trim() && { color: color.trim() }),
        description: description?.trim() || null,
        ...(sortOrder !== undefined && { sortOrder: Number(sortOrder) || 0 }),
        ...(showInNav !== undefined && { showInNav: !!showInNav }),
      },
    })
    return NextResponse.json(layout, { status: 201 })
  } catch {
    return NextResponse.json({ error: "Failed to create layout" }, { status: 500 })
  }
}
