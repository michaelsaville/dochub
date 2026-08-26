import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyPortalHmac } from "@/lib/bff-hmac"

/**
 * POST /api/bff/mindhub/targets  (HMAC-signed, cross-app)
 *
 * Read-only. Fills MindHub's "send this note to..." picker: the client list,
 * and — once a client is chosen — that client's assets and document folders.
 *
 * Signed with MINDHUB_BFF_SECRET, its own key rather than PORTAL_BFF_SECRET or
 * JOTTER_BFF_SECRET. MindHub is a personal capture app; a leak there must not
 * hand anyone the portal's credentials. Same scheme, separate key — see
 * pattern_portal_bff.md.
 *
 * Only reads. Everything that writes is in ../push, so there is one file to
 * look at when asking what MindHub can do to this database.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const rawBody = await req.text()
  const verify = verifyPortalHmac(
    rawBody,
    req.headers.get("x-mindhub-signature"),
    req.headers.get("x-mindhub-timestamp"),
    process.env.MINDHUB_BFF_SECRET ?? "",
  )
  if (!verify.ok) {
    return NextResponse.json({ ok: false, error: verify.reason }, { status: verify.status })
  }

  let payload: { clientId?: unknown; q?: unknown }
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 })
  }

  const clientId = typeof payload.clientId === "string" ? payload.clientId.trim() : ""
  const q = typeof payload.q === "string" ? payload.q.trim() : ""

  if (!clientId) {
    const clients = await prisma.client.findMany({
      where: {
        isActive: true,
        ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
      },
      orderBy: { name: "asc" },
      take: 50,
      select: { id: true, name: true },
    })
    return NextResponse.json({ ok: true, clients })
  }

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, name: true },
  })
  if (!client) {
    return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 })
  }

  const [assets, folders] = await Promise.all([
    // Assets hang off Location, not Client, so the client boundary is applied
    // through the location — the same join the vault and portal routes use.
    prisma.asset.findMany({
      where: { location: { clientId: client.id }, status: "ACTIVE" },
      orderBy: [{ name: "asc" }],
      take: 100,
      select: {
        id: true,
        name: true,
        category: true,
        location: { select: { id: true, name: true } },
      },
    }),
    prisma.documentFolder.findMany({
      where: { clientId: client.id },
      orderBy: { name: "asc" },
      take: 50,
      select: { id: true, name: true },
    }),
  ])

  return NextResponse.json({ ok: true, client, assets, folders })
}
