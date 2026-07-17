import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { getClientScope, scopeWhere } from "@/lib/client-scope"
import { secretKeysFor, serializeListRow } from "@/lib/flex-serialize"

/**
 * GET /api/flex-assets?layoutId= → cross-client index of non-archived instances,
 * scoped to the caller's allowed clients. Backs the /flex/[slug] index page.
 * Secret values stripped server-side.
 */
export async function GET(req: Request) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const layoutId = new URL(req.url).searchParams.get("layoutId")?.trim() || null
    const scope = await getClientScope()

    const assets = await prisma.flexAsset.findMany({
      where: {
        archivedAt: null,
        ...(layoutId ? { layoutId } : {}),
        ...scopeWhere(scope, "clientId"),
      },
      orderBy: { updatedAt: "desc" },
      include: {
        layout: { select: { id: true, name: true, slug: true, icon: true, color: true } },
        client: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
        _count: { select: { relations: true, attachments: true } },
      },
      take: 500,
    })

    const secretKeysByLayout = await secretKeysFor(assets.map((a) => a.layoutId))
    return NextResponse.json(assets.map((a) => serializeListRow(a, secretKeysByLayout.get(a.layoutId) ?? [])))
  } catch {
    return NextResponse.json({ error: "Failed to fetch flexible assets" }, { status: 500 })
  }
}
