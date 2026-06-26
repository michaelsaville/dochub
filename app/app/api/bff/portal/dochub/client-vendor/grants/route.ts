import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { readSignedBody, authorizeClientUser, CLIENT_MANAGEABLE_TYPES } from "../_helpers"

export const dynamic = "force-dynamic"

interface Payload {
  clientId: string
  portalUserId: string
  isPortalOwner?: boolean
}

/**
 * POST /api/bff/portal/dochub/client-vendor/grants  (HMAC-signed)
 *
 * Active vendor grants for this client, each with the items the CLIENT may
 * manage (DOCUMENT / ATTACHMENT / PORTAL_CREDENTIAL). Internal CREDENTIAL
 * shares (staff-managed) are never listed here. Each share is enriched with a
 * display label so the UI can show "this vendor can see X" without a second
 * round-trip.
 */
export async function POST(req: Request) {
  const r = await readSignedBody<Payload>(req)
  if (!r.ok) return r.res

  const auth = await authorizeClientUser(r.body)
  if (!auth.ok) return auth.res
  const { actor } = auth

  const grants = await prisma.vendorClientGrant.findMany({
    where: { clientId: actor.clientId, isActive: true },
    select: {
      id: true,
      label: true,
      vendor: { select: { id: true, name: true } },
      shares: {
        // Only shares the CLIENT created. Staff-created doc/file shares
        // (createdByPortalUserId null) belong to the staff surface — the
        // client neither sees nor manages them, same as internal credentials.
        where: { itemType: { in: [...CLIENT_MANAGEABLE_TYPES] }, createdByPortalUserId: { not: null } },
        select: {
          id: true,
          itemType: true,
          itemId: true,
          note: true,
          createdAt: true,
          createdByPortalUserId: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  })

  // Batch-resolve display labels for every shared item across all grants.
  const docIds: string[] = []
  const fileIds: string[] = []
  const credIds: string[] = []
  for (const g of grants) {
    for (const s of g.shares) {
      if (s.itemType === "DOCUMENT") docIds.push(s.itemId)
      else if (s.itemType === "ATTACHMENT") fileIds.push(s.itemId)
      else if (s.itemType === "PORTAL_CREDENTIAL") credIds.push(s.itemId)
    }
  }

  const [docs, files, creds] = await Promise.all([
    docIds.length
      ? prisma.clientDocument.findMany({ where: { id: { in: docIds }, clientId: actor.clientId }, select: { id: true, title: true } })
      : [],
    fileIds.length
      ? prisma.clientAttachment.findMany({ where: { id: { in: fileIds }, clientId: actor.clientId }, select: { id: true, originalName: true } })
      : [],
    credIds.length
      ? prisma.portalCredential.findMany({ where: { id: { in: credIds }, clientId: actor.clientId }, select: { id: true, label: true } })
      : [],
  ])

  const labels = new Map<string, string>()
  for (const d of docs) labels.set(d.id, d.title)
  for (const f of files) labels.set(f.id, f.originalName)
  for (const c of creds) labels.set(c.id, c.label)

  return NextResponse.json({
    ok: true,
    grants: grants.map((g) => ({
      id: g.id,
      label: g.label,
      vendor: g.vendor,
      shares: g.shares.map((s) => ({
        id: s.id,
        itemType: s.itemType,
        itemId: s.itemId,
        note: s.note,
        createdAt: s.createdAt,
        managedByClient: !!s.createdByPortalUserId,
        label: labels.get(s.itemId) ?? "(item no longer available)",
      })),
    })),
  })
}
