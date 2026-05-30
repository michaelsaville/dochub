import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyPortalHmac } from "@/lib/bff-hmac"
import { getPortalAccess, categoryAllowed } from "@/lib/portal-access"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const rawBody = await req.text()
  const verify = verifyPortalHmac(
    rawBody,
    req.headers.get("x-portal-signature"),
    req.headers.get("x-portal-timestamp"),
    process.env.PORTAL_BFF_SECRET ?? "",
  )
  if (!verify.ok) return NextResponse.json({ ok: false, error: verify.reason }, { status: verify.status })

  let payload: { clientId: string; portalUserId?: string }
  try { payload = JSON.parse(rawBody) } catch { return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 }) }
  if (!payload.clientId) return NextResponse.json({ ok: false, error: "clientId required" }, { status: 400 })

  const access = await getPortalAccess(payload.portalUserId, payload.clientId)
  if (access.mode === "denied") return NextResponse.json({ ok: false, error: "Not authorized for this client" }, { status: 403 })
  if (!categoryAllowed(access, "documents")) return NextResponse.json({ ok: true, documents: [] })

  const documents = await prisma.clientDocument.findMany({
    // Only docs explicitly shared to the portal — never expose internal
    // MSP runbooks/notes to the customer (default deny).
    where: { clientId: payload.clientId, portalVisible: true },
    select: {
      id: true,
      title: true,
      category: true,
      isPinned: true,
      updatedAt: true,
      folder: { select: { id: true, name: true } },
      _count: { select: { attachments: true } },
    },
    orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
  })

  return NextResponse.json({ ok: true, documents })
}
