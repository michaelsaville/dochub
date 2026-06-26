import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { readSignedBody, authorizeClientUser } from "../_helpers"
import { buildVisibilityWhere } from "../../vault/_helpers"

export const dynamic = "force-dynamic"

interface Payload {
  clientId: string
  portalUserId: string
  isPortalOwner?: boolean
}

/**
 * POST /api/bff/portal/dochub/client-vendor/shareable  (HMAC-signed)
 *
 * The set of items a CLIENT portal user is ALLOWED to share with a vendor:
 * portalVisible documents + portalVisible files + the vault credentials this
 * user can see. No secret material is returned.
 */
export async function POST(req: Request) {
  const r = await readSignedBody<Payload>(req)
  if (!r.ok) return r.res

  const auth = await authorizeClientUser(r.body)
  if (!auth.ok) return auth.res
  const { actor } = auth

  const [documents, files, credentials] = await Promise.all([
    prisma.clientDocument.findMany({
      where: { clientId: actor.clientId, portalVisible: true },
      select: { id: true, title: true, category: true },
      orderBy: { title: "asc" },
    }),
    prisma.clientAttachment.findMany({
      where: {
        clientId: actor.clientId,
        supersededBy: null,
        OR: [{ portalVisible: true }, { document: { portalVisible: true } }],
      },
      select: { id: true, originalName: true, mimeType: true, detectedMime: true, size: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.portalCredential.findMany({
      where: buildVisibilityWhere({
        clientId: actor.clientId,
        portalUserId: actor.portalUserId,
        isPortalOwner: actor.owner,
      }),
      select: { id: true, label: true, username: true, url: true },
      orderBy: { label: "asc" },
    }),
  ])

  return NextResponse.json({ ok: true, documents, files, credentials })
}
